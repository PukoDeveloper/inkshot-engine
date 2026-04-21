import { Graphics, Sprite } from 'pixi.js';
import type { Core } from '../core/Core.js';
import type { EnginePlugin } from '../types/plugin.js';
import { ObjectPool } from '../rendering/ObjectPool.js';
import type {
  ParticleConfig,
  ParticleEmitParams,
  ParticleEmitOutput,
  ParticleStopParams,
  ParticleClearParams,
  ParticleCompleteParams,
  ParticleMoveParams,
  ParticlePauseParams,
  ParticleResumeParams,
  ParticleCountParams,
  ParticleCountOutput,
  ParticleUpdateParams,
} from '../types/particle.js';

// ---------------------------------------------------------------------------
// Minimal structural interfaces (allow injection of stubs in tests)
// ---------------------------------------------------------------------------

/**
 * Minimal interface that a particle display object must satisfy.
 *
 * In production this is fulfilled by a Pixi.js `Graphics` or `Sprite` instance.
 * In tests a plain-object stub can be injected via `ParticleManagerOptions`.
 */
export interface ParticleDisplay {
  x: number;
  y: number;
  alpha: number;
  scale: { x: number; y: number };
  rotation: number;
  tint: number;
}

/**
 * Minimal interface for the layer container that particles are added to.
 *
 * In production this is fulfilled by a Pixi.js `Container`.
 * In tests a stub with `vi.fn()` methods can be passed.
 */
