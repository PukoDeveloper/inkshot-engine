// ---------------------------------------------------------------------------
// WorkerBridge message protocol
// ---------------------------------------------------------------------------

/**
 * A task message sent from the main thread to a Worker.
 *
 * The Worker must reply with a {@link WorkerResult} carrying the same `id`.
 */
export interface WorkerTask<P = unknown> {
  /** Unique identifier that correlates this request with its response. */
  readonly id: string;
  /** Discriminator string used by the Worker to dispatch to the correct handler. */
  readonly type: string;
  /** Data payload forwarded to the Worker handler. */
  readonly payload: P;
}

/**
 * A result message sent from a Worker back to the main thread.
 *
 * Exactly one of `result` or `error` will be present.
 */
export interface WorkerResult<R = unknown> {
  /** Mirrors the `id` of the originating {@link WorkerTask}. */
  readonly id: string;
  /** Successful result value. Present when `error` is absent. */
  readonly result?: R;
  /** Error message string. Present when the task threw an exception. */
  readonly error?: string;
}
