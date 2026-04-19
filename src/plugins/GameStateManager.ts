import type { Core } from '../core/Core.js';
import type { EnginePlugin } from '../types/plugin.js';
import type {
  GamePhase,
  GameStateSetParams,
  GameStateGetOutput,
} from '../types/game.js';
import type { SaveSlotLoadParams, SaveSlotLoadOutput } from '../types/save.js';

/**
 * Built-in plugin that tracks the high-level game session phase.
 *
 * `GameStateManager` is a lightweight state machine that answers questions
 * like:
 * - "Has the game started?" → `state !== 'none' && state !== 'main-menu'`
 * - "Is the game paused?"   → `state === 'paused'`
 *
 * It resets automatically after a successful `save/slot:load` so that
 * transient runtime flags from a previous session do not bleed into the
 * freshly restored one.
 *
 * ---
 *
 * ### Event contract
 *
 * | Event            | Phase | Params                     | Output                     | What GameStateManager does |
 * |------------------|-------|----------------------------|----------------------------|----------------------------|
 * | `game/state:set` | main  | {@link GameStateSetParams} | —                          | Transitions to the requested phase |
 * | `game/state:get` | main  | —                          | {@link GameStateGetOutput} | Writes the current phase into `output.state` |
 * | `save/slot:load` | after | —                          | {@link SaveSlotLoadOutput} | If `output.loaded` is `true`, resets state then transitions to `'playing'` and emits `game/started` |
 *
 * ---
 *
 * ### Usage
 *
 * ```ts
 * import { createEngine, GameStateManager } from 'inkshot-engine';
 *
 * const { core } = await createEngine({
 *   plugins: [new GameStateManager()],
 * });
 *
 * // Transition to the main menu
 * await core.events.emit('game/state:set', { state: 'main-menu' });
 *
 * // Start a new game
 * await core.events.emit('game/state:set', { state: 'playing' });
 *
 * // Query the current state
 * const { output } = await core.events.emit<Record<string, never>, GameStateGetOutput>(
 *   'game/state:get', {},
 * );
 * console.log(output.state); // 'playing'
 * ```
 */
export class GameStateManager implements EnginePlugin {
  readonly namespace = 'game';

  private _state: GamePhase = 'none';

  // ---------------------------------------------------------------------------
  // EnginePlugin lifecycle
  // ---------------------------------------------------------------------------

  init(core: Core): void {
    const { events } = core;

    events.on<GameStateSetParams>(this.namespace, 'game/state:set', (params) => {
      this._state = params.state;
    });

    events.on<Record<string, never>, GameStateGetOutput>(
      this.namespace,
      'game/state:get',
      (_params, output) => {
        output.state = this._state;
      },
    );

    // After a save slot is loaded successfully: reset transient state, move
    // into the 'playing' phase, and notify all systems via 'game/started'.
    events.on<SaveSlotLoadParams, SaveSlotLoadOutput>(
      this.namespace,
      'save/slot:load',
      async (_params, output) => {
        if (!output.loaded) return;
        this._reset();
        this._state = 'playing';
        await events.emit('game/started', {});
      },
      { phase: 'after' },
    );
  }

  destroy(core: Core): void {
    core.events.removeNamespace(this.namespace);
    this._state = 'none';
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  /**
   * The current game phase.
   *
   * Prefer `game/state:get` for reactive / event-driven code.  Use this
   * accessor only when you need a synchronous snapshot outside of a handler.
   */
  get state(): GamePhase {
    return this._state;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Resets all transient runtime state back to its initial values.
   * Called automatically after a successful save load.
   */
  private _reset(): void {
    this._state = 'none';
  }
}