export interface ParticleLayer {
  addChild(child: ParticleDisplay): void;
  removeChild(child: ParticleDisplay): void;
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

interface Particle {
  display: ParticleDisplay;
  x: number;
  y: number;
  /** Velocity in px/ms. */
  vx: number;
  /** Velocity in px/ms. */
  vy: number;
  /** Elapsed lifetime in ms. */
  age: number;
  /** Total lifetime in ms. */
  lifetime: number;
  startAlpha: number;
  endAlpha: number;
  startScale: number;
  endScale: number;
  startColor: number;
  endColor: number;
  /** Rotation speed in rad/ms. */
  angularVelocity: number;
  /** Per-particle gravity in px/ms². */
  gravity: number;
  /** Per-particle wind in px/ms². */
  wind: number;
}

interface Emitter {
  id: string;
  config: ParticleConfig;
  /** Whether the emitter is still accepting new particles. */
  active: boolean;
  /** Whether the emitter is frozen (no spawning or particle advancement). */
  paused: boolean;
  /**
   * `true` when the emitter ended naturally (burst completion or duration
   * expiry).  `false` when stopped manually via `stop()` or `clear()`.
   * Used to decide whether to fire `particle/complete`.
   */
  completedNaturally: boolean;
  /** Total elapsed ms since this emitter was created. */
  elapsed: number;
  /** Accumulated ms used to determine when to spawn the next particle. */
  accumulator: number;
  /** Accumulated wait time between `repeatBurst` cycles (ms). */
  repeatAccumulator: number;
  particles: Set<Particle>;
  pool: ObjectPool<ParticleDisplay>;
  layer: ParticleLayer;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let _nextId = 0;
function generateId(): string {
  return `emitter_${++_nextId}`;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 0xff;
  const ag = (a >> 8) & 0xff;
  const ab = a & 0xff;
  const br = (b >> 16) & 0xff;
  const bg = (b >> 8) & 0xff;
  const bb = b & 0xff;
  return (
    (Math.round(lerp(ar, br, t)) << 16) |
    (Math.round(lerp(ag, bg, t)) << 8) |
    Math.round(lerp(ab, bb, t))
  );
}

function randomVariance(base: number, variance: number): number {
  return base + (Math.random() * 2 - 1) * variance;
}

function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

/**
 * Return a random spawn offset from the emitter origin based on `spawnShape`.
 */
function getSpawnOffset(cfg: ParticleConfig): { x: number; y: number } {
  const shape = cfg.spawnShape ?? 'point';

  if (shape === 'rect') {
    const w = cfg.spawnWidth ?? 0;
    const h = cfg.spawnHeight ?? 0;
    return {
      x: (Math.random() - 0.5) * w,
      y: (Math.random() - 0.5) * h,
    };
  }

  if (shape === 'circle') {
    const r = cfg.spawnRadius ?? 0;
    const angle = Math.random() * Math.PI * 2;
    // sqrt gives uniform area distribution rather than clustering at the centre.
    const dist = Math.sqrt(Math.random()) * r;
    return {
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
    };
  }

  return { x: 0, y: 0 };
}

// Default no-op layer used before init() or when no renderer is available.
const _noopLayer: ParticleLayer = { addChild: () => {}, removeChild: () => {} };

// ---------------------------------------------------------------------------
// ParticleManagerOptions
// ---------------------------------------------------------------------------

/** Options for {@link ParticleManager}. */
export interface ParticleManagerOptions {
  /**
   * Maximum number of idle display objects kept in the pool per emitter.
   * Default: `256`.
   */
  poolSize?: number;
  /**
   * Factory that creates a new particle display object.
   *
   * Defaults to a Pixi.js `Sprite` (when `config.texture` is set) or a small
   * filled `Graphics` circle (radius from `config.radius`, default `4`).
   *
   * Override this in tests to inject a plain-object stub and avoid a live
   * Pixi.js rendering context.
   *
   * @example
   * ```ts
   * const pm = new ParticleManager({
   *   createDisplay: () => ({ x: 0, y: 0, alpha: 1, scale: { x: 1, y: 1 }, rotation: 0, tint: 0xffffff }),
   * });
   * ```
   */
  createDisplay?: (config: ParticleConfig) => ParticleDisplay;
}

// ---------------------------------------------------------------------------
// ParticleManager
// ---------------------------------------------------------------------------

/**
 * Manages particle emitters and drives the particle simulation each fixed tick.
 *
 * ### Emission modes
 * - **Burst** (`config.burst: true`) — emits `burstCount` particles all at once,
 *   then waits for them to expire.  Fires `particle/complete` when the last
 *   particle dies.  Set `repeatBurst: true` to loop indefinitely.
 * - **Continuous** (default) — emits at `config.rate` particles/second until
 *   the optional `config.duration` expires or the emitter is manually stopped.
 *   Fires `particle/complete` when duration expires **and** all remaining
 *   particles have died.
 *
 * ### EventBus API
 * | Event                | Params / Output                               |
 * |----------------------|-----------------------------------------------|
 * | `particle/emit`      | `ParticleEmitParams → ParticleEmitOutput`     |
 * | `particle/stop`      | `ParticleStopParams`                          |
 * | `particle/clear`     | `ParticleClearParams`                         |
 * | `particle/move`      | `ParticleMoveParams`                          |
 * | `particle/pause`     | `ParticlePauseParams`                         |
 * | `particle/resume`    | `ParticleResumeParams`                        |
 * | `particle/count`     | `ParticleCountParams → ParticleCountOutput`   |
 * | `particle/update`    | `ParticleUpdateParams`                        |
 * | `particle/complete`  | `ParticleCompleteParams` (notification)       |
 *
 * ### Direct API
 * ```ts
 * const id = particleManager.emit({ x: 100, y: 200, speed: 80, lifetime: 600 });
 * particleManager.move(id, 150, 250);
 * particleManager.pause(id);
 * particleManager.resume(id);
 * particleManager.update(id, { rate: 50 });
 * particleManager.stop(id);
 * particleManager.clear(id);
 * ```
 *
 * ### Integration with ObjectPool
 * Each emitter maintains its own `ObjectPool<ParticleDisplay>` so display
 * objects are reused rather than created and garbage-collected every frame.
 */
export class ParticleManager implements EnginePlugin {
  readonly namespace = 'particle';

  private _core: Core | null = null;
  private _fxLayer: ParticleLayer = _noopLayer;

  private readonly _emitters: Map<string, Emitter> = new Map();
  private readonly _poolSize: number;
  private readonly _createDisplay: (config: ParticleConfig) => ParticleDisplay;

  constructor(options: ParticleManagerOptions = {}) {
    this._poolSize = options.poolSize ?? 256;
    this._createDisplay = options.createDisplay ?? defaultCreateDisplay;
  }

  // ---------------------------------------------------------------------------
  // Plugin lifecycle
  // ---------------------------------------------------------------------------

