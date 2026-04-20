import { Tween } from './TweenManager.js';
import type { TweenOptions, Advanceable } from './TweenManager.js';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface TweenEntry {
  readonly type: 'tween';
  /** Absolute start time within the timeline (ms). */
  readonly at: number;
  /** Duration of this entry (ms). */
  readonly duration: number;
  readonly tween: Tween;
}

interface CallEntry {
  readonly type: 'call';
  /** Time at which the callback fires (ms). */
  readonly at: number;
  readonly fn: () => void;
  called: boolean;
}

type TimelineEntry = TweenEntry | CallEntry;

// ---------------------------------------------------------------------------
// Timeline options
// ---------------------------------------------------------------------------

/** Options for a {@link Timeline}. */
export interface TimelineOptions {
  /** Called when the timeline finishes. Not called if `loop: true`. */
  onComplete?: () => void;
  /** Whether to repeat the timeline indefinitely. Tweens inside the timeline are reset via `Tween.reset()` on each loop iteration, which re-captures `from` values from the target at that moment. */
  loop?: boolean;
  /**
   * Number of additional times to replay after the first play.
   * `0` = play once (default). `-1` = infinite (same as `loop: true`).
   * Ignored when `loop: true`.
   */
  repeat?: number;
  /**
   * Delay in milliseconds inserted between each repeat cycle.
   * Defaults to `0`.  Has no effect unless `repeat` or `loop` causes the
   * timeline to restart.
   */
  repeatDelay?: number;
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

/**
 * Sequences and groups {@link Tween} animations on a shared time axis.
 *
 * Entries are added via the fluent builder methods (`to`, `from`, `fromTo`,
 * `set`, `call`, `delay`) and the timeline is handed to a
 * {@link TweenManager} to be driven each tick.
 *
 * ### Positioning entries
 *
 * Every entry-addition method accepts an optional `at` position that
 * controls where on the timeline's time axis the entry is placed:
 *
 * | `at` value | Meaning |
 * |------------|---------|
 * _(omitted)_ | Start immediately after the previous entry (default) |
 * `number`     | Absolute time in milliseconds |
 * `'<'`        | Same start time as the previous entry (parallel) |
 * `'+=N'`      | Cursor + `N` ms |
 * `'-=N'`      | Cursor − `N` ms (clamped to 0) |
 *
 * ### Example
 * ```ts
 * const tl = new Timeline({ onComplete: () => console.log('done') });
 *
 * tl.to(sprite, { x: 200 }, { duration: 500, ease: Easing.easeOutQuad })
 *   .to(sprite, { y: 100 }, { duration: 300 })          // after the first
 *   .to(other,  { alpha: 0 }, { duration: 300, at: '<' }) // parallel with above
 *   .call(() => console.log('halfway'))
 *   .delay(200)
 *   .to(sprite, { alpha: 1 }, { duration: 400 });
 *
 * tweenManager.add(tl);
 * ```
 */
export class Timeline implements Advanceable {
  private readonly _entries: TimelineEntry[] = [];

  /** Total timeline duration in ms. */
  private _totalDuration = 0;

  /** Timeline playhead position in ms (within the current cycle). */
  private _elapsed = 0;

  /**
   * Cursor: the end time of the last added tween entry (ms).
   * New entries without an explicit `at` are placed here.
   */
  private _cursor = 0;

  /** Start time of the most recently added entry (for `at: '<'`). */
  private _lastAt = 0;

  private _paused = false;
  private _killed = false;
  private _completed = false;
  private _loopCount = 0;

  /** Playback speed multiplier.  `2` = double speed; `0.5` = half speed. */
  private _playbackRate = 1;

  /**
   * Total number of additional plays allowed after the first.
   * `Infinity` for infinite loops (`loop: true` or `repeat: -1`).
   */
  private readonly _totalRepeats: number;
  /** How many repeat cycles have been completed so far. */
  private _repeatsDone = 0;
  /** Whether the timeline is currently counting down a between-cycle delay. */
  private _inRepeatDelay = false;
  /** Remaining milliseconds of the current between-cycle delay countdown. */
  private _repeatDelayRemaining = 0;

  private readonly _opts: Required<TimelineOptions>;

