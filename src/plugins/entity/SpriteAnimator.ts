import type { Texture } from 'pixi.js';
import { Sprite } from 'pixi.js';
import type { Core } from '../../core/Core.js';
import type { EnginePlugin } from '../../types/plugin.js';
import type { CoreUpdateParams } from '../../types/rendering.js';
import type {
  Entity,
  AnimatorDefineParams,
  AnimatorPlayParams,
  AnimatorStopParams,
} from '../../types/entity.js';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface AnimationDef {
  frames: Texture[];
  frameDuration: number;
  loop: boolean;
}

interface PlaybackState {
  def: AnimationDef;
  /** Current frame index. */
  frameIndex: number;
  /** Ticks accumulated towards the next frame advance. */
  elapsed: number;
  /** Whether this playback has finished (non-looping). */
  finished: boolean;
}

// ---------------------------------------------------------------------------
// SpriteAnimator
// ---------------------------------------------------------------------------

/**
 * Frame-based sprite animation player.
 *
 * Works in concert with {@link EntityManager}: each animated entity's display
 * object is expected to be (or contain) a `Sprite` whose texture is swapped
 * every N fixed ticks according to an animation definition.
 *
 * ### Workflow
 * 1. **Define** named animations (once).
 * 2. **Play** an animation on an entity (by entity ID).
 * 3. The animator advances frames automatically every `core/update`.
 *
 * ### Direct API
 * ```ts
 * animator.define('goblin-walk', { frames: [tex0, tex1, tex2], frameDuration: 8, loop: true });
 * animator.play(entity, 'goblin-walk');
 * animator.stop(entity);
 * ```
 *
 * ### EventBus API
 * | Event             | Params                  |
 * |-------------------|-------------------------|
 * | `animator/define`  | `AnimatorDefineParams`  |
 * | `animator/play`    | `AnimatorPlayParams`    |
 * | `animator/stop`    | `AnimatorStopParams`    |
 *
 * When a non-looping animation finishes, `animator/finished` is emitted with
 * `{ entityId, animation }`.
 */
export class SpriteAnimator implements EnginePlugin {
  readonly namespace = 'spriteAnimator';
  readonly editorMeta = {
    displayName: 'Sprite Animator',
    icon: 'spriteAnimator',
    description: 'Drives frame-based sprite animations on entities.',
    events: ['animator/define', 'animator/play', 'animator/stop'] as const,
  };

  private _core: Core | null = null;

  /** Named animation definitions (shared across entities). */
  private readonly _defs: Map<string, AnimationDef> = new Map();

  /** Active playback state per entity. */
  private readonly _playing: Map<Entity, PlaybackState> = new Map();

  /** Reverse lookup: entity ID → Entity reference (so EventBus can use string IDs). */
  private _entityLookup: ((id: string) => Entity | undefined) | null = null;

  // ---------------------------------------------------------------------------
  // Plugin lifecycle
  // ---------------------------------------------------------------------------

  init(core: Core): void {
    this._core = core;

    // Advance animations each fixed update.
    core.events.on(this.namespace, 'core/update', this._onUpdate, { priority: -20 });

    // ── EventBus API ───────────────────────────────────────────────────
    core.events.on(this.namespace, 'animator/define', (params: AnimatorDefineParams) => {
      this.defineFromKeys(params.name, params.def);
    });

    core.events.on(this.namespace, 'animator/play', (params: AnimatorPlayParams) => {
      const entity = this._resolveEntity(params.entityId);
      if (entity) this.play(entity, params.animation);
    });

    core.events.on(this.namespace, 'animator/stop', (params: AnimatorStopParams) => {
      const entity = this._resolveEntity(params.entityId);
      if (entity) this.stop(entity);
    });

    // Clean up playback when an entity is destroyed.
    core.events.on(this.namespace, 'entity/destroyed', (params: { entity: Entity }) => {
      this._playing.delete(params.entity);
    });
  }

  destroy(): void {
    this._defs.clear();
    this._playing.clear();
    this._entityLookup = null;
    this._core?.events.removeNamespace(this.namespace);
    this._core = null;
  }

  // ---------------------------------------------------------------------------
  // Public API — definitions
  // ---------------------------------------------------------------------------

  /**
   * Register an animation with pre-resolved `Texture` objects.
   */
  define(name: string, def: { frames: Texture[]; frameDuration: number; loop: boolean }): void {
    this._defs.set(name, {
      frames: def.frames,
      frameDuration: def.frameDuration,
      loop: def.loop,
    });
  }

