import type { Core } from '../../core/Core.js';
import type { EnginePlugin } from '../../types/plugin.js';
import type { InputActionTriggeredParams } from '../../types/input.js';
import type { CoreUpdateParams } from '../../types/rendering.js';
import type {
  Entity,
  EntityQueryOutput,
  EntityCreatedParams,
  EntityDestroyedParams,
} from '../../types/entity.js';
import type { GameStateGetOutput } from '../../types/game.js';
import type { PhysicsMoveParams, PhysicsMoveOutput } from '../../types/physics.js';
import type {
  PlayerControllerOptions,
  PlayerEntitySetParams,
  PlayerMovedParams,
  PlayerInteractParams,
} from '../../types/player.js';

// ---------------------------------------------------------------------------
// PlayerController
// ---------------------------------------------------------------------------

/**
 * Built-in plugin that translates logical input actions into player-entity
 * movement, with automatic game-phase gating.
 *
 * Movement is blocked whenever `game/state:get` returns any phase other than
 * `'playing'` (or when no {@link GameStateManager} is registered at all, in
 * which case movement is always allowed).
 *
 * ### Entity detection
 *
 * The controller automatically adopts any entity created with the configured
 * `playerTag` (default `'player'`) when no entity is currently being
 * controlled.  An explicit `player/entity:set` event can override this at any
 * time — useful for vehicle boarding, dialogue puppets, multiplayer, etc.
 *
 * ### Events handled (commands)
 *
 * | Event                    | Description                                    |
 * |--------------------------|------------------------------------------------|
 * | `player/entity:set`      | Override the controlled entity at runtime      |
 * | `input/action:triggered` | Track pressed/released direction + interact    |
 * | `core/update`            | Apply per-frame movement                       |
 *
 * ### Events emitted
 *
 * | Event            | When                                                   |
 * |------------------|--------------------------------------------------------|
 * | `player/moved`   | After each frame where the entity actually moves       |
 * | `player/interact`| When the interact action is pressed in `'playing'` phase |
 *
 * ### Movement
 *
 * - Diagonal movement is normalised to maintain constant speed.
 * - If a physics body is registered for the entity, movement is resolved via
 *   `physics/move` (collision-aware).  Otherwise the entity's `position` is
 *   updated directly.
 *
 * @example
 * ```ts
 * import { createEngine, InputManager, EntityManager, GameStateManager,
 *          PlayerController } from 'inkshot-engine';
 *
 * const { core } = await createEngine({
 *   plugins: [
 *     new InputManager(),
 *     new EntityManager(),
 *     new GameStateManager(),
 *     new PlayerController({ speed: 150 }),
 *   ],
 * });
 *
 * // Creating an entity tagged 'player' is all that's needed — no
 * // player/entity:set call required.
 * core.events.emitSync('entity/create', { tags: ['player'] });
 *
 * // Bind keys to actions
 * core.events.emitSync('input/action:bind', { action: 'move-up',    codes: ['ArrowUp',    'KeyW'] });
 * core.events.emitSync('input/action:bind', { action: 'move-down',  codes: ['ArrowDown',  'KeyS'] });
 * core.events.emitSync('input/action:bind', { action: 'move-left',  codes: ['ArrowLeft',  'KeyA'] });
 * core.events.emitSync('input/action:bind', { action: 'move-right', codes: ['ArrowRight', 'KeyD'] });
 * core.events.emitSync('input/action:bind', { action: 'interact',   codes: ['Space', 'KeyZ'] });
 *
 * // Start the game
 * core.events.emitSync('game/state:set', { state: 'playing' });
 * ```
 */
export class PlayerController implements EnginePlugin {
  readonly namespace = 'playerController';

  private _core: Core | null = null;
  private _entity: Entity | null = null;
  private _entityId: string | null;
  private readonly _speed: number;
  private readonly _playerTag: string;
  private readonly _actionNames: {
    readonly up: string;
    readonly down: string;
    readonly left: string;
    readonly right: string;
    readonly interact: string;
  };

  /** Tracks which directional actions are currently held. */
  private _held = { up: false, down: false, left: false, right: false };

  constructor(options: PlayerControllerOptions = {}) {
    this._entityId  = options.entityId ?? null;
    this._speed     = options.speed    ?? 120;
    this._playerTag = options.playerTag ?? 'player';
    this._actionNames = {
      up:       options.actions?.up       ?? 'move-up',
      down:     options.actions?.down     ?? 'move-down',
      left:     options.actions?.left     ?? 'move-left',
      right:    options.actions?.right    ?? 'move-right',
      interact: options.actions?.interact ?? 'interact',
    };
  }

  // ---------------------------------------------------------------------------
  // EnginePlugin lifecycle
  // ---------------------------------------------------------------------------

