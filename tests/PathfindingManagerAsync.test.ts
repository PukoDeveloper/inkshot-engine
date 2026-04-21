/**
 * Tests for `PathfindingManager` — `pathfinding/find:async` event and
 * Worker-mode grid synchronisation.
 *
 * The Worker is mocked with a lightweight in-process stub (see WorkerBridge.test.ts
 * for the WorkerBridge unit tests).  Here we verify the behaviour of
 * PathfindingManager when `workerUrl` is provided:
 *
 * 1. Falls back to synchronous A* before the Worker has been initialised.
 * 2. After the Worker acknowledges the `init` message, delegates `find` to it.
 * 3. Collects dynamic-obstacle cells on the main thread and passes them to Worker.
 * 4. Sends `tile:update` to the Worker when a single tile changes.
 * 5. Sends `cache:clear` to the Worker when the cache is cleared manually.
 * 6. Falls back to sync A* when no `workerUrl` is supplied.
 * 7. Terminates the Worker on `destroy()`.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { EntityManager } from '../src/plugins/entity/EntityManager.js';
import { PathfindingManager } from '../src/plugins/world/PathfindingManager.js';
import type { PathfindingFindOutput } from '../src/types/pathfinding.js';
import type { Core } from '../src/core/Core.js';
import type { WorkerTask, WorkerResult } from '../src/types/worker.js';

// ---------------------------------------------------------------------------
// Mock Worker (same approach as WorkerBridge.test.ts)
// ---------------------------------------------------------------------------

interface MockWorkerInstance {
  onmessage: ((evt: { data: unknown }) => void) | null;
  onerror: ((evt: ErrorEvent) => void) | null;
  postMessage: (msg: unknown, transfer?: Transferable[]) => void;
  terminate: () => void;
  sendResult: <R>(id: string, result: R) => void;
  sendError: (id: string, error: string) => void;
  received: WorkerTask[];
  terminated: boolean;
}

let mockWorkerInstance: MockWorkerInstance;

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
  };
  return instance;
}

class MockWorkerConstructor {
  constructor(_url: string | URL, _opts?: WorkerOptions) {
    mockWorkerInstance = createMockWorker();
    return mockWorkerInstance;
  }
}

// ---------------------------------------------------------------------------
// Engine stubs
// ---------------------------------------------------------------------------

function createContainerStub() {
  const children: unknown[] = [];
  return {
    x: 0, y: 0, label: '', parent: null as unknown,
    addChild(c: unknown) { children.push(c); (c as Record<string, unknown>).parent = this; },
    removeChild(c: unknown) {
      const i = children.indexOf(c);
      if (i >= 0) children.splice(i, 1);
      (c as Record<string, unknown>).parent = null;
    },
    destroy: vi.fn(),
    children,
  };
}

function createCoreStub() {
  const events = new EventBus();
  const worldLayer = createContainerStub();
  events.on('test', 'renderer/layer', (_p: { name: string }, output: { layer: unknown }) => {
    if (_p.name === 'world') output.layer = worldLayer;
  });
  return { core: { events } as unknown as Core };
}

const TILE_SIZE = 16;

const TILEMAP_5X5 = {
  tileSize: TILE_SIZE,
  layers: [
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 1, 0, 0],
    [1, 1, 1, 1, 1],
    [0, 0, 0, 0, 0],
  ],
  tileShapes: { 1: 'solid' as const },
};

function tileCenter(row: number, col: number) {
  return { x: col * TILE_SIZE + TILE_SIZE / 2, y: row * TILE_SIZE + TILE_SIZE / 2 };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Simulate the Worker acknowledging an `init` message.
 * After this call `pathfinding/find:async` will delegate to the Worker.
 */
