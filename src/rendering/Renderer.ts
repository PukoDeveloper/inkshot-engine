import type { Application, Container } from 'pixi.js';
import type { Core } from '../core/Core.js';

/**
 * Thin wrapper around the Pixi.js stage, providing helpers for scene
 * management and layer ordering.
 *
 * `Renderer` is created by the consuming application and registered with `Core`
 * via the event bus.  It does NOT construct the Pixi Application itself —
 * that responsibility belongs to `Core`.
 */
export class Renderer {
  private readonly _core: Core;

  constructor(core: Core) {
    this._core = core;

    // Listen for the engine tick to synchronize render if needed
    core.events.on('renderer', 'core/tick', this._onTick, { priority: -100 });
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  /** The Pixi.js stage (root container). */
  get stage(): Container {
    return this._core.app.stage;
  }

  /** The Pixi.js Application. */
  get app(): Application {
    return this._core.app;
  }

  // ---------------------------------------------------------------------------
  // Layer helpers
  // ---------------------------------------------------------------------------

  /**
   * Add a display object to the stage at the given z-index.
   * If `zIndex` is provided the stage's `sortableChildren` is enabled
   * automatically.
   */
  addToStage(child: Container, zIndex?: number): void {
    if (zIndex !== undefined) {
      this.stage.sortableChildren = true;
      child.zIndex = zIndex;
    }
    this.stage.addChild(child);
  }

  /** Remove a display object from the stage. */
  removeFromStage(child: Container): void {
    this.stage.removeChild(child);
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /** Unregister all renderer listeners from the event bus. */
  destroy(): void {
    this._core.events.removeNamespace('renderer');
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private readonly _onTick = (_params: { delta: number; elapsed: number }): void => {
    // Future: per-frame render hooks can be emitted here
  };
}
