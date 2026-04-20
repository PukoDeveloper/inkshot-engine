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
  /** Whether to repeat the timeline indefinitely. Note: tweens inside the timeline are reset via `Tween.reset()` on each loop iteration, which re-captures `from` values from the target at that moment. */
  loop?: boolean;
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

  /** Timeline playhead position in ms. */
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

  private readonly _opts: Required<TimelineOptions>;

  constructor(options: TimelineOptions = {}) {
    this._opts = {
      onComplete: options.onComplete ?? (() => undefined),
      loop: options.loop ?? false,
    };
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

  /** Current playhead position in milliseconds. */
  get elapsed(): number {
    return this._elapsed;
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
   * @returns `true` when the timeline is finished and should be removed from
   *   the manager.
   */
  advance(dt: number): boolean {
    if (this._killed) return true;
    if (this._completed) return true;
    if (this._paused) return false;

    this._elapsed += dt;

    // ── Drive tweens ──────────────────────────────────────────────────────
    for (const entry of this._entries) {
      if (entry.type === 'tween') {
        if (!entry.tween.isCompleted && !entry.tween.isKilled) {
          entry.tween.advance(dt);
        }
        continue;
      }

      // ── Fire callbacks at the correct moment ──────────────────────────
      if (!entry.called && this._elapsed >= entry.at) {
        entry.called = true;
        entry.fn();
      }
    }

    // ── Check completion ──────────────────────────────────────────────────
    if (this._elapsed >= this._totalDuration) {
      if (this._opts.loop) {
        this._loopCount++;
        this._elapsed = 0;
        // Reset all tweens and call entries for the next loop.
        this._resetEntries();
        return false;
      }

      this._completed = true;
      this._opts.onComplete();
      return true;
    }

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
