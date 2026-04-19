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
  /** Target frames per second for the fixed-step game loop. */
  targetFps?: number;
  /**
   * Maximum number of fixed-step updates allowed per frame.
   * Prevents a "spiral of death" when the browser tab is backgrounded and
   * `deltaTime` spikes.  Defaults to `5`.
   */
  maxUpdatesPerFrame?: number;
  /**
   * Root URL / path prefix for all game data assets (images, audio, data files, etc.).
   * Systems that load assets should resolve paths relative to this base.
   * Defaults to `'/'`.
   */
  dataRoot?: string;
  resizeTo?: Window | HTMLElement | null;
}

const DEFAULT_OPTIONS: Required<CoreOptions> = {
  container: document.body,
  width: 800,
  height: 600,
  background: 0x1a1a2e,
  antialias: true,
  targetFps: 60,
  maxUpdatesPerFrame: 5,
  dataRoot: '/',
  resizeTo: null,
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
  readonly events: EventBus;

  /**
   * Root URL / path prefix for game data assets.
   * Set during `init()` via `CoreOptions.dataRoot` (defaults to `'/'`).
   */
  dataRoot: string = '/';

  private _app: Application | null = null;
  private _initialized = false;
  private _running = false;

  /** Fixed time-step duration in milliseconds (`1000 / targetFps`). */
  private _fixedStepMs = 1000 / 60;
  /** Maximum allowed fixed updates per render frame. */
  private _maxUpdatesPerFrame = 5;
  /** Accumulated time not yet consumed by fixed updates (ms). */
  private _accumulator = 0;
  /** Monotonically increasing fixed-update tick counter. */
  private _tick = 0;

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
  async init(options: CoreOptions = {}): Promise<void> {
    if (this._initialized) {
      console.warn('[Core] Already initialized.');
      return;
    }

    const opts = { ...DEFAULT_OPTIONS, ...options };

    this.dataRoot = opts.dataRoot;
    this._fixedStepMs = 1000 / opts.targetFps;
    this._maxUpdatesPerFrame = opts.maxUpdatesPerFrame;

    this._app = new Application();

    await this._app.init({
      width: opts.width,
      height: opts.height,
      background: opts.background,
      antialias: opts.antialias,
      resizeTo: opts.resizeTo ?? undefined,
    });

    const container =
      typeof opts.container === 'string'
        ? (document.querySelector(opts.container) as HTMLElement | null) ?? document.body
        : opts.container;

    container.appendChild(this._app.canvas as HTMLCanvasElement);

    this._initialized = true;

    await this.events.emit('core/init', { core: this });
  }

  /**
   * Start the main game loop.
   * Emits `core/tick` every frame with `{ delta, elapsed }`.
   */
  start(): void {
    if (!this._initialized) {
      throw new Error('[Core] Cannot start before init() has completed.');
    }
    if (this._running) return;

    this._running = true;
    this._accumulator = 0;
    this._app!.ticker.add(this._onTick);

    this.events.emitSync('core/start', { core: this });
  }

  /**
   * Pause the game loop (ticker stops, no more `core/tick` events).
   */
  pause(): void {
    if (!this._running) return;
    this._running = false;
    this._app!.ticker.remove(this._onTick);
    this.events.emitSync('core/pause', { core: this });
  }

  /**
   * Resume after `pause()`.
   */
  resume(): void {
    if (this._running) return;
    this._running = true;
    this._accumulator = 0;
    this._app!.ticker.add(this._onTick);
    this.events.emitSync('core/resume', { core: this });
  }

  /**
   * Destroy the engine and release all resources.
   */
  async destroy(): Promise<void> {
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
  get app(): Application {
    if (!this._app) {
      throw new Error('[Core] Pixi Application is not available before init().');
    }
    return this._app;
  }

  /** Whether the engine has been initialized. */
  get isInitialized(): boolean {
    return this._initialized;
  }

  /** Whether the game loop is currently running. */
  get isRunning(): boolean {
    return this._running;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private readonly _onTick = (ticker: { deltaTime: number; elapsedMS: number }): void => {
    const frameDeltaMs = ticker.elapsedMS;

    // ── Legacy raw tick (prefer core/update for game logic) ───────────────
    this.events.emitSync('core/tick', {
      delta: ticker.deltaTime,
      elapsed: frameDeltaMs,
    });

    // ── Fixed-step update loop ───────────────────────────────────────────
    this._accumulator += frameDeltaMs;

    let updates = 0;
    while (this._accumulator >= this._fixedStepMs && updates < this._maxUpdatesPerFrame) {
      this.events.emitSync('core/update', {
        dt: this._fixedStepMs,
        tick: this._tick,
      });
      this._accumulator -= this._fixedStepMs;
      this._tick += 1;
      updates += 1;
    }

    // If we hit the cap, discard leftover time to avoid spiral of death.
    if (updates >= this._maxUpdatesPerFrame) {
      this._accumulator = 0;
    }

    // ── Render with interpolation alpha ──────────────────────────────────
    const alpha = this._accumulator / this._fixedStepMs;
    this.events.emitSync('core/render', {
      alpha,
      delta: frameDeltaMs,
    });
  };
}
