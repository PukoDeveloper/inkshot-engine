import type { Core } from '../../core/Core.js';
import type { EnginePlugin } from '../../types/plugin.js';
import type {
  TweenToParams,
  TweenToOutput,
  TweenKillParams,
  TweenFinishedParams,
} from '../../types/tween.js';

// ---------------------------------------------------------------------------
// Easing
// ---------------------------------------------------------------------------

/** A function that maps a linear progress value `t ∈ [0, 1]` to an eased value. */
export type EasingFn = (t: number) => number;

/**
 * A collection of common easing functions.
 *
 * Pass any of these to `TweenOptions.ease`, or supply your own `(t) => number` function.
 *
 * @example
 * ```ts
 * new Tween(sprite, { x: 100 }, { duration: 500, ease: Easing.easeOutQuad })
 * ```
 */
export const Easing: Record<string, EasingFn> = {
  linear: (t) => t,
  easeInQuad: (t) => t * t,
  easeOutQuad: (t) => t * (2 - t),
  easeInOutQuad: (t) => (t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t),
  easeInCubic: (t) => t ** 3,
  easeOutCubic: (t) => 1 - (1 - t) ** 3,
  easeInOutCubic: (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
  easeInQuart: (t) => t ** 4,
  easeOutQuart: (t) => 1 - (1 - t) ** 4,
  easeInOutQuart: (t) => (t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2),
  easeInSine: (t) => 1 - Math.cos((t * Math.PI) / 2),
  easeOutSine: (t) => Math.sin((t * Math.PI) / 2),
  easeInOutSine: (t) => -(Math.cos(Math.PI * t) - 1) / 2,
  easeInExpo: (t) => (t === 0 ? 0 : 2 ** (10 * t - 10)),
  easeOutExpo: (t) => (t === 1 ? 1 : 1 - 2 ** (-10 * t)),
  easeInBack: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return c3 * t * t * t - c1 * t * t;
  },
  easeOutBack: (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
  },
  easeInElastic: (t) => {
    if (t === 0 || t === 1) return t;
    const c4 = (2 * Math.PI) / 3;
    return -(2 ** (10 * t - 10)) * Math.sin((t * 10 - 10.75) * c4);
  },
  easeOutElastic: (t) => {
    if (t === 0 || t === 1) return t;
    const c4 = (2 * Math.PI) / 3;
    return 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
  easeInBounce: (t) => 1 - Easing['easeOutBounce']!(1 - t),
  easeOutBounce: (t) => {
    const n1 = 7.5625;
    const d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
};

// ---------------------------------------------------------------------------
// Tween options
// ---------------------------------------------------------------------------

/** Options controlling how a {@link Tween} plays. */
export interface TweenOptions {
  /** Duration of one forward pass in milliseconds. */
  duration: number;
  /**
   * Easing function applied to the normalised progress `t ∈ [0, 1]`.
   * Defaults to {@link Easing.linear}.
   */
  ease?: EasingFn;
  /** Delay before the tween starts, in milliseconds. Defaults to `0`. */
  delay?: number;
  /**
   * When `true` the tween repeats indefinitely.
   * `onComplete` is never called for looping tweens.
   */
  loop?: boolean;
  /**
   * When `true` the tween reverses direction after each forward pass.
   * Combine with `loop: true` for a continuous ping-pong animation.
   */
  yoyo?: boolean;
  /**
   * Number of additional times to replay after the first play.
   * `0` = play once (default). `-1` = infinite (same as `loop: true`).
   * Ignored when `loop: true`.
   */
  repeat?: number;
  /**
   * Delay in milliseconds inserted between each repeat cycle.
   * Defaults to `0`.  Has no effect unless `repeat` or `loop` causes the
   * tween to restart.
   */
  repeatDelay?: number;
  /** Called once when the tween first starts animating (after any delay). */
  onStart?: () => void;
  /** Called every tick while the tween is animating, with the current eased progress `0–1`. */
  onUpdate?: (easedProgress: number) => void;
  /** Called when the tween finishes. Not called on looping tweens. */
  onComplete?: () => void;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface PropState {
  from: number;
  to: number;
}

let _idCounter = 0;

function nextId(): string {
  return `tween_${++_idCounter}`;
}

// ---------------------------------------------------------------------------
// Tween
// ---------------------------------------------------------------------------

/**
 * Animates one or more numeric properties of a target object over time.
 *
 * `from` values are captured from the target at the moment the tween first
 * begins animating (after any delay), so the object can move freely until
 * the tween kicks in.
 *
 * ### Direct usage
 * ```ts
 * const tween = new Tween(sprite, { x: 200, alpha: 0 }, {
 *   duration: 600,
 *   ease: Easing.easeOutQuad,
 *   onComplete: () => sprite.destroy(),
 * });
 * tweenManager.add(tween);
 * ```
 *
 * ### EventBus usage
 * ```ts
 * core.events.emitSync('tween/to', {
 *   target: sprite,
 *   props: { x: 200, alpha: 0 },
 *   duration: 600,
 *   ease: 'easeOutQuad',
 * });
 * ```
 */
export class Tween<T extends object = object> {
  /** The object being animated. */
  readonly target: T;

  // The destination values declared at construction time.
  private readonly _toProps: Readonly<Record<string, number>>;

  // Per-property from/to state — populated when the tween first starts.
  private _props: Map<string, PropState> | null = null;

  private readonly _opts: Required<
    Omit<TweenOptions, 'onStart' | 'onUpdate' | 'onComplete'>
  > &
    Pick<TweenOptions, 'onStart' | 'onUpdate' | 'onComplete'>;

  private _delayRemaining: number;
  private _elapsed = 0;
  /** `true` while the backward (yoyo) pass is active. */
  private _backward = false;
  private _started = false;
  private _paused = false;
  private _killed = false;
  private _completed = false;

  /**
   * Total number of additional plays allowed after the first.
   * `Infinity` for infinite loops (`loop: true` or `repeat: -1`).
   */
  private readonly _totalRepeats: number;
  /** How many repeat cycles have been completed so far. */
  private _repeatsDone = 0;
  /** Whether the tween is currently counting down a between-cycle delay. */
  private _inRepeatDelay = false;
  /** Remaining milliseconds of the current between-cycle delay countdown. */
  private _repeatDelayRemaining = 0;

  constructor(target: T, props: Record<string, number>, options: TweenOptions) {
    this.target = target;
    this._toProps = { ...props };
    this._opts = {
      ease: Easing['linear']!,
      delay: 0,
      loop: false,
      yoyo: false,
      repeat: 0,
      repeatDelay: 0,
      ...options,
    };
    this._delayRemaining = this._opts.delay;
    this._totalRepeats = this._opts.loop
      ? Infinity
      : this._opts.repeat === -1
        ? Infinity
        : this._opts.repeat;
  }

  // ---------------------------------------------------------------------------
  // State accessors
  // ---------------------------------------------------------------------------

  /** `true` while the tween is actively animating (not paused, killed, or done). */
  get isPlaying(): boolean {
    return !this._paused && !this._killed && !this._completed;
  }

  /** `true` if the tween has been paused via {@link pause}. */
  get isPaused(): boolean {
    return this._paused;
  }

  /** `true` if the tween has been killed via {@link kill}. */
  get isKilled(): boolean {
    return this._killed;
  }

  /** `true` if the tween has finished naturally. */
  get isCompleted(): boolean {
    return this._completed;
  }

  /**
   * Normalised progress of the current pass `[0, 1]`.
   * Returns `0` before the tween has started, `1` once complete.
   */
  get progress(): number {
    if (!this._started) return 0;
    const { duration } = this._opts;
    return duration > 0 ? Math.min(this._elapsed / duration, 1) : 1;
  }

  // ---------------------------------------------------------------------------
  // Control
  // ---------------------------------------------------------------------------

  /** Pause animation. The tween stays in its current state until {@link resume} is called. */
  pause(): this {
    this._paused = true;
    return this;
  }

  /** Resume a paused tween from where it left off. */
  resume(): this {
    this._paused = false;
    return this;
  }

  /**
   * Permanently stop this tween.
   * The `TweenManager` will remove it on the next tick.
   * The target properties are left at their current (mid-animation) values.
   */
  kill(): this {
    this._killed = true;
    return this;
  }

  // ---------------------------------------------------------------------------
  // Advancement (called by TweenManager / Timeline each tick)
  // ---------------------------------------------------------------------------

  /**
   * Reset the tween to its initial (pre-start) state so it can be replayed.
   *
   * All accumulated elapsed time, the `backward` flag, and the `from`
   * snapshot are cleared.  The delay restarts from its original value.
   * The target properties are **not** touched.
   */
  reset(): this {
    this._props = null;
    this._elapsed = 0;
    this._backward = false;
    this._started = false;
    this._paused = false;
    this._killed = false;
    this._completed = false;
    this._delayRemaining = this._opts.delay;
    this._repeatsDone = 0;
    this._inRepeatDelay = false;
    this._repeatDelayRemaining = 0;
    return this;
  }

  /**
   * Jump the playhead to `timeMs` within the current forward pass.
   *
   * - Clamps to `[0, duration]`.
   * - Captures `from` values if the tween has not yet started.
   * - Fires `onUpdate` with the eased progress at the target time.
   * - Does nothing if the tween has been killed.
   */
  seek(timeMs: number): this {
    if (this._killed) return this;

    const { duration, ease } = this._opts;
    const clamped = Math.max(0, Math.min(timeMs, duration));

    // Ensure the tween is started (capture from values).
    if (!this._started) {
      this._started = true;
      this._delayRemaining = 0;
      this._inRepeatDelay = false;
      this._repeatDelayRemaining = 0;
      this._opts.onStart?.();
      const tgt0 = this.target as Record<string, number>;
      this._props = new Map(
        Object.entries(this._toProps).map(([key, to]) => [
          key,
          { from: (tgt0[key] as number | undefined) ?? 0, to },
        ]),
      );
    }

    this._elapsed = clamped;
    this._completed = false;
    this._inRepeatDelay = false;

    const rawT = duration > 0 ? clamped / duration : 1;
    const t = this._backward ? 1 - rawT : rawT;
    const easedT = ease(t);

    const tgt = this.target as Record<string, number>;
    for (const [key, state] of this._props!) {
      tgt[key] = state.from + (state.to - state.from) * easedT;
    }
    this._opts.onUpdate?.(easedT);

    return this;
  }

  /**
   * Jump the playhead to a normalised position `[0, 1]` within the current
   * forward pass.  Equivalent to `seek(progress * duration)`.
   */
  seekProgress(value: number): this {
    return this.seek(value * this._opts.duration);
  }

  /**
   * Advance the tween by `dt` milliseconds.
   *
   * Excess time past a phase boundary (e.g. the end of a forward yoyo pass,
   * or a repeat-delay expiry) is carried into the next phase in the same
   * call, so a single large `dt` can advance through multiple phases without
   * needing repeated calls.
   *
   * @returns `true` when the tween is finished and should be removed from
   *   the manager (either killed or completed).
   */
  advance(dt: number): boolean {
    if (this._killed) return true;
    if (this._completed) return true;
    if (this._paused) return false;

    // ── Initial delay ─────────────────────────────────────────────────────
    if (this._delayRemaining > 0) {
      this._delayRemaining -= dt;
      if (this._delayRemaining > 0) return false;
      // Carry over excess time past the delay into the active phase.
      dt = -this._delayRemaining;
      this._delayRemaining = 0;
    }

    // ── Repeat delay (between-cycle pause) ────────────────────────────────
    if (this._inRepeatDelay) {
      this._repeatDelayRemaining -= dt;
      if (this._repeatDelayRemaining > 0) return false;
      // Carry excess past the repeat delay into the new cycle.
      dt = -this._repeatDelayRemaining;
      this._repeatDelayRemaining = 0;
      this._inRepeatDelay = false;
    }

    // ── Capture 'from' values on first active tick ────────────────────────
    // onStart fires before reading 'from' so that callbacks like Timeline's
    // fromTo/from helpers can reset target values before they are snapshotted.
    if (!this._started) {
      this._started = true;
      this._opts.onStart?.();
      const tgt0 = this.target as Record<string, number>;
      this._props = new Map(
        Object.entries(this._toProps).map(([key, to]) => [
          key,
          { from: (tgt0[key] as number | undefined) ?? 0, to },
        ]),
      );
    }

    const { duration, ease, yoyo } = this._opts;
    const repeatDelay = this._opts.repeatDelay;
    const tgt = this.target as Record<string, number>;

    // ── Phase loop: carry excess time across yoyo / loop boundaries ───────
    // Each iteration processes one pass (forward or backward).  Excess dt
    // past the end of a pass is fed into the next iteration.  We use
    // do/while so that a dt of 0 still runs once (needed for duration=0 tweens).
    let remainingDt = dt;
    do {
      this._elapsed += remainingDt;
      remainingDt = 0;

      // Compute normalised progress.
      const rawT = duration > 0 ? Math.min(this._elapsed / duration, 1) : 1;
      const t = this._backward ? 1 - rawT : rawT;
      const easedT = ease(t);

      // Apply interpolated values.
      for (const [key, state] of this._props!) {
        tgt[key] = state.from + (state.to - state.from) * easedT;
      }
      this._opts.onUpdate?.(easedT);

      if (rawT < 1) break; // pass not yet finished
      const excess = this._elapsed - duration;

      if (yoyo && !this._backward) {
        // Forward pass done → start backward pass, carry excess.
        this._backward = true;
        this._elapsed = 0;
        remainingDt = excess;
        continue;
      }

      // ── Full cycle complete (non-yoyo, or yoyo backward pass done) ───────
      if (this._repeatsDone < this._totalRepeats) {
        this._repeatsDone++;
        this._backward = false;
        this._elapsed = 0;

        if (repeatDelay > 0) {
          const delayRemaining = repeatDelay - excess;
          if (delayRemaining > 0) {
            // Snap to start-of-cycle values and wait for the repeat delay.
            if (!yoyo) {
              for (const [key, state] of this._props!) {
                tgt[key] = state.from;
              }
            }
            this._inRepeatDelay = true;
            this._repeatDelayRemaining = delayRemaining;
            return false;
          }
          // Excess exceeded the delay; carry the remainder into the new cycle.
          remainingDt = -delayRemaining;
        } else {
          remainingDt = excess;
        }

        if (!yoyo) {
          // For plain repeat, snap back to 'from' to avoid a one-frame glitch.
          for (const [key, state] of this._props!) {
            tgt[key] = state.from;
          }
        }
        // For yoyo + repeat the backward pass already left values at 'from'.
        continue;
      }

      // ── No more repeats: snap to exact final values and complete ──────────
      for (const [key, state] of this._props!) {
        tgt[key] = this._backward ? state.from : state.to;
      }
      this._completed = true;
      this._opts.onComplete?.();
      return true;
    } while (remainingDt > 0);

    return false;
  }
}

// ---------------------------------------------------------------------------
// TweenManager
// ---------------------------------------------------------------------------

/** An object that can be managed by {@link TweenManager}: a `Tween` or a `Timeline`. */
export interface Advanceable {
  advance(dt: number): boolean;
  get isKilled(): boolean;
  get isCompleted(): boolean;
  kill(): this;
}

/**
 * Engine plugin that drives all active {@link Tween} and {@link Timeline} instances.
 *
 * ### Direct API
 * ```ts
 * const tween = new Tween(sprite, { x: 100 }, { duration: 500 });
 * tweenManager.add(tween);
 * tweenManager.killTarget(sprite); // stop all tweens on a target
 * ```
 *
 * ### EventBus API
 * | Event        | Params            | Output           |
 * |--------------|-------------------|------------------|
 * | `tween/to`   | `TweenToParams`   | `TweenToOutput`  |
 * | `tween/kill` | `TweenKillParams` | —                |
 */
export class TweenManager implements EnginePlugin {
  readonly namespace = 'tween';
  readonly editorMeta = {
    displayName: 'Tween Manager',
    icon: 'tween',
    description: 'Drives property interpolation tweens and timelines with configurable easing.',
    commands: ['tween/to', 'tween/kill'] as const,
  };

  private _core: Core | null = null;

  /** Active animatables (tweens and timelines). */
  private readonly _active: Set<Advanceable> = new Set();

  /** ID → animatable for EventBus kill-by-ID support. */
  private readonly _ids: Map<string, Advanceable> = new Map();

  // ---------------------------------------------------------------------------
  // Plugin lifecycle
  // ---------------------------------------------------------------------------

  init(core: Core): void {
    this._core = core;

    core.events.on(this.namespace, 'core/tick', this._onTick);

    // ── EventBus API ────────────────────────────────────────────────────
    core.events.on(
      this.namespace,
      'tween/to',
      (params: TweenToParams, output: TweenToOutput) => {
        const ease = params.ease ? (Easing[params.ease] ?? Easing['linear']!) : Easing['linear']!;
        const tween = new Tween(params.target, params.props, {
          duration: params.duration,
          ease,
          delay: params.delay,
          loop: params.loop,
          yoyo: params.yoyo,
          repeat: params.repeat,
          repeatDelay: params.repeatDelay,
        });
        const id = params.id ?? nextId();
        this.add(tween, id);
        output.id = id;
      },
    );

    core.events.on(this.namespace, 'tween/kill', (params: TweenKillParams) => {
      if (params.all) {
        this.killAll();
        return;
      }
      if (params.id !== undefined) {
        this._killById(params.id);
      }
      if (params.target !== undefined) {
        this.killTarget(params.target);
      }
    });
  }

  destroy(): void {
    this._active.clear();
    this._ids.clear();
    this._core?.events.removeNamespace(this.namespace);
    this._core = null;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Register an animatable (Tween or Timeline) to be driven each tick.
   *
   * @param animatable  The tween or timeline to manage.
   * @param id          Optional stable identifier for later cancellation via
   *                    `tween/kill` or `killById`.
   */
  add(animatable: Advanceable, id?: string): void {
    this._active.add(animatable);
    if (id !== undefined) {
      this._ids.set(id, animatable);
    }
  }

  /**
   * Stop and remove a specific animatable.
   * The target properties are left at their current values.
   */
  kill(animatable: Advanceable): void {
    animatable.kill();
    this._active.delete(animatable);
    // Clean up ID map
    for (const [k, v] of this._ids) {
      if (v === animatable) {
        this._ids.delete(k);
        break;
      }
    }
  }

  /**
   * Stop and remove all tweens whose `target` is `object`.
   * Does not affect `Timeline` instances (use {@link killAll} if needed).
   */
  killTarget(object: object): void {
    const toKill = [...this._active].filter(
      (item): item is Tween => item instanceof Tween && item.target === object,
    );
    for (const item of toKill) {
      this.kill(item);
    }
  }

  /** Stop and remove all active animatables. */
  killAll(): void {
    for (const item of this._active) {
      item.kill();
    }
    this._active.clear();
    this._ids.clear();
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private _killById(id: string): void {
    const item = this._ids.get(id);
    if (item) {
      item.kill();
      this._ids.delete(id);
      this._active.delete(item);
    }
  }

  private readonly _onTick = (params: { elapsed: number }): void => {
    const dt = params.elapsed;
    const done: Advanceable[] = [];

    for (const item of this._active) {
      if (item.isKilled || item.advance(dt)) {
        done.push(item);
      }
    }

    for (const item of done) {
      this._active.delete(item);
      // Remove from IDs map and emit tween/finished for natural completions.
      let id: string | undefined;
      for (const [k, v] of this._ids) {
        if (v === item) {
          id = k;
          this._ids.delete(k);
          break;
        }
      }
      if (item.isCompleted && this._core) {
        const finishedParams: TweenFinishedParams = { id };
        if (item instanceof Tween) {
          finishedParams.target = item.target;
        }
        this._core.events.emitSync('tween/finished', finishedParams);
      }
    }
  };
}
