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
export declare class Renderer {
    private readonly _core;
    constructor(core: Core);
    /** The Pixi.js stage (root container). */
    get stage(): Container;
    /** The Pixi.js Application. */
    get app(): Application;
    /**
     * Add a display object to the stage at the given z-index.
     * If `zIndex` is provided the stage's `sortableChildren` is enabled
     * automatically.
     */
    addToStage(child: Container, zIndex?: number): void;
    /** Remove a display object from the stage. */
    removeFromStage(child: Container): void;
    /** Unregister all renderer listeners from the event bus. */
    destroy(): void;
    private readonly _onTick;
}
//# sourceMappingURL=Renderer.d.ts.map