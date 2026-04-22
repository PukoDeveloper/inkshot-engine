import type { Core } from '../../core/Core.js';
import type { EnginePlugin } from '../../types/plugin.js';
import type {
  SceneDescriptor,
  SceneRegisterParams,
  SceneLoadParams,
  SceneCurrentOutput,
  SceneChangedParams,
} from '../../types/scene.js';

/**
 * Built-in plugin that manages scene registration and transitions.
 *
 * A **scene** is the primary unit of level / room in the game.  Each scene
 * declares a unique `key` and implements `enter` / `exit` lifecycle hooks
 * that are called automatically when the scene becomes active or is replaced.
 *
 * `SceneManager` is intentionally thin — it orchestrates the lifecycle and
 * emits notifications, but delegates all game-specific concerns (asset
 * loading, entity spawning, UI setup …) to the scene implementations and to
 * other plugins that react to `scene/changed`.
 *
 * ---
 *
 * ### Event contract
 *
 * | Event            | Phase  | Params / Output                              | What SceneManager does |
 * |------------------|--------|----------------------------------------------|------------------------|
 * | `scene/register` | main   | {@link SceneRegisterParams}                  | Stores the descriptor in the scene registry |
 * | `scene/load`     | main   | {@link SceneLoadParams}                      | Exits the current scene, enters the new one, emits `scene/changed` |
 * | `scene/current`  | main   | — / {@link SceneCurrentOutput}               | Writes the current scene key into `output.key` |
 *
 * The `scene/load` event fires the full three-phase pipeline:
 * - **`before`** — Use this phase to play a transition / fade-out effect.
 * - **`main`**   — SceneManager exits the old scene and enters the new one.
 * - **`after`**  — Use this phase to play a fade-in effect.
 *
 * After `scene/load` completes, `scene/changed` is emitted with `{ from, to }`.
 *
 * ---
 *
 * ### Usage
 *
 * ```ts
 * import { createEngine, SceneManager } from 'inkshot-engine';
 * import type { SceneDescriptor } from 'inkshot-engine';
 *
 * const mainMenu: SceneDescriptor = {
 *   key: 'main-menu',
 *   async enter(core) {
 *     await core.events.emit('assets/load', { bundle: 'ui' });
 *     core.events.emitSync('game/state:set', { state: 'main-menu' });
 *   },
 *   async exit(core) {
 *     await core.events.emit('assets/unload', { bundle: 'ui' });
 *   },
 * };
 *
 * const { core } = await createEngine({
 *   plugins: [new SceneManager()],
 * });
 *
 * // Register scenes
 * core.events.emitSync('scene/register', { scene: mainMenu });
 *
 * // Transition to a scene
 * await core.events.emit('scene/load', { key: 'main-menu' });
 *
 * // React to transitions
 * core.events.on('ui', 'scene/changed', ({ from, to }) => {
 *   console.log(`Scene changed: ${from ?? 'none'} → ${to}`);
 * });
 *
 * // Query the current scene
 * const { output } = core.events.emitSync('scene/current', {});
 * console.log(output.key); // 'main-menu'
 * ```
 */
export class SceneManager implements EnginePlugin {
  readonly namespace = 'scene';
  readonly editorMeta = {
    displayName: 'Scene Manager',
    icon: 'scene',
    description: 'Manages scene registration and transitions between levels or rooms.',
    events: ['scene/register', 'scene/load', 'scene/current'] as const,
    schemas: {
      scene: {
        folder: 'scenes',
        displayName: 'Scene Descriptor',
      },
    },
  };

  private _core: Core | null = null;

  /** Registry of all registered scene descriptors, keyed by `scene.key`. */
  private readonly _scenes: Map<string, SceneDescriptor> = new Map();

  /** The key of the currently active scene, or `null` if none has been loaded. */
  private _currentKey: string | null = null;

  /** `true` while a `scene/load` transition is in progress; prevents re-entrant calls. */
  private _transitioning = false;

  // ---------------------------------------------------------------------------
  // EnginePlugin lifecycle
  // ---------------------------------------------------------------------------

  init(core: Core): void {
    this._core = core;

    core.events.on<SceneRegisterParams>(
      this.namespace,
      'scene/register',
      (params) => {
        this._register(params.scene);
      },
    );

    core.events.on<SceneLoadParams>(
      this.namespace,
      'scene/load',
      async (params) => {
        await this._transition(params.key);
      },
    );

    core.events.on<Record<string, never>, SceneCurrentOutput>(
      this.namespace,
      'scene/current',
      (_params, output) => {
        output.key = this._currentKey;
      },
    );
  }

  destroy(core: Core): void {
    core.events.removeNamespace(this.namespace);
    this._scenes.clear();
    this._currentKey = null;
    this._transitioning = false;
    this._core = null;
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  /**
   * Key of the currently active scene, or `null` if no scene is loaded.
   *
   * Prefer `scene/current` for reactive / event-driven code.  Use this
   * accessor only when you need a synchronous snapshot outside of a handler.
   */
  get currentKey(): string | null {
    return this._currentKey;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _register(scene: SceneDescriptor): void {
    if (this._scenes.has(scene.key)) {
      console.warn(`[SceneManager] Scene "${scene.key}" is already registered and will be overwritten.`);
    }
    this._scenes.set(scene.key, scene);
  }

  private async _transition(key: string): Promise<void> {
    const core = this._core;
    if (!core) return;

    if (this._transitioning) {
      throw new Error(
        `[SceneManager] A scene transition is already in progress. ` +
        `Cannot start a new transition to "${key}" until the current one completes.`,
      );
    }

    const next = this._scenes.get(key);
    if (!next) {
      throw new Error(`[SceneManager] Scene "${key}" is not registered.`);
    }

    this._transitioning = true;
    try {
      const from = this._currentKey;

      // Exit the current scene if one is active.
      if (from !== null) {
        const current = this._scenes.get(from);
        await current?.exit?.(core);
      }

      // Enter the new scene.
      this._currentKey = key;
      await next.enter(core);

      // Notify all systems that the scene has changed.
      const notification: SceneChangedParams = { from, to: key };
      await core.events.emit('scene/changed', notification);
    } finally {
      this._transitioning = false;
    }
  }
}