  /**
   * Register an animation using texture keys (resolved via `assets/get` event).
   * Falls back to storing string keys as-is if no ResourceManager is available;
   * the frames are resolved lazily on first play.
   */
  defineFromKeys(
    name: string,
    def: { frames: string[]; frameDuration: number; loop: boolean },
  ): void {
    const textures = this._resolveTextures(def.frames);
    this._defs.set(name, {
      frames: textures,
      frameDuration: def.frameDuration,
      loop: def.loop,
    });
  }

  /**
   * Check whether an animation definition exists.
   */
  hasDef(name: string): boolean {
    return this._defs.has(name);
  }

  // ---------------------------------------------------------------------------
  // Public API — playback
  // ---------------------------------------------------------------------------

  /**
   * Start playing a named animation on an entity.
   * If the entity's display is a `Sprite`, its texture is swapped directly.
   * Otherwise a child `Sprite` labelled `__animSprite` is created.
   */
  play(entity: Entity, animationName: string): void {
    const def = this._defs.get(animationName);
    if (!def) {
      throw new Error(
        `[SpriteAnimator] Unknown animation "${animationName}". Define it first.`,
      );
    }
    if (def.frames.length === 0) return;

    this._playing.set(entity, {
      def,
      frameIndex: 0,
      elapsed: 0,
      finished: false,
    });

    // Apply the first frame immediately.
    this._applyFrame(entity, def.frames[0]);
  }

  /**
   * Stop animation on an entity (freezes on current frame).
   */
  stop(entity: Entity): void {
    this._playing.delete(entity);
  }

  /**
   * Check whether an entity is currently playing an animation.
   */
  isPlaying(entity: Entity): boolean {
    return this._playing.has(entity) && !this._playing.get(entity)!.finished;
  }

  /**
   * Provide a lookup function so the EventBus string-based API can resolve
   * entity IDs to Entity objects.  Typically called once with
   * `entityManager.get.bind(entityManager)`.
   */
  setEntityLookup(fn: (id: string) => Entity | undefined): void {
    this._entityLookup = fn;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private _resolveEntity(id: string): Entity | undefined {
    if (this._entityLookup) return this._entityLookup(id);

    // Fallback: ask EntityManager via EventBus.
    const result = this._core?.events.emitSync('entity/query', { tags: [] }) as
      | { output: { entities: Entity[] } }
      | undefined;
    return result?.output.entities.find(e => e.id === id);
  }

  private _resolveTextures(keys: string[]): Texture[] {
    const textures: Texture[] = [];
    for (const key of keys) {
      const result = this._core?.events.emitSync('assets/get', { key }) as
        | { output: { asset: Texture } }
        | undefined;
      const tex = result?.output?.asset;
      if (tex) {
        textures.push(tex);
      } else {
        // Store a placeholder; the caller is responsible for loading assets
        // before playing.  We push `undefined as Texture` to keep indices
        // aligned — play() will show nothing for missing frames.
        textures.push(undefined as unknown as Texture);
      }
    }
    return textures;
  }

  private _applyFrame(entity: Entity, texture: Texture): void {
    if (!texture) return;

    const display = entity.display;

    // If the display object is already a Sprite, swap texture directly.
    if (display instanceof Sprite) {
      display.texture = texture;
      return;
    }

    // Otherwise, look for or create a child sprite.
    let animSprite = display.getChildByLabel('__animSprite') as Sprite | null;
    if (!animSprite) {
      animSprite = new Sprite(texture);
      animSprite.label = '__animSprite';
      display.addChild(animSprite);
    } else {
      animSprite.texture = texture;
    }
  }

  private readonly _onUpdate = (_params: CoreUpdateParams): void => {
    for (const [entity, state] of this._playing) {
      if (state.finished) continue;

      state.elapsed += 1; // 1 fixed tick

      if (state.elapsed >= state.def.frameDuration) {
        state.elapsed = 0;
        state.frameIndex += 1;

        if (state.frameIndex >= state.def.frames.length) {
          if (state.def.loop) {
            state.frameIndex = 0;
          } else {
            state.frameIndex = state.def.frames.length - 1;
            state.finished = true;
            this._core?.events.emitSync('animator/finished', {
              entityId: entity.id,
              animation: state.def,
            });
            continue;
          }
        }

        this._applyFrame(entity, state.def.frames[state.frameIndex]);
      }
    }
  };
}
