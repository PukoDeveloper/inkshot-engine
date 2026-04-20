// ---------------------------------------------------------------------------
// Particle system types
// ---------------------------------------------------------------------------

/**
 * Configuration for a particle emitter.
 *
 * All rates and accelerations use world-space units:
 * - speeds  → pixels per second (px/s)
 * - accels  → pixels per second squared (px/s²)
 * - times   → milliseconds (ms)
 * - angles  → degrees (0 = right, 90 = down)
 */
export interface ParticleConfig {
  // ── Emitter position ──────────────────────────────────────────────────────
  /** World x position of the emitter origin. */
  x: number;
  /** World y position of the emitter origin. */
  y: number;

  // ── Emission mode ─────────────────────────────────────────────────────────
  /**
   * If `true`, emits `burstCount` particles all at once then stops.
   * Default: `false`.
   */
  burst?: boolean;
  /** Number of particles to emit in a burst. Default: `10`. */
  burstCount?: number;
  /** Particles emitted per second in continuous mode. Default: `20`. */
  rate?: number;
  /**
   * Total active duration in ms for continuous mode.
   * When elapsed time exceeds this the emitter stops accepting new particles.
   * `undefined` = run forever until manually stopped.
   */
  duration?: number;
  /**
   * If `true` and `burst` is also `true`, the emitter re-emits a new burst
   * after all particles from the previous burst have expired.
   * Default: `false`.
   */
  repeatBurst?: boolean;
  /**
   * Milliseconds to wait between successive burst repeats when `repeatBurst`
   * is `true`.  Measured from when the last particle of the previous burst
   * dies.  Default: `1000`.
   */
  repeatInterval?: number;

  // ── Per-particle lifetime ─────────────────────────────────────────────────
  /** Base particle lifetime in ms. */
  lifetime: number;
  /**
   * Random variance applied to lifetime:
   * actual lifetime = `lifetime ± lifetimeVariance`.
   */
  lifetimeVariance?: number;

  // ── Initial velocity ──────────────────────────────────────────────────────
  /** Initial speed in px/s. */
  speed: number;
  /** Random variance applied to speed: actual speed = `speed ± speedVariance`. */
  speedVariance?: number;
  /** Launch direction in degrees. 0 = right, 90 = down. Default: `0`. */
  angle?: number;
  /**
   * Half-spread in degrees.
   * Each particle picks a random direction in `[angle − spread, angle + spread]`.
   * Default: `0` (all particles go in exactly `angle` direction).
   */
  spread?: number;

  // ── Forces ────────────────────────────────────────────────────────────────
  /** Downward acceleration applied to every particle in px/s². Default: `0`. */
  gravity?: number;
  /**
   * Random variance applied to per-particle gravity.
   * Each particle's actual gravity = `gravity ± gravityVariance`.  Default: `0`.
   */
  gravityVariance?: number;
  /** Rightward acceleration applied to every particle in px/s². Default: `0`. */
  wind?: number;
  /**
   * Random variance applied to per-particle wind.
   * Each particle's actual wind = `wind ± windVariance`.  Default: `0`.
   */
  windVariance?: number;

  // ── Rotation ──────────────────────────────────────────────────────────────
  /** Initial rotation of each particle in degrees. Default: `0`. */
  startRotation?: number;
  /**
   * Random variance applied to `startRotation` in degrees.
   * Actual rotation = `startRotation ± rotationVariance`.  Default: `0`.
   */
  rotationVariance?: number;
  /** Rotation speed in degrees per second. Default: `0`. */
  angularVelocity?: number;
  /**
   * Random variance applied to `angularVelocity` in degrees/second.
   * Actual angular velocity = `angularVelocity ± angularVelocityVariance`.
   * Default: `0`.
   */
  angularVelocityVariance?: number;

  // ── Spawn shape ───────────────────────────────────────────────────────────
  /**
   * Shape of the spawn area.
   * - `'point'`  (default) — all particles spawn at `(x, y)`.
   * - `'rect'`   — uniform random offset within
   *                `[−spawnWidth/2, spawnWidth/2] × [−spawnHeight/2, spawnHeight/2]`.
   * - `'circle'` — uniform random offset within a disc of radius `spawnRadius`.
   */
  spawnShape?: 'point' | 'rect' | 'circle';
  /** Width of the rectangular spawn area (used when `spawnShape` is `'rect'`). */
  spawnWidth?: number;
  /** Height of the rectangular spawn area (used when `spawnShape` is `'rect'`). */
  spawnHeight?: number;
  /** Radius of the circular spawn area (used when `spawnShape` is `'circle'`). */
  spawnRadius?: number;