  constructor(options: TimelineOptions = {}) {
    this._opts = {
      onComplete: options.onComplete ?? (() => undefined),
      loop: options.loop ?? false,
      repeat: options.repeat ?? 0,
      repeatDelay: options.repeatDelay ?? 0,
    };
    this._totalRepeats = this._opts.loop
      ? Infinity
      : this._opts.repeat === -1
        ? Infinity
        : this._opts.repeat;
  }

  // ---------------------------------------------------------------------------
  // State accessors
  // ---------------------------------------------------------------------------

  /** `true` while the timeline is running (not paused, killed, or done). */
  get isPlaying(): boolean {
    return !this._paused && !this._killed && !this._completed;
  }

  /** `true` when the timeline has been paused via {@link pause}. */
  get isPaused(): boolean {
    return this._paused;
  }

  /** `true` when the timeline has been killed via {@link kill}. */
  get isKilled(): boolean {
    return this._killed;
  }

  /** `true` when the timeline has finished. */
  get isCompleted(): boolean {
    return this._completed;
  }

  /** Total duration of this timeline in milliseconds. */
  get duration(): number {
    return this._totalDuration;
  }

  /** Current playhead position in milliseconds (within the current cycle). */
  get elapsed(): number {
    return this._elapsed;
  }

  /**
   * Normalised progress of the current cycle `[0, 1]`.
   * Returns `1` for a zero-duration timeline.
   */
  get progress(): number {
    if (this._totalDuration === 0) return 1;
    return Math.min(this._elapsed / this._totalDuration, 1);
  }

  /**
   * Playback speed multiplier applied to every `advance()` call.
   * `1.0` = normal speed (default), `2.0` = double speed, `0.5` = half speed.
   */
  get playbackRate(): number {
    return this._playbackRate;
  }

  set playbackRate(rate: number) {
    this._playbackRate = rate;
  }

  // ---------------------------------------------------------------------------
  // Control
  // ---------------------------------------------------------------------------

  /** Pause the timeline. All managed tweens are also paused. */
  pause(): this {
    this._paused = true;
    for (const entry of this._entries) {
      if (entry.type === 'tween') entry.tween.pause();
    }
    return this;
  }

  /** Resume a paused timeline. */
  resume(): this {
    this._paused = false;
    for (const entry of this._entries) {
      if (entry.type === 'tween') entry.tween.resume();
    }
    return this;
  }

  /**
   * Kill the timeline.  All managed tweens are killed and properties are
   * left at their current values.
   */
  kill(): this {
    this._killed = true;
    for (const entry of this._entries) {
      if (entry.type === 'tween') entry.tween.kill();
    }
    return this;
  }

  /**
   * Reset the timeline to its initial (pre-start) state so it can be replayed.
   *
   * All repeat counters, the playhead, and internal tween states are cleared.
   * Target properties are **not** touched.
   */
  reset(): this {
    this._elapsed = 0;
    this._completed = false;
    this._killed = false;
    this._paused = false;
    this._loopCount = 0;
    this._repeatsDone = 0;
    this._inRepeatDelay = false;
    this._repeatDelayRemaining = 0;
    this._resetEntries();
    return this;
  }

  /**
   * Jump the playhead to `timeMs` within the current cycle.
   *
   * - Clamps to `[0, totalDuration]`.
   * - Advances all managed tweens to the correct state at that position
   *   (callbacks inside tweens may fire during the fast-forward).
   * - Call entries that fall before `timeMs` are marked as triggered but
   *   their callbacks are **not** invoked.
   * - Does nothing if the timeline has been killed.
   */
  seek(timeMs: number): this {
    if (this._killed) return this;

    const clamped = Math.max(0, Math.min(timeMs, this._totalDuration));

    // Reset everything, then drive tweens to the target position.
    this._resetEntries();
    this._elapsed = 0;
    this._completed = false;
    this._inRepeatDelay = false;

    // Mark call entries as triggered without invoking them.
    for (const entry of this._entries) {
      if (entry.type === 'call') {
        entry.called = clamped >= entry.at;
      }
    }

    // Fast-forward all tweens to their correct state at clamped time.
    // Always advance (even by 0) so that onStart fires and from-values are
    // captured (important for fromTo entries at t=0).
    for (const entry of this._entries) {
      if (entry.type === 'tween') {
        entry.tween.advance(clamped);
      }
    }

    this._elapsed = clamped;
    return this;
  }