async function ackInit(): Promise<void> {
  // The WorkerBridge's promise needs a microtask to settle
  await Promise.resolve();
  const initMsg = mockWorkerInstance.received.find((m) => m.type === 'init');
  expect(initMsg).toBeDefined();
  mockWorkerInstance.sendResult(initMsg!.id, { ok: true });
  // Let the .then() callback (sets _workerReady = true) execute
  await Promise.resolve();
  await Promise.resolve();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PathfindingManager — pathfinding/find:async', () => {
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
  // No-worker mode (workerUrl omitted)
  // -------------------------------------------------------------------------

  describe('without workerUrl', () => {
    it('find:async falls back to sync A* and returns a valid path', async () => {
      const { core } = createCoreStub();
      const em = new EntityManager();
      const pf = new PathfindingManager(); // no workerUrl
      em.init(core);
      pf.init(core);

      core.events.emitSync('physics/tilemap:set', TILEMAP_5X5);

      const { output } = await core.events.emit<unknown, PathfindingFindOutput>(
        'pathfinding/find:async',
        { from: tileCenter(0, 0), to: tileCenter(0, 4) },
      );

      expect(output.found).toBe(true);
      expect(output.path.length).toBeGreaterThan(1);
    });

    it('find:async returns found=false when no tilemap loaded', async () => {
      const { core } = createCoreStub();
      const pf = new PathfindingManager();
      pf.init(core);

      const { output } = await core.events.emit<unknown, PathfindingFindOutput>(
        'pathfinding/find:async',
        { from: { x: 8, y: 8 }, to: { x: 72, y: 8 } },
      );

      expect(output.found).toBe(false);
    });

    it('destroy() works normally when no worker was created', () => {
      const { core } = createCoreStub();
      const pf = new PathfindingManager();
      pf.init(core);
      expect(() => pf.destroy(core)).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Worker mode — before worker is ready (fallback)
  // -------------------------------------------------------------------------

  describe('with workerUrl — before Worker acknowledges init', () => {
    it('falls back to sync A* when the Worker has not yet acknowledged init', async () => {
      const { core } = createCoreStub();
      const em = new EntityManager();
      const pf = new PathfindingManager({ workerUrl: 'pathfinding.worker.js' });
      em.init(core);
      pf.init(core);

      core.events.emitSync('physics/tilemap:set', TILEMAP_5X5);
      // Do NOT ack init — _workerReady should still be false

      const { output } = await core.events.emit<unknown, PathfindingFindOutput>(
        'pathfinding/find:async',
        { from: tileCenter(0, 0), to: tileCenter(0, 4) },
      );

      // Synchronous fallback — should still find a valid path
      expect(output.found).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Worker mode — after worker is ready
  // -------------------------------------------------------------------------

  describe('with workerUrl — after Worker acknowledges init', () => {
    it('sends an init message to the Worker when tilemap is loaded', async () => {
      const { core } = createCoreStub();
      const pf = new PathfindingManager({ workerUrl: 'pathfinding.worker.js' });
      pf.init(core);

      core.events.emitSync('physics/tilemap:set', TILEMAP_5X5);
      await Promise.resolve();

      const initMsg = mockWorkerInstance.received.find((m) => m.type === 'init');
      expect(initMsg).toBeDefined();
      const p = initMsg!.payload as {
        rows: number; cols: number; tileSize: number; directions: number;
      };
      expect(p.rows).toBe(5);
      expect(p.cols).toBe(5);
      expect(p.tileSize).toBe(TILE_SIZE);
    });

    it('delegates find to the Worker and resolves with its reply', async () => {
      const { core } = createCoreStub();
      const em = new EntityManager();
      const pf = new PathfindingManager({ workerUrl: 'pathfinding.worker.js' });
      em.init(core);
      pf.init(core);

      core.events.emitSync('physics/tilemap:set', TILEMAP_5X5);
      await ackInit();

      // Emit find:async — WorkerBridge sends a 'find' task; we intercept and reply
      const findPromise = core.events.emit<unknown, PathfindingFindOutput>(
        'pathfinding/find:async',
        { from: tileCenter(0, 0), to: tileCenter(0, 4) },
      );

      // Allow the async handler to post the message to the worker
      await Promise.resolve();

      const findMsg = mockWorkerInstance.received.find((m) => m.type === 'find');
      expect(findMsg).toBeDefined();

      const expectedPath = [tileCenter(0, 0), tileCenter(0, 2), tileCenter(0, 4)];
      const workerResult: PathfindingFindOutput = { found: true, path: expectedPath, cost: 4 };
      mockWorkerInstance.sendResult(findMsg!.id, workerResult);

      const { output } = await findPromise;
      expect(output.found).toBe(true);
      expect(output.path).toEqual(expectedPath);
      expect(output.cost).toBe(4);
    });

    it('passes find params correctly to the Worker', async () => {
      const { core } = createCoreStub();
      const em = new EntityManager();
      const pf = new PathfindingManager({ workerUrl: 'pathfinding.worker.js' });
      em.init(core);
      pf.init(core);

      core.events.emitSync('physics/tilemap:set', TILEMAP_5X5);
      await ackInit();

      const from = tileCenter(0, 0);
      const to = tileCenter(0, 4);
      const findPromise = core.events.emit<unknown, PathfindingFindOutput>(
        'pathfinding/find:async',
        { from, to, fallbackToNearest: true, smoothPath: true, maxIterations: 5000 },
      );
      await Promise.resolve();

      const findMsg = mockWorkerInstance.received.find((m) => m.type === 'find');
      const p = findMsg!.payload as { params: Record<string, unknown> };
      expect(p.params.fallbackToNearest).toBe(true);
      expect(p.params.smoothPath).toBe(true);
      expect(p.params.maxIterations).toBe(5000);

      // Provide a reply to settle the promise
      mockWorkerInstance.sendResult(findMsg!.id, { found: false, path: [], cost: 0 });
      await findPromise;
    });

    it('collects dynamic-obstacle cells and passes them to the Worker', async () => {
      const { core } = createCoreStub();
      const em = new EntityManager();
      const pf = new PathfindingManager({ workerUrl: 'pathfinding.worker.js' });
      em.init(core);
      pf.init(core);

      const corridor = {
        tileSize: TILE_SIZE,
        layers: [[0, 0, 0, 0, 0]],
        tileShapes: {},
      };
      core.events.emitSync('physics/tilemap:set', corridor);
      await ackInit();

      // Place an entity at tile [0][2]
      em.create({ position: tileCenter(0, 2) });

      const findPromise = core.events.emit<unknown, PathfindingFindOutput>(
        'pathfinding/find:async',
        { from: tileCenter(0, 0), to: tileCenter(0, 4), includeDynamicObstacles: true },
      );
      await Promise.resolve();

      const findMsg = mockWorkerInstance.received.find((m) => m.type === 'find');
      const p = findMsg!.payload as { dynamicObstacleCells: Array<[number, number]> };
      expect(p.dynamicObstacleCells).toContainEqual([0, 2]);

      mockWorkerInstance.sendResult(findMsg!.id, { found: false, path: [], cost: 0 });
      await findPromise;
    });

    it('propagates nearest from Worker reply', async () => {
      const { core } = createCoreStub();
      const em = new EntityManager();
      const pf = new PathfindingManager({ workerUrl: 'pathfinding.worker.js' });
      em.init(core);
      pf.init(core);

      core.events.emitSync('physics/tilemap:set', TILEMAP_5X5);
      await ackInit();

      const findPromise = core.events.emit<unknown, PathfindingFindOutput>(
        'pathfinding/find:async',
        { from: tileCenter(0, 0), to: tileCenter(2, 2), fallbackToNearest: true },
      );
      await Promise.resolve();

      const findMsg = mockWorkerInstance.received.find((m) => m.type === 'find');
      const nearest = { x: 24, y: 24 };
      mockWorkerInstance.sendResult(findMsg!.id, {
        found: true,
        path: [tileCenter(0, 0), nearest],
        cost: 2,
        nearest,
      });

      const { output } = await findPromise;
      expect(output.nearest).toEqual(nearest);
    });
  });

  // -------------------------------------------------------------------------
  // tile:update — Worker sync on single tile change
  // -------------------------------------------------------------------------

  describe('tile:update Worker sync', () => {
    it('sends tile:update to the Worker when tilemap/set-tile fires', async () => {
      const { core } = createCoreStub();
      const pf = new PathfindingManager({ workerUrl: 'pathfinding.worker.js' });
      pf.init(core);

      core.events.emitSync('physics/tilemap:set', TILEMAP_5X5);
      await ackInit();

      // Open the solid tile at [2][2]
      core.events.emitSync('tilemap/set-tile', { row: 2, col: 2, tileId: 0, layerIndex: 0 });

      await Promise.resolve();

      const updateMsg = mockWorkerInstance.received.find((m) => m.type === 'tile:update');
      expect(updateMsg).toBeDefined();
      const p = updateMsg!.payload as { row: number; col: number; cost: number };
      expect(p.row).toBe(2);
      expect(p.col).toBe(2);
      expect(p.cost).toBe(1); // tileId 0 = passable = cost 1
    });

    it('does NOT send tile:update before Worker is ready', () => {
      const { core } = createCoreStub();
      const pf = new PathfindingManager({ workerUrl: 'pathfinding.worker.js' });
      pf.init(core);

      core.events.emitSync('physics/tilemap:set', TILEMAP_5X5);
      // Do NOT ack init

      core.events.emitSync('tilemap/set-tile', { row: 2, col: 2, tileId: 0, layerIndex: 0 });

      const updateMsg = mockWorkerInstance.received.find((m) => m.type === 'tile:update');
      expect(updateMsg).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // cache:clear — Worker sync
  // -------------------------------------------------------------------------

  describe('cache:clear Worker sync', () => {
    it('sends cache:clear to Worker when pathfinding/cache:clear fires', async () => {
      const { core } = createCoreStub();
      const pf = new PathfindingManager({ workerUrl: 'pathfinding.worker.js' });
      pf.init(core);

      core.events.emitSync('physics/tilemap:set', TILEMAP_5X5);
      await ackInit();

      core.events.emitSync('pathfinding/cache:clear', {});
      await Promise.resolve();

      const clearMsg = mockWorkerInstance.received.find((m) => m.type === 'cache:clear');
      expect(clearMsg).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // destroy()
  // -------------------------------------------------------------------------

  describe('destroy() with Worker', () => {
    it('terminates the Worker on destroy', async () => {
      const { core } = createCoreStub();
      const pf = new PathfindingManager({ workerUrl: 'pathfinding.worker.js' });
      pf.init(core);

      core.events.emitSync('physics/tilemap:set', TILEMAP_5X5);
      await ackInit();

      pf.destroy(core);

      expect(mockWorkerInstance.terminated).toBe(true);
    });

    it('does not throw if destroy is called before tilemap is loaded', () => {
      const { core } = createCoreStub();
      const pf = new PathfindingManager({ workerUrl: 'pathfinding.worker.js' });
      pf.init(core);

      expect(() => pf.destroy(core)).not.toThrow();
    });
  });
});
