import type { Core } from '../core/Core.js';

// ---------------------------------------------------------------------------
// Scene descriptor
// ---------------------------------------------------------------------------

/**
 * A scene descriptor that is registered with the {@link SceneManager}.
 *
 * A scene is the primary unit of "level" or "room" in the game.  It owns a
 * lifecycle (`enter` / `exit`) and is completely data-driven — there are no
 * class requirements.
 *
 * ### Minimal example
 * ```ts
 * const mainMenuScene: SceneDescriptor = {
 *   key: 'main-menu',
 *   async enter(core) {
 *     await core.events.emit('assets/load', { bundle: 'ui' });
 *     core.events.emitSync('game/state:set', { state: 'main-menu' });
 *   },
 *   async exit(core) {
 *     await core.events.emit('assets/unload', { bundle: 'ui' });
 *   },
 * };
 * ```
 */
export interface SceneDescriptor {
  /** Unique scene key, e.g. `'main-menu'`, `'level-1'`, `'credits'`. */
  readonly key: string;
  /**
   * Called when the scene becomes the active scene.
   * Load assets, spawn entities, and set up any scene-specific listeners here.
   */
  enter(core: Core): void | Promise<void>;
  /**
   * Called when the scene is about to be replaced by another scene.
   * Unload assets, destroy entities, and remove scene-specific listeners here.
   */
  exit?(core: Core): void | Promise<void>;
}

// ---------------------------------------------------------------------------
// scene/register
// ---------------------------------------------------------------------------

/** Params for the `scene/register` event. */
export interface SceneRegisterParams {
  /** The scene descriptor to register. */
  scene: SceneDescriptor;
}

// ---------------------------------------------------------------------------
// scene/load
// ---------------------------------------------------------------------------

/** Params for the `scene/load` event. */
export interface SceneLoadParams {
  /** Key of the scene to transition into. */
  key: string;
}

// ---------------------------------------------------------------------------
// scene/current
// ---------------------------------------------------------------------------

/** Output for the `scene/current` event. */
export interface SceneCurrentOutput {
  /** Key of the currently active scene, or `null` if no scene is loaded. */
  key: string | null;
}

// ---------------------------------------------------------------------------
// scene/changed  (notification — emitted by SceneManager)
// ---------------------------------------------------------------------------

/** Params emitted with the `scene/changed` notification event. */
export interface SceneChangedParams {
  /** Key of the scene that was exited, or `null` if this is the first scene. */
  from: string | null;
  /** Key of the scene that was entered. */
  to: string;
}