  // ── Visual ────────────────────────────────────────────────────────────────
  /** Particle alpha at spawn. Default: `1`. */
  startAlpha?: number;
  /** Particle alpha at end of lifetime. Default: `0`. */
  endAlpha?: number;
  /** Uniform scale at spawn. Default: `1`. */
  startScale?: number;
  /** Uniform scale at end of lifetime. Default: `0`. */
  endScale?: number;
  /** Tint colour (0xRRGGBB) at spawn. Default: `0xffffff`. */
  startColor?: number;
  /**
   * Tint colour (0xRRGGBB) at end of lifetime.
   * Default: same as `startColor` (no colour change).
   */
  endColor?: number;
  /** Visual radius of each particle in pixels (Graphics circle). Default: `4`. */
  radius?: number;
  /**
   * ResourceManager key for a texture to use instead of a filled Graphics
   * circle.  When provided, the default display factory creates a `Sprite`
   * from this key via `Sprite.from(texture)`.
   */
  texture?: string;

  // ── Pre-warm ──────────────────────────────────────────────────────────────
  /**
   * Milliseconds to simulate immediately when the emitter is created.
   * Useful for scene-open effects (e.g. fire, smoke) that should appear
   * mid-stream rather than starting from zero.
   * Default: `0` (no pre-warm).
   */
  preWarm?: number;
}

// ---------------------------------------------------------------------------
// EventBus event params / outputs
// ---------------------------------------------------------------------------

/** EventBus params for `particle/emit` — create and start a new emitter. */
export interface ParticleEmitParams {
  /**
   * Optional stable identifier.
   * Pass the same ID to `particle/stop` or `particle/clear` to target this emitter.
   * Auto-generated when omitted.
   */
  id?: string;
  /** Emitter configuration. */
  config: ParticleConfig;
}

/** EventBus output written by the `particle/emit` handler. */
export interface ParticleEmitOutput {
  /** The ID of the created emitter (supplied or auto-generated). */
  id: string;
}

/** EventBus params for `particle/stop` — stop emitting new particles. */
export interface ParticleStopParams {
  /** ID of the emitter to stop. Existing particles continue until they die. */
  id: string;
}

/**
 * EventBus params for `particle/clear` — immediately destroy particles.
 *
 * Removes the target emitter and all of its live particles instantly,
 * without waiting for their lifetime to expire.
 */
export interface ParticleClearParams {
  /**
   * ID of the emitter to clear.
   * If omitted, every active emitter is cleared.
   */
  id?: string;
}

/**
 * EventBus notification emitted as `particle/complete` when an emitter ends
 * naturally: either a burst emitter whose last particle expires, or a
 * continuous emitter whose `duration` expires and whose last particle dies.
 *
 * Not fired when an emitter is removed via `particle/clear` or `particle/stop`.
 * Not fired between successive cycles of a `repeatBurst` emitter.
 */
export interface ParticleCompleteParams {
  /** ID of the emitter that finished. */
  id: string;
}

/** EventBus params for `particle/move` — relocate an active emitter's origin. */
export interface ParticleMoveParams {
  /** ID of the emitter to move. */
  id: string;
  /** New world x position. */
  x: number;
  /** New world y position. */
  y: number;
}

/** EventBus params for `particle/pause` — freeze one or all emitters. */
export interface ParticlePauseParams {
  /**
   * ID of the emitter to pause.
   * If omitted, every active emitter is paused.
   */
  id?: string;
}

/** EventBus params for `particle/resume` — unfreeze one or all paused emitters. */
export interface ParticleResumeParams {
  /**
   * ID of the emitter to resume.
   * If omitted, every paused emitter is resumed.
   */
  id?: string;
}

/** EventBus params for `particle/count` — query current particle counts. */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ParticleCountParams {}

/** EventBus output written by the `particle/count` handler. */
export interface ParticleCountOutput {
  /** Number of currently registered emitters. */
  emitterCount: number;
  /** Total number of live particles across all emitters. */
  particleCount: number;
}

/** EventBus params for `particle/update` — hot-patch a running emitter's config. */
export interface ParticleUpdateParams {
  /** ID of the emitter to update. */
  id: string;
  /**
   * Partial configuration to merge into the emitter's current settings.
   * Changes apply to newly spawned particles; existing live particles are
   * not retroactively updated.
   */
  config: Partial<ParticleConfig>;
}