  /**
   * Jump the playhead to a normalised position `[0, 1]` within the current
   * cycle.  Equivalent to `seek(progress * totalDuration)`.
   */
  seekProgress(value: number): this {
    return this.seek(value * this._totalDuration);
  }

  // ---------------------------------------------------------------------------
  // Builder — tween entries
  // ---------------------------------------------------------------------------

  /**
   * Animate properties **to** their target values from whatever values
   * the target has at the moment the timeline reaches this entry.
   */
  to<T extends object>(
    target: T,
    props: Record<string, number>,
    options: TweenOptions & { at?: number | string },
  ): this {
    const at = this._resolveAt(options.at);
    const duration = options.duration;

    // Use `delay` to position this tween within the timeline's time axis.
    // The tween itself manages its own elapsed time starting from the
    // moment the timeline first advances past its delay.
    const tween = new Tween(target, props, { ...options, delay: at });

    this._addTweenEntry(at, duration, tween);
    return this;
  }

  /**
   * Animate properties **from** the given values to whatever values the
   * target has at the moment this entry starts.
   *
   * Internally this creates a `fromTo` tween that reads the target's
   * current values just before the animation begins, so the supplied
   * `fromProps` are the *start* values and the target's live values
   * become the *end* values.
   *
   * > **Note:** because `to` values are captured at start time, make sure
   * > any preceding tweens on the same target have completed or snapped
   * > before this entry starts.
   */
  from<T extends object>(
    target: T,
    fromProps: Record<string, number>,
    options: TweenOptions & { at?: number | string },
  ): this {
    // We implement `from` as a `to` tween with swapped logic:
    // set target to `fromProps` immediately, then animate to the original values.
    // Capture 'to' values now (current target state), then force 'from' at start.
    const at = this._resolveAt(options.at);
    const duration = options.duration;

    // Create a sentinel object that, upon tween start, will swap the values.
    // We achieve this by using onStart to apply `fromProps` to target and
    // configuring the tween to animate back to the original values.
    const toProps: Record<string, number> = {};
    for (const key of Object.keys(fromProps)) {
      toProps[key] = (target as Record<string, number>)[key] ?? 0;
    }

    const userOnStart = options.onStart;
    const tween = new Tween(target, toProps, {
      ...options,
      delay: at,
      onStart: () => {
        // Force the target to the 'from' values so the Tween's from-capture
        // picks them up correctly.
        for (const [key, val] of Object.entries(fromProps)) {
          (target as Record<string, number>)[key] = val;
        }
        userOnStart?.();
      },
    });

    this._addTweenEntry(at, duration, tween);
    return this;
  }

  /**
   * Animate properties explicitly **from** `fromProps` **to** `toProps`.
   */
  fromTo<T extends object>(
    target: T,
    fromProps: Record<string, number>,
    toProps: Record<string, number>,
    options: TweenOptions & { at?: number | string },
  ): this {
    const at = this._resolveAt(options.at);
    const duration = options.duration;

    const userOnStart = options.onStart;
    const tween = new Tween(target, toProps, {
      ...options,
      delay: at,
      onStart: () => {
        for (const [key, val] of Object.entries(fromProps)) {
          (target as Record<string, number>)[key] = val;
        }
        userOnStart?.();
      },
    });

    this._addTweenEntry(at, duration, tween);
    return this;
  }

  /**
   * Instantly set target properties at the given position (no animation).
   */
  set<T extends object>(
    target: T,
    props: Record<string, number>,
    options: { at?: number | string } = {},
  ): this {
    const at = this._resolveAt(options.at);
    // Zero-duration tween that snaps immediately.
    const tween = new Tween(target, props, { duration: 0, delay: at });
    this._addTweenEntry(at, 0, tween);
    return this;
  }

  // ---------------------------------------------------------------------------
  // Builder — non-tween entries
  // ---------------------------------------------------------------------------

  /**
   * Insert a callback that fires when the playhead reaches `at`.
   * Does not advance the cursor.
   */
  call(fn: () => void, options: { at?: number | string } = {}): this {
    const at = this._resolveAt(options.at);
    this._entries.push({ type: 'call', at, fn, called: false });
    this._totalDuration = Math.max(this._totalDuration, at);
    return this;
  }