  init(core: Core): void {
    this._core = core;
    const { events } = core;

    // Resolve entity reference from a constructor-time entityId.
    if (this._entityId) {
      this._resolveEntity();
    }

    // Allow the controlled entity to be changed at runtime.
    events.on<PlayerEntitySetParams>(this.namespace, 'player/entity:set', (params) => {
      this._entityId = params.entityId;
      this._entity   = null;
      this._resolveEntity();
    });

    // Cache the entity reference as soon as it is created.
    // Also auto-adopt any entity tagged with _playerTag when no entity is
    // currently being controlled (tag-based detection).
    events.on<EntityCreatedParams>(this.namespace, 'entity/created', ({ entity }) => {
      if (entity.id === this._entityId) {
        this._entity = entity;
      } else if (
        this._entityId === null &&
        this._playerTag !== '' &&
        entity.tags.has(this._playerTag)
      ) {
        this._entityId = entity.id;
        this._entity   = entity;
      }
    });

    // Drop the reference when the entity is destroyed.
    // Clear _entityId too so that auto-detection can re-activate if a new
    // player-tagged entity is created later.
    events.on<EntityDestroyedParams>(this.namespace, 'entity/destroyed', ({ entity }) => {
      if (entity.id === this._entityId) {
        this._entity   = null;
        this._entityId = null;
      }
    });

    // Track held direction keys and handle the interact action.
    events.on<InputActionTriggeredParams>(
      this.namespace,
      'input/action:triggered',
      (params) => {
        const pressed = params.state === 'pressed';
        switch (params.action) {
          case this._actionNames.up:       this._held.up    = pressed; break;
          case this._actionNames.down:     this._held.down  = pressed; break;
          case this._actionNames.left:     this._held.left  = pressed; break;
          case this._actionNames.right:    this._held.right = pressed; break;
          case this._actionNames.interact: if (pressed) this._handleInteract(); break;
        }
      },
    );

    // Apply movement each fixed-step update.
    events.on<CoreUpdateParams>(this.namespace, 'core/update', (params) => {
      this._applyMovement(params.dt);
    });
  }

  destroy(core: Core): void {
    this._held     = { up: false, down: false, left: false, right: false };
    this._entity   = null;
    this._entityId = null;
    core.events.removeNamespace(this.namespace);
    this._core = null;
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  /** ID of the entity currently being controlled, or `null` if none is set. */
  get entityId(): string | null {
    return this._entityId;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Resolve the entity reference by querying the EntityManager.
   *
   * Called when `player/entity:set` is received or at `init()` time when an
   * `entityId` was provided to the constructor.
   */
  private _resolveEntity(): void {
    if (!this._entityId || !this._core) return;
    const { output } = this._core.events.emitSync<Record<string, never>, EntityQueryOutput>(
      'entity/query', {},
    );
    this._entity = output.entities?.find((e) => e.id === this._entityId) ?? null;
  }

  /**
   * Returns `true` when player movement and interaction are permitted.
   *
   * Movement is allowed when:
   * - The game phase is `'playing'`, **or**
   * - No `GameStateManager` is registered (output.state is `undefined`).
   */
  private _isPlaying(): boolean {
    if (!this._core) return false;
    const { output } = this._core.events.emitSync<Record<string, never>, GameStateGetOutput>(
      'game/state:get', {},
    );
    return output.state === undefined || output.state === 'playing';
  }

  /** Emit `player/interact` when the interact key is pressed during gameplay. */
  private _handleInteract(): void {
    if (!this._isPlaying() || !this._core) return;
    const entity = this._entity;
    this._core.events.emitSync<PlayerInteractParams>('player/interact', {
      entityId: entity?.id ?? null,
      x: entity?.position.x ?? 0,
      y: entity?.position.y ?? 0,
    });
  }

  /**
   * Compute and apply movement for this fixed-update frame.
   *
   * Diagonal movement is normalised so the entity always travels at
   * `speed` px/s regardless of direction.
   *
   * Physics-aware movement is attempted first via `physics/move`.  When no
   * physics adapter handles the event the entity's `position` is updated
   * directly as a fallback.
   */
  private _applyMovement(dtMs: number): void {
    if (!this._isPlaying() || !this._entity || !this._core) return;

    let dx = 0;
    let dy = 0;
    if (this._held.left)  dx -= this._speed;
    if (this._held.right) dx += this._speed;
    if (this._held.up)    dy -= this._speed;
    if (this._held.down)  dy += this._speed;

    if (dx === 0 && dy === 0) return;

    // Normalise diagonal movement to maintain constant speed.
    if (dx !== 0 && dy !== 0) {
      const invSqrt2 = 0.7071067811865476; // 1 / sqrt(2)
      dx *= invSqrt2;
      dy *= invSqrt2;
    }

    const dtSec  = dtMs / 1000;
    const moveDx = dx * dtSec;
    const moveDy = dy * dtSec;

    // Attempt physics-aware movement (collision resolution).
    const { output: physOut } = this._core.events.emitSync<PhysicsMoveParams, PhysicsMoveOutput>(
      'physics/move',
      { entityId: this._entity.id, dx: moveDx, dy: moveDy },
    );

    let finalX: number;
    let finalY: number;

    if (physOut.x !== undefined && physOut.y !== undefined) {
      // Physics adapter resolved the position (entity.position already updated).
      finalX = physOut.x;
      finalY = physOut.y;
    } else {
      // No physics adapter — apply movement directly.
      this._entity.position.x += moveDx;
      this._entity.position.y += moveDy;
      finalX = this._entity.position.x;
      finalY = this._entity.position.y;
    }

    this._core.events.emitSync<PlayerMovedParams>('player/moved', {
      entityId: this._entity.id,
      x: finalX,
      y: finalY,
      dx: moveDx,
      dy: moveDy,
    });
  }
}
