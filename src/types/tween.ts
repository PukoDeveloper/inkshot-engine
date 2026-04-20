// ---------------------------------------------------------------------------
// Tween EventBus event types
// ---------------------------------------------------------------------------

/** EventBus params for `tween/to` — create and start a tween. */
export interface TweenToParams {
  /** The object whose numeric properties will be animated. */
  target: Record<string, unknown>;
  /** Map of property names to their destination values. */
  props: Record<string, number>;
  /** Duration in milliseconds. */
  duration: number;
  /**
   * Key of an {@link Easing} function (e.g. `'easeOutQuad'`).
   * Defaults to `'linear'` if omitted or unrecognised.
   */
  ease?: string;
  /** Delay before the tween starts, in milliseconds. */
  delay?: number;
  /** Whether the tween should repeat indefinitely. */
  loop?: boolean;
  /** Whether the tween should reverse on alternate iterations (requires `loop`). */
  yoyo?: boolean;
  /**
   * Number of additional times to replay after the first play.
   * `0` = play once (default). `-1` = infinite (same as `loop: true`).
   * Ignored when `loop: true`.
   */
  repeat?: number;
  /** Delay in milliseconds inserted between each repeat cycle. Defaults to `0`. */
  repeatDelay?: number;
  /**
   * Optional stable identifier.  Pass the same ID to `tween/kill` to cancel
   * this specific tween without needing a reference to the object.
   */
  id?: string;
}

/** EventBus output written by the `tween/to` handler. */
export interface TweenToOutput {
  /** The ID associated with the created tween (auto-generated if none was supplied). */
  id: string;
}

/**
 * EventBus params emitted as `tween/finished` when a tween or timeline
 * completes naturally (i.e. is not killed).
 */
export interface TweenFinishedParams {
  /** The ID of the finished animatable, if one was assigned. */
  id?: string;
  /** The target object of the finished tween. Absent for timelines. */
  target?: object;
}

/** EventBus params for `tween/kill` — stop one or more tweens. */
export interface TweenKillParams {
  /** Kill the tween with this ID. */
  id?: string;
  /** Kill all tweens targeting this object. */
  target?: Record<string, unknown>;
  /** Kill every active tween. */
  all?: boolean;
}