  init(core: Core): void {
    this._core = core;

    // Resolve the fx layer — Renderer must be initialised before this plugin.
    const result = core.events.emitSync('renderer/layer', { name: 'fx' }) as {
      output: { layer: ParticleLayer };
    };
    this._fxLayer = result.output.layer ?? this._fxLayer;

    // Advance all emitters on every fixed tick.
    core.events.on(this.namespace, 'core/update', (params: { dt: number }) => {
      this._update(params.dt);
    });

    // ── EventBus public API ──────────────────────────────────────────────────
    core.events.on(
      this.namespace,
      'particle/emit',
      (params: ParticleEmitParams, output: ParticleEmitOutput) => {
        output.id = this.emit(params.config, params.id);
      },
    );

    core.events.on(this.namespace, 'particle/stop', (params: ParticleStopParams) => {
      this.stop(params.id);
    });

    core.events.on(this.namespace, 'particle/clear', (params: ParticleClearParams) => {
      this.clear(params.id);
    });

    core.events.on(this.namespace, 'particle/move', (params: ParticleMoveParams) => {
      this.move(params.id, params.x, params.y);
    });

    core.events.on(this.namespace, 'particle/pause', (params: ParticlePauseParams) => {
      this.pause(params.id);
    });

    core.events.on(this.namespace, 'particle/resume', (params: ParticleResumeParams) => {
      this.resume(params.id);
    });

    core.events.on(
      this.namespace,
      'particle/count',
      (_params: ParticleCountParams, output: ParticleCountOutput) => {
        output.emitterCount = this.emitterCount;
        output.particleCount = this.particleCount;
      },
    );

    core.events.on(this.namespace, 'particle/update', (params: ParticleUpdateParams) => {
      this.update(params.id, params.config);
    });
  }

  destroy(): void {
    this.clear();
    this._core?.events.removeNamespace(this.namespace);
    this._core = null;
    this._fxLayer = _noopLayer;
  }

  // ---------------------------------------------------------------------------
  // Direct public API
  // ---------------------------------------------------------------------------

  /**
   * Create and start a new particle emitter.
   *
   * @param config  Emitter configuration.
   * @param id      Optional stable identifier.  Auto-generated when omitted.
   * @returns       The emitter ID.
   */
  emit(config: ParticleConfig, id?: string): string {
    const emitterId = id ?? generateId();

    const pool = new ObjectPool<ParticleDisplay>(
      () => this._createDisplay(config),
      this._poolSize,
    );

    const emitter: Emitter = {
      id: emitterId,
      config,
      active: true,
      paused: false,
      completedNaturally: false,
      elapsed: 0,
      accumulator: 0,
      repeatAccumulator: 0,
      particles: new Set(),
      pool,
      layer: this._fxLayer,
    };

    this._emitters.set(emitterId, emitter);

    // Burst mode: emit everything immediately.
    if (config.burst) {
      const count = config.burstCount ?? 10;
      for (let i = 0; i < count; i++) {
        this._spawnParticle(emitter);
      }
      emitter.active = false;
      emitter.completedNaturally = true;
    }

    // Pre-warm: fast-forward the emitter by the requested number of ms so it
    // appears mid-stream when first rendered.
    if (config.preWarm && config.preWarm > 0) {
      this._preWarmEmitter(emitter, config.preWarm);
    }

    return emitterId;
  }

  /**
   * Stop an emitter from spawning new particles.
   * Existing live particles continue until their lifetime expires.
   * Does **not** fire `particle/complete`.
   */
  stop(id: string): void {
    const emitter = this._emitters.get(id);
    if (emitter) emitter.active = false;
  }

  /**
   * Immediately remove an emitter and all of its particles.
   * If `id` is omitted, every active emitter is cleared.
   * Does **not** fire `particle/complete`.
   */
  clear(id?: string): void {
    if (id !== undefined) {
      const emitter = this._emitters.get(id);
      if (emitter) {
        this._clearEmitter(emitter);
        this._emitters.delete(id);
      }
    } else {
      for (const emitter of this._emitters.values()) {
        this._clearEmitter(emitter);
      }
      this._emitters.clear();
    }
  }

  /**
   * Move an emitter's spawn origin to a new world position.
   * Existing live particles are unaffected; only newly spawned particles
   * originate from the updated position.
   *
   * @param id  Emitter to move.
   * @param x   New world x position.
   * @param y   New world y position.
   */
  move(id: string, x: number, y: number): void {
    const emitter = this._emitters.get(id);
    if (emitter) {
      emitter.config = { ...emitter.config, x, y };
    }
  }

  /**
   * Pause one or all emitters.
   * While paused, no particles are spawned or advanced — they freeze in place.
   *
   * @param id  Emitter to pause.  Omit to pause every emitter.
   */
  pause(id?: string): void {
    if (id !== undefined) {
      const emitter = this._emitters.get(id);
      if (emitter) emitter.paused = true;
    } else {
      for (const emitter of this._emitters.values()) {
        emitter.paused = true;
      }
    }
  }

  /**
   * Resume one or all paused emitters.
   *
   * @param id  Emitter to resume.  Omit to resume every paused emitter.
   */
  resume(id?: string): void {
    if (id !== undefined) {
      const emitter = this._emitters.get(id);
      if (emitter) emitter.paused = false;
    } else {
      for (const emitter of this._emitters.values()) {
        emitter.paused = false;
      }
    }
  }

  /**
   * Merge a partial config into a running emitter's configuration.
   * Changes take effect immediately for newly spawned particles.
   * Existing live particles are not retroactively updated.
   *
   * @param id      Target emitter ID.
   * @param config  Partial configuration to merge.
   */
  update(id: string, config: Partial<ParticleConfig>): void {
    const emitter = this._emitters.get(id);
    if (emitter) {
      emitter.config = { ...emitter.config, ...config };
    }
  }

  /** Number of currently registered emitters. */
  get emitterCount(): number {
    return this._emitters.size;
  }

