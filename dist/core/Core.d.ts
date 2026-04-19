import { Application } from 'pixi.js';
import { EventBus } from './EventBus.js';
/**
 * Options passed to `Core.init()`.
 */
export interface CoreOptions {
    /** CSS selector or HTMLElement that will host the Pixi canvas. */
    container?: string | HTMLElement;
    /** Canvas width in pixels. */
    width?: number;
    /** Canvas height in pixels. */
    height?: number;
    /** Background colour (hex). */
    background?: number;
    /** Enable anti-aliasing. */
    antialias?: boolean;
    /** Target frames per second for the game loop. */
    targetFps?: number;
}
/**
 * Central engine class.
 *
 * `Core` is the single manually-constructed entry point for the engine.
 * It owns:
 *  - The **EventBus** – all other systems communicate exclusively through it.
 *  - The **Pixi.js Application** – the renderer and ticker.
 *
 * Usage:
 * ```ts
 * const core = new Core();
 * await core.init({ container: '#app', width: 1280, height: 720 });
 * core.start();
 * ```
 */
export declare class Core {
    /** The shared event bus. All engine systems communicate through this. */
    readonly events: EventBus;
    private _app;
    private _initialized;
    private _running;
    constructor();
    /**
     * Initialise the Pixi.js application and mount the canvas.
     * Must be called before `start()`.
     */
    init(options?: CoreOptions): Promise<void>;
    /**
     * Start the main game loop.
     * Emits `core/tick` every frame with `{ delta, elapsed }`.
     */
    start(): void;
    /**
     * Pause the game loop (ticker stops, no more `core/tick` events).
     */
    pause(): void;
    /**
     * Resume after `pause()`.
     */
    resume(): void;
    /**
     * Destroy the engine and release all resources.
     */
    destroy(): Promise<void>;
    /** The underlying Pixi.js Application (available after `init()`). */
    get app(): Application;
    /** Whether the engine has been initialized. */
    get isInitialized(): boolean;
    /** Whether the game loop is currently running. */
    get isRunning(): boolean;
    private readonly _onTick;
}
//# sourceMappingURL=Core.d.ts.map