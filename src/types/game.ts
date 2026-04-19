/**
 * The current high-level phase of the game session.
 *
 * - `'none'`       – Engine initialised but no game session is active.
 * - `'main-menu'`  – The player is at the main menu / title screen.
 * - `'playing'`    – A game session is active and running.
 * - `'paused'`     – A game session is active but temporarily paused.
 * - `'cutscene'`   – A non-interactive cutscene is in progress.
 * - `'game-over'`  – The current game session has ended.
 */
export type GamePhase = 'none' | 'main-menu' | 'playing' | 'paused' | 'cutscene' | 'game-over';

// ---------------------------------------------------------------------------
// game/state:set
// ---------------------------------------------------------------------------

/** Parameters for `game/state:set`. */
export interface GameStateSetParams {
  /** The phase to transition into. */
  state: GamePhase;
}

// ---------------------------------------------------------------------------
// game/state:get
// ---------------------------------------------------------------------------

/** Output for `game/state:get`. */
export interface GameStateGetOutput {
  /** The current game phase. */
  state: GamePhase;
}
