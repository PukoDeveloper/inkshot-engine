import { Application } from 'pixi.js';
import { EventBus } from './EventBus.js';
const DEFAULT_OPTIONS = {
    container: document.body,
    width: 800,
    height: 600,
    background: 0x1a1a2e,
    antialias: true,
    targetFps: 60,
};
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
export class Core {
    /** The shared event bus. All engine systems communicate through this. */
    events;
    _app = null;
    _initialized = false;
    _running = false;
    constructor() {
        this.events = new EventBus();
    }
    // ---------------------------------------------------------------------------
    // Lifecycle
    // ---------------------------------------------------------------------------
    /**
     * Initialise the Pixi.js application and mount the canvas.
     * Must be called before `start()`.
     */
    async init(options = {}) {
        if (this._initialized) {
            console.warn('[Core] Already initialized.');
            return;
        }
        const opts = { ...DEFAULT_OPTIONS, ...options };
        this._app = new Application();
        await this._app.init({
            width: opts.width,
            height: opts.height,
            background: opts.background,
            antialias: opts.antialias,
        });
        const container = typeof opts.container === 'string'
            ? document.querySelector(opts.container) ?? document.body
            : opts.container;
        container.appendChild(this._app.canvas);
        this._initialized = true;
        await this.events.emit('core/init', { core: this });
    }
    /**
     * Start the main game loop.
     * Emits `core/tick` every frame with `{ delta, elapsed }`.
     */
    start() {
        if (!this._initialized) {
            throw new Error('[Core] Cannot start before init() has completed.');
        }
        if (this._running)
            return;
        this._running = true;
        this._app.ticker.add(this._onTick);
        this.events.emitSync('core/start', { core: this });
    }
    /**
     * Pause the game loop (ticker stops, no more `core/tick` events).
     */
    pause() {
        if (!this._running)
            return;
        this._running = false;
        this._app.ticker.remove(this._onTick);
        this.events.emitSync('core/pause', { core: this });
    }
    /**
     * Resume after `pause()`.
     */
    resume() {
        if (this._running)
            return;
        this._running = true;
        this._app.ticker.add(this._onTick);
        this.events.emitSync('core/resume', { core: this });
    }
    /**
     * Destroy the engine and release all resources.
     */
    async destroy() {
        this.pause();
        await this.events.emit('core/destroy', { core: this });
        this.events.clear();
        this._app?.destroy(true);
        this._app = null;
        this._initialized = false;
    }
    // ---------------------------------------------------------------------------
    // Accessors
    // ---------------------------------------------------------------------------
    /** The underlying Pixi.js Application (available after `init()`). */
    get app() {
        if (!this._app) {
            throw new Error('[Core] Pixi Application is not available before init().');
        }
        return this._app;
    }
    /** Whether the engine has been initialized. */
    get isInitialized() {
        return this._initialized;
    }
    /** Whether the game loop is currently running. */
    get isRunning() {
        return this._running;
    }
    // ---------------------------------------------------------------------------
    // Private
    // ---------------------------------------------------------------------------
    _onTick = (ticker) => {
        this.events.emitSync('core/tick', {
            delta: ticker.deltaTime,
            elapsed: ticker.elapsedMS,
        });
    };
}
//# sourceMappingURL=Core.js.map