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
  /** Rightward acceleration applied to every particle in px/s². Default: `0`. */
  wind?: number;

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
  /** Visual radius of each particle in pixels. Default: `4`. */
  radius?: number;
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
 * EventBus notification emitted as `particle/complete` when a **burst**
 * emitter's last particle expires naturally.
 *
 * Not fired when an emitter is removed via `particle/clear`.
 */
export interface ParticleCompleteParams {
  /** ID of the emitter that finished. */
  id: string;
}
