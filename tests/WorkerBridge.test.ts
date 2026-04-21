import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkerBridge } from '../src/core/WorkerBridge.js';
import type { WorkerTask, WorkerResult } from '../src/types/worker.js';

// ---------------------------------------------------------------------------
// Mock Worker
//
// jsdom does not implement a real Web Worker.  We replace the global `Worker`
// constructor with a minimal in-process stub that round-trips postMessage
// synchronously (using microtasks via Promise.resolve).
// ---------------------------------------------------------------------------

type WorkerMessageHandler = (evt: { data: unknown }) => void;
type WorkerErrorHandler = (evt: ErrorEvent) => void;

interface MockWorkerInstance {
  onmessage: WorkerMessageHandler | null;
  onerror: WorkerErrorHandler | null;
  postMessage: (msg: unknown, transfer?: Transferable[]) => void;
  terminate: () => void;
  /** Simulate the worker replying with a result. */
  sendResult: <R>(id: string, result: R) => void;
  /** Simulate the worker replying with an error. */
  sendError: (id: string, error: string) => void;
  /** Simulate an uncaught worker error (fires onerror). */
  triggerError: (message: string) => void;
  /** All messages received by this worker. */
  received: WorkerTask[];
  /** Whether terminate() was called. */
  terminated: boolean;
}

function createMockWorker(): MockWorkerInstance {
  const instance: MockWorkerInstance = {
    onmessage: null,
    onerror: null,
    received: [],
    terminated: false,
    postMessage(msg) {
      instance.received.push(msg as WorkerTask);
    },
    terminate() {
      instance.terminated = true;
    },
    sendResult<R>(id: string, result: R) {
      const reply: WorkerResult<R> = { id, result };
      instance.onmessage?.({ data: reply });
    },
    sendError(id: string, error: string) {
      const reply: WorkerResult<never> = { id, error };
      instance.onmessage?.({ data: reply });
    },
    triggerError(message: string) {
      instance.onerror?.({ message } as ErrorEvent);
    },
  };
  return instance;
}

// ---------------------------------------------------------------------------
// Patch global Worker constructor
// ---------------------------------------------------------------------------

let mockWorkerInstance: MockWorkerInstance;