  /**
   * Advance the cursor by `duration` milliseconds without adding an entry.
   * Useful for inserting pauses between sequential tweens.
   */
  delay(duration: number): this {
    this._cursor = Math.max(0, this._cursor + duration);
    this._totalDuration = Math.max(this._totalDuration, this._cursor);
    return this;
  }

  // ---------------------------------------------------------------------------
  // Advancement (called by TweenManager each tick)
  // ---------------------------------------------------------------------------

  /**
   * Advance the timeline by `dt` milliseconds.
   *
   * The raw `dt` is scaled by {@link playbackRate} before being applied, so
   * setting `playbackRate = 2` makes the timeline play at double speed.
   *
   * Excess time past a cycle boundary (loop or repeat) is carried into the
   * next cycle within the same call, mirroring {@link Tween} behaviour.
   *
   * @returns `true` when the timeline is finished and should be removed from
   *   the manager.
   */
  advance(dt: number): boolean {
    if (this._killed) return true;
    if (this._completed) return true;
    if (this._paused) return false;

    let scaledDt = dt * this._playbackRate;

    // ── Repeat delay (between-cycle pause) ───────────────────────────────
    if (this._inRepeatDelay) {
      this._repeatDelayRemaining -= scaledDt;
      if (this._repeatDelayRemaining > 0) return false;
      // Carry excess past the repeat delay into the new cycle.
      scaledDt = -this._repeatDelayRemaining;
      this._repeatDelayRemaining = 0;
      this._inRepeatDelay = false;
      this._elapsed = 0;
    }

    let remainingDt = scaledDt;
    do {
      const tickDt = remainingDt;
      remainingDt = 0;

      this._elapsed += tickDt;

      // ── Drive tweens ────────────────────────────────────────────────────
      for (const entry of this._entries) {
        if (entry.type === 'tween') {
          if (!entry.tween.isCompleted && !entry.tween.isKilled) {
            entry.tween.advance(tickDt);
          }
          continue;
        }

        // ── Fire callbacks at the correct moment ──────────────────────────
        if (!entry.called && this._elapsed >= entry.at) {
          entry.called = true;
          entry.fn();
        }
      }

      // ── Check completion ────────────────────────────────────────────────
      if (this._elapsed >= this._totalDuration) {
        if (this._repeatsDone < this._totalRepeats) {
          this._repeatsDone++;
          this._loopCount++;
          const excess = this._elapsed - this._totalDuration;
          const repeatDelay = this._opts.repeatDelay;

          this._resetEntries();
          this._elapsed = 0;

          if (repeatDelay > 0) {
            const delayRemaining = repeatDelay - excess;
            if (delayRemaining > 0) {
              this._inRepeatDelay = true;
              this._repeatDelayRemaining = delayRemaining;
              return false;
            }
            // Excess consumed the delay; carry remainder into new cycle.
            remainingDt = -delayRemaining;
          } else {
            remainingDt = excess;
          }

          continue;
        }

        this._completed = true;
        this._opts.onComplete();
        return true;
      }
    } while (remainingDt > 0);

    return false;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Resolve an `at` position string/number against the current cursor. */
  private _resolveAt(position?: number | string): number {
    if (position === undefined) return this._cursor;
    if (typeof position === 'number') return Math.max(0, position);
    if (position === '<') return this._lastAt;
    if (position.startsWith('+=')) return this._cursor + parseFloat(position.slice(2));
    if (position.startsWith('-='))
      return Math.max(0, this._cursor - parseFloat(position.slice(2)));
    return this._cursor;
  }

  private _addTweenEntry(at: number, duration: number, tween: Tween): void {
    this._entries.push({ type: 'tween', at, duration, tween });
    this._lastAt = at;
    this._cursor = at + duration;
    this._totalDuration = Math.max(this._totalDuration, this._cursor);
  }

  /** Reset tweens and call-entry flags so the timeline can loop. */
  private _resetEntries(): void {
    for (const entry of this._entries) {
      if (entry.type === 'call') {
        entry.called = false;
      } else {
        // Reset the tween so it replays from the start on next loop.
        // 'from' values are re-captured from the target at the moment the
        // tween next starts (after its delay), so chained tweens on the same
        // target naturally pick up where the previous tween left off.
        entry.tween.reset();
      }
    }
  }
}
