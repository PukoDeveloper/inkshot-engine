import type { WorkerTask, WorkerResult } from '../types/worker.js';

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface WorkerBridgeOptions {
  /**
   * Maximum number of tasks allowed to be in-flight simultaneously.
   * `0` means unlimited (default).
   *
   * When the limit is reached, new `run()` calls are queued and dispatched as
   * earlier tasks complete.
   */
  maxConcurrent?: number;
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface PendingTask<O> {
  resolve: (value: O) => void;
  reject: (reason: unknown) => void;
}

interface QueuedTask<I extends Record<string, unknown>> {
  task: WorkerTask<I>;
  transfer: Transferable[] | undefined;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}

// ---------------------------------------------------------------------------
// WorkerBridge
// ---------------------------------------------------------------------------

/**
 * Generic bridge between the main thread and a Web Worker.
 *
 * ### Protocol
 * - Main thread sends `WorkerTask<I>` messages via `postMessage`.
 * - Worker replies with `WorkerResult<O>` messages carrying the same `id`.
 * - Each `run()` call returns a `Promise<O>` that resolves / rejects when the
 *   matching reply arrives.
 *
 * ### Usage
 * ```ts
 * const bridge = new WorkerBridge<MyPayload, MyResult>(
 *   new URL('./my.worker.ts', import.meta.url),
 * );
 *
 * const result = await bridge.run('compute', { data: [1, 2, 3] });
 * bridge.terminate();
 * ```
 *
 * ### Transferable objects
 * Pass large `ArrayBuffer` / `Float32Array` data via the optional `transfer`
 * argument to avoid copying:
 * ```ts
 * const buf = new Float32Array([1, 2, 3]).buffer;
 * await bridge.run('init', { grid: buf }, [buf]);
 * ```
 */
export class WorkerBridge<
  I extends Record<string, unknown> = Record<string, unknown>,
  O = unknown,
> {
  private readonly _worker: Worker;
  private readonly _pending = new Map<string, PendingTask<O>>();
  private readonly _queue: QueuedTask<I>[] = [];
  private readonly _maxConcurrent: number;
  private _inFlight = 0;
  private _idCounter = 0;
  private _terminated = false;

  constructor(workerUrl: string | URL, options: WorkerBridgeOptions = {}) {
    this._maxConcurrent = options.maxConcurrent ?? 0;
    this._worker = new Worker(workerUrl, { type: 'module' });

    this._worker.onmessage = (evt: MessageEvent<WorkerResult<O>>) => {
      const msg = evt.data;
      const pending = this._pending.get(msg.id);
      if (!pending) return;
      this._pending.delete(msg.id);
      this._inFlight--;

      if (msg.error !== undefined) {
        pending.reject(new Error(msg.error));
      } else {
        pending.resolve(msg.result as O);
      }

      // Dispatch next queued task, if any.
      this._drainQueue();
    };

    this._worker.onerror = (evt: ErrorEvent) => {
      // Reject all pending tasks on an uncaught worker error.
      const err = new Error(evt.message ?? 'Unknown Worker error');
      for (const pending of this._pending.values()) {
        pending.reject(err);
      }
      this._pending.clear();
      this._inFlight = 0;

      // Reject any queued-but-not-yet-sent tasks too.
      for (const queued of this._queue) {
        queued.reject(err);
      }
      this._queue.length = 0;
    };
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Send a task to the Worker and await its result.
   *
   * @param type     Discriminator string for the Worker to route the task.
   * @param payload  Data to pass to the Worker.
   * @param transfer Optional `Transferable` objects (e.g. `ArrayBuffer`) that
   *                 are *transferred* rather than copied — zero-copy transfer.
   * @returns        A `Promise` that resolves with the Worker's result, or
   *                 rejects if the Worker replies with an error.
   */
  run(type: string, payload: I, transfer?: Transferable[]): Promise<O> {
    if (this._terminated) {
      return Promise.reject(
        new Error('[WorkerBridge] Cannot run tasks: Worker has been terminated.'),
      );
    }

    const id = String(++this._idCounter);
    const task: WorkerTask<I> = { id, type, payload };

    return new Promise<O>((resolve, reject) => {
      if (this._maxConcurrent > 0 && this._inFlight >= this._maxConcurrent) {
        // Queue the task for later dispatch.
        this._queue.push({ task, transfer, resolve: resolve as (v: unknown) => void, reject });
      } else {
        this._dispatch(task, transfer, resolve, reject);
      }
    });
  }

  /**
   * Terminate the underlying Worker immediately.
   *
   * All in-flight and queued tasks are rejected with a cancellation error.
   * Subsequent calls to `run()` will also reject immediately.
   */
  terminate(): void {
    if (this._terminated) return;
    this._terminated = true;

    const err = new Error('[WorkerBridge] Worker terminated.');
    for (const pending of this._pending.values()) {
      pending.reject(err);
    }
    this._pending.clear();
    this._inFlight = 0;

    for (const queued of this._queue) {
      queued.reject(err);
    }
    this._queue.length = 0;

    this._worker.terminate();
  }

  /** `true` after `terminate()` has been called. */
  get isTerminated(): boolean {
    return this._terminated;
  }

  /** Number of tasks currently awaiting a reply from the Worker. */
  get pendingCount(): number {
    return this._inFlight;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _dispatch(
    task: WorkerTask<I>,
    transfer: Transferable[] | undefined,
    resolve: (value: O) => void,
    reject: (reason: unknown) => void,
  ): void {
    this._pending.set(task.id, { resolve, reject });
    this._inFlight++;

    if (transfer && transfer.length > 0) {
      this._worker.postMessage(task, transfer);
    } else {
      this._worker.postMessage(task);
    }
  }

  private _drainQueue(): void {
    if (this._queue.length === 0) return;
    if (this._maxConcurrent > 0 && this._inFlight >= this._maxConcurrent) return;

    const queued = this._queue.shift()!;
    this._dispatch(
      queued.task,
      queued.transfer,
      queued.resolve as (v: O) => void,
      queued.reject,
    );
  }
}