class MockWorkerConstructor {
  constructor(_url: string | URL, _opts?: WorkerOptions) {
    mockWorkerInstance = createMockWorker();
    return mockWorkerInstance;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('WorkerBridge', () => {
  let originalWorker: typeof Worker;

  beforeEach(() => {
    originalWorker = globalThis.Worker;
    // @ts-expect-error — replacing with mock
    globalThis.Worker = MockWorkerConstructor;
  });

  afterEach(() => {
    globalThis.Worker = originalWorker;
  });

  // -------------------------------------------------------------------------
  // Basic run / reply
  // -------------------------------------------------------------------------

  describe('run()', () => {
    it('sends a WorkerTask and resolves when the Worker replies', async () => {
      const bridge = new WorkerBridge('worker.js');
      const promise = bridge.run('compute', { value: 42 });

      // Worker should have received one message
      expect(mockWorkerInstance.received).toHaveLength(1);
      const sent = mockWorkerInstance.received[0]!;
      expect(sent.type).toBe('compute');
      expect((sent.payload as { value: number }).value).toBe(42);
      expect(typeof sent.id).toBe('string');

      // Simulate worker reply
      mockWorkerInstance.sendResult(sent.id, { doubled: 84 });

      const result = await promise;
      expect((result as { doubled: number }).doubled).toBe(84);
    });

    it('rejects when the Worker replies with an error', async () => {
      const bridge = new WorkerBridge('worker.js');
      const promise = bridge.run('fail', {});

      const sent = mockWorkerInstance.received[0]!;
      mockWorkerInstance.sendError(sent.id, 'Something went wrong');

      await expect(promise).rejects.toThrow('Something went wrong');
    });

    it('assigns unique sequential IDs to each task', async () => {
      const bridge = new WorkerBridge('worker.js');
      const p1 = bridge.run('task', {});
      const p2 = bridge.run('task', {});

      const [msg1, msg2] = mockWorkerInstance.received as [WorkerTask, WorkerTask];
      expect(msg1.id).not.toBe(msg2.id);

      mockWorkerInstance.sendResult(msg1.id, 'r1');
      mockWorkerInstance.sendResult(msg2.id, 'r2');
      await Promise.all([p1, p2]);
    });

    it('resolves concurrent tasks independently', async () => {
      const bridge = new WorkerBridge('worker.js');
      const p1 = bridge.run('a', {});
      const p2 = bridge.run('b', {});

      const [m1, m2] = mockWorkerInstance.received as [WorkerTask, WorkerTask];

      // Reply out-of-order
      mockWorkerInstance.sendResult(m2.id, 'second');
      mockWorkerInstance.sendResult(m1.id, 'first');

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1).toBe('first');
      expect(r2).toBe('second');
    });

    it('ignores replies with unknown IDs', async () => {
      const bridge = new WorkerBridge('worker.js');
      const promise = bridge.run('ok', {});
      const sent = mockWorkerInstance.received[0]!;

      // Stray reply with a wrong ID — should not crash or interfere
      mockWorkerInstance.sendResult('nonexistent-id', 'garbage');

      mockWorkerInstance.sendResult(sent.id, 'correct');
      const result = await promise;
      expect(result).toBe('correct');
    });
  });

  // -------------------------------------------------------------------------
  // Transferable objects
  // -------------------------------------------------------------------------

  describe('Transferable transfer', () => {
    it('calls postMessage with the transfer list', () => {
      const bridge = new WorkerBridge('worker.js');
      const buf = new ArrayBuffer(8);
      const spy = vi.spyOn(mockWorkerInstance, 'postMessage');

      bridge.run('init', { grid: buf } as Record<string, unknown>, [buf]);

      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'init' }),
        [buf],
      );
    });

    it('calls postMessage without a transfer list when none provided', () => {
      const bridge = new WorkerBridge('worker.js');
      const spy = vi.spyOn(mockWorkerInstance, 'postMessage');

      bridge.run('plain', { x: 1 });

      // postMessage should be called with only the message (no second arg)
      expect(spy).toHaveBeenCalledWith(expect.objectContaining({ type: 'plain' }));
      // The mock implementation signature has only one required param
      expect(spy.mock.calls[0]).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // maxConcurrent throttling
  // -------------------------------------------------------------------------

  describe('maxConcurrent option', () => {
    it('queues tasks beyond maxConcurrent and dispatches after a slot frees', async () => {
      const bridge = new WorkerBridge('worker.js', { maxConcurrent: 1 });

      const p1 = bridge.run('t1', {});
      const p2 = bridge.run('t2', {}); // queued

      // Only the first message should have been sent so far
      expect(mockWorkerInstance.received).toHaveLength(1);

      // Resolve the first task — p2 should be dispatched
      const m1 = mockWorkerInstance.received[0]!;
      mockWorkerInstance.sendResult(m1.id, 'result1');
      await p1;

      // Now the second task should have been sent
      expect(mockWorkerInstance.received).toHaveLength(2);

      const m2 = mockWorkerInstance.received[1]!;
      mockWorkerInstance.sendResult(m2.id, 'result2');
      const r2 = await p2;
      expect(r2).toBe('result2');
    });

    it('allows unlimited concurrency when maxConcurrent is 0 (default)', () => {
      const bridge = new WorkerBridge('worker.js');
      bridge.run('x', {});
      bridge.run('y', {});
      bridge.run('z', {});
      expect(mockWorkerInstance.received).toHaveLength(3);
    });
  });

  // -------------------------------------------------------------------------
  // terminate()
  // -------------------------------------------------------------------------

  describe('terminate()', () => {
    it('calls worker.terminate() and sets isTerminated', () => {
      const bridge = new WorkerBridge('worker.js');
      expect(bridge.isTerminated).toBe(false);

      bridge.terminate();

      expect(bridge.isTerminated).toBe(true);
      expect(mockWorkerInstance.terminated).toBe(true);
    });

    it('rejects all in-flight tasks on termination', async () => {
      const bridge = new WorkerBridge('worker.js');
      const promise = bridge.run('task', {});

      bridge.terminate();

      await expect(promise).rejects.toThrow('[WorkerBridge] Worker terminated.');
    });

    it('rejects queued tasks on termination', async () => {
      const bridge = new WorkerBridge('worker.js', { maxConcurrent: 1 });
      const p1 = bridge.run('t1', {});   // in-flight — will be rejected, so we must catch it
      const p2 = bridge.run('t2', {}); // queued

      bridge.terminate();

      await expect(p1).rejects.toThrow('[WorkerBridge] Worker terminated.');
      await expect(p2).rejects.toThrow('[WorkerBridge] Worker terminated.');
    });

    it('rejects new run() calls after termination', async () => {
      const bridge = new WorkerBridge('worker.js');
      bridge.terminate();

      await expect(bridge.run('post-terminate', {})).rejects.toThrow(
        '[WorkerBridge] Cannot run tasks: Worker has been terminated.',
      );
    });

    it('is idempotent — calling terminate() twice does not throw', () => {
      const bridge = new WorkerBridge('worker.js');
      bridge.terminate();
      expect(() => bridge.terminate()).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // onerror — uncaught Worker error
  // -------------------------------------------------------------------------

  describe('Worker onerror', () => {
    it('rejects all pending tasks when the Worker fires onerror', async () => {
      const bridge = new WorkerBridge('worker.js');
      const p1 = bridge.run('a', {});
      const p2 = bridge.run('b', {});

      mockWorkerInstance.triggerError('crash');

      await expect(p1).rejects.toThrow('crash');
      await expect(p2).rejects.toThrow('crash');
    });
  });

  // -------------------------------------------------------------------------
  // pendingCount
  // -------------------------------------------------------------------------

  describe('pendingCount', () => {
    it('reflects the number of in-flight tasks', async () => {
      const bridge = new WorkerBridge('worker.js');
      expect(bridge.pendingCount).toBe(0);

      const p1 = bridge.run('a', {});
      const p2 = bridge.run('b', {});
      expect(bridge.pendingCount).toBe(2);

      const m1 = mockWorkerInstance.received[0]!;
      mockWorkerInstance.sendResult(m1.id, 'r1');
      await p1;
      expect(bridge.pendingCount).toBe(1);

      const m2 = mockWorkerInstance.received[1]!;
      mockWorkerInstance.sendResult(m2.id, 'r2');
      await p2;
      expect(bridge.pendingCount).toBe(0);
    });
  });
});