  /** Total number of live particles across all registered emitters. */
  get particleCount(): number {
    let total = 0;
    for (const emitter of this._emitters.values()) {
      total += emitter.particles.size;
    }
    return total;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  /** Advance all emitters by `dt` milliseconds. */
  private _update(dt: number): void {
    const toRemove: string[] = [];
    const completed: string[] = [];

    for (const [id, emitter] of this._emitters) {
      if (emitter.paused) continue;

      this._stepEmitter(emitter, dt);

      // Handle emitter completion / repeat logic.
      if (!emitter.active && emitter.particles.size === 0) {
        if (emitter.config.repeatBurst && emitter.config.burst) {
          // Accumulate wait time toward the next burst cycle.
          emitter.repeatAccumulator += dt;
          const interval = emitter.config.repeatInterval ?? 1000;
          if (emitter.repeatAccumulator >= interval) {
            emitter.repeatAccumulator = 0;
            const count = emitter.config.burstCount ?? 10;
            for (let i = 0; i < count; i++) {
              this._spawnParticle(emitter);
            }
            emitter.active = false;
            emitter.completedNaturally = true;
          }
        } else {
          toRemove.push(id);
          if (emitter.completedNaturally) {
            completed.push(id);
          }
        }
      }
    }

    // Remove finished emitters outside the iteration.
    for (const id of toRemove) {
      const emitter = this._emitters.get(id);
      if (emitter) emitter.pool.clear();
      this._emitters.delete(id);
    }

    // Fire completion notifications.
    for (const id of completed) {
      this._core?.events.emitSync('particle/complete', { id } as ParticleCompleteParams);
    }
  }

  /**
   * Advance a single emitter by `dt` ms: spawn new particles (if active),
   * update all live particles' physics and visuals, and reap dead particles.
   *
   * Does **not** handle emitter completion or cleanup — that is the
   * responsibility of `_update`.
   */
  private _stepEmitter(emitter: Emitter, dt: number): void {
    emitter.elapsed += dt;

    // Continuous mode: spawn new particles according to rate.
    if (emitter.active && !emitter.config.burst) {
      if (
        emitter.config.duration !== undefined &&
        emitter.elapsed >= emitter.config.duration
      ) {
        emitter.active = false;
        emitter.completedNaturally = true;
      } else {
        const rate = emitter.config.rate ?? 20;
        const msPerParticle = 1000 / rate;
        emitter.accumulator += dt;
        while (emitter.accumulator >= msPerParticle) {
          this._spawnParticle(emitter);
          emitter.accumulator -= msPerParticle;
        }
      }
    }

    // Advance live particles.
    const dead: Particle[] = [];
    for (const particle of emitter.particles) {
      particle.age += dt;

      if (particle.age >= particle.lifetime) {
        dead.push(particle);
        continue;
      }

      const t = particle.age / particle.lifetime;

      particle.vx += particle.wind * dt;
      particle.vy += particle.gravity * dt;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;

      // Sync display.
      const d = particle.display;
      d.x = particle.x;
      d.y = particle.y;
      d.alpha = lerp(particle.startAlpha, particle.endAlpha, t);
      const scale = lerp(particle.startScale, particle.endScale, t);
      d.scale.x = scale;
      d.scale.y = scale;
      d.tint = lerpColor(particle.startColor, particle.endColor, t);
      d.rotation += particle.angularVelocity * dt;
    }

    // Return dead particles to the pool.
    for (const p of dead) {
      emitter.layer.removeChild(p.display);
      emitter.pool.release(p.display);
      emitter.particles.delete(p);
    }
  }

  /** Spawn a single particle from the given emitter. */
  private _spawnParticle(emitter: Emitter): void {
    const cfg = emitter.config;

    const offset = getSpawnOffset(cfg);
    const spawnX = cfg.x + offset.x;
    const spawnY = cfg.y + offset.y;

    const angleRad = degToRad(randomVariance(cfg.angle ?? 0, cfg.spread ?? 0));
    // Convert px/s → px/ms.
    const speed = Math.max(0, randomVariance(cfg.speed, cfg.speedVariance ?? 0)) / 1000;
    const lifetime = Math.max(1, randomVariance(cfg.lifetime, cfg.lifetimeVariance ?? 0));

    const startAlpha = cfg.startAlpha ?? 1;
    const startScale = cfg.startScale ?? 1;
    const startColor = cfg.startColor ?? 0xffffff;

    // Rotation — convert deg → rad; angular velocity in rad/ms.
    const startRotationRad = degToRad(
      randomVariance(cfg.startRotation ?? 0, cfg.rotationVariance ?? 0),
    );
    const angularVelocityRad =
      degToRad(
        randomVariance(cfg.angularVelocity ?? 0, cfg.angularVelocityVariance ?? 0),
      ) / 1000;

    // Per-particle forces — convert px/s² → px/ms².
    const gravity =
      randomVariance(cfg.gravity ?? 0, cfg.gravityVariance ?? 0) / 1_000_000;
    const wind =
      randomVariance(cfg.wind ?? 0, cfg.windVariance ?? 0) / 1_000_000;

    const display = emitter.pool.acquire();

    // Initialise display state.
    display.x = spawnX;
    display.y = spawnY;
    display.alpha = startAlpha;
    display.scale.x = startScale;
    display.scale.y = startScale;
    display.rotation = startRotationRad;
    display.tint = startColor;

    const particle: Particle = {
      display,
      x: spawnX,
      y: spawnY,
      vx: Math.cos(angleRad) * speed,
      vy: Math.sin(angleRad) * speed,
      age: 0,
      lifetime,
      startAlpha,
      endAlpha: cfg.endAlpha ?? 0,
      startScale,
      endScale: cfg.endScale ?? 0,
      startColor,
      endColor: cfg.endColor ?? startColor,
      angularVelocity: angularVelocityRad,
      gravity,
      wind,
    };

    emitter.layer.addChild(display);
    emitter.particles.add(particle);
  }

  /** Immediately remove all particles from an emitter and reset its pool. */
  private _clearEmitter(emitter: Emitter): void {
    for (const p of emitter.particles) {
      emitter.layer.removeChild(p.display);
    }
    emitter.particles.clear();
    emitter.pool.clear();
    emitter.active = false;
  }

  /**
   * Simulate `ms` milliseconds for a single emitter immediately (pre-warm).
   * Uses 16 ms steps to match typical 60 fps cadence.
   */
  private _preWarmEmitter(emitter: Emitter, ms: number): void {
    const step = 16;
    let remaining = ms;
    while (remaining > 0) {
      const dt = Math.min(step, remaining);
      remaining -= dt;
      this._stepEmitter(emitter, dt);
    }
  }
}

// ---------------------------------------------------------------------------
// Default display factory (Pixi.js)
// ---------------------------------------------------------------------------

function defaultCreateDisplay(config: ParticleConfig): ParticleDisplay {
  if (config.texture) {
    return Sprite.from(config.texture) as unknown as ParticleDisplay;
  }
  const radius = config.radius ?? 4;
  const color = config.startColor ?? 0xffffff;
  const g = new Graphics();
  g.circle(0, 0, radius).fill(color);
  return g as unknown as ParticleDisplay;
}
