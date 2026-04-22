import type { Core } from '../../core/Core.js';
import type { EnginePlugin } from '../../types/plugin.js';
import type { PhysicsTilemapSetParams } from '../../types/physics.js';
import type { TilemapSetTileParams } from '../../types/tilemap.js';
import type { EntityQueryParams, EntityQueryOutput } from '../../types/entity.js';
import type {
  PathfindingFindParams,
  PathfindingFindOutput,
  PathfindingWeightSetParams,
  PathfindingCacheClearParams,
} from '../../types/pathfinding.js';
import { WorkerBridge } from '../../core/WorkerBridge.js';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** Cost value that marks a cell as completely impassable. */
const IMPASSABLE = Infinity;

/** Maximum number of cached A* results before the oldest entry is evicted. */
const CACHE_MAX_SIZE = 512;

/** Maximum number of BFS expansions in `_findNearestPassable`. */
const NEAREST_MAX_EXPANSIONS = 1_000;

/** A single node in the A* open/closed set. */
interface AStarNode {
  row: number;
  col: number;
  /** g-cost: actual movement cost from start to this node. */
  g: number;
  /** f-cost: g + heuristic estimate to goal. */
  f: number;
  parent: AStarNode | null;
}

// ---------------------------------------------------------------------------
// Min-heap (binary heap) for the A* open set
// ---------------------------------------------------------------------------

class MinHeap {
  private readonly _data: AStarNode[] = [];

  get size(): number {
    return this._data.length;
  }

  push(node: AStarNode): void {
    this._data.push(node);
    this._bubbleUp(this._data.length - 1);
  }

  pop(): AStarNode | undefined {
    if (this._data.length === 0) return undefined;
    const top = this._data[0];
    const last = this._data.pop()!;
    if (this._data.length > 0) {
      this._data[0] = last;
      this._siftDown(0);
    }
    return top;
  }

  private _bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this._data[parent].f <= this._data[i].f) break;
      [this._data[parent], this._data[i]] = [this._data[i], this._data[parent]];
      i = parent;
    }
  }

  private _siftDown(i: number): void {
    const n = this._data.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < n && this._data[left].f < this._data[smallest].f) smallest = left;
      if (right < n && this._data[right].f < this._data[smallest].f) smallest = right;
      if (smallest === i) break;
      [this._data[smallest], this._data[i]] = [this._data[i], this._data[smallest]];
      i = smallest;
    }
  }
}

// ---------------------------------------------------------------------------
// PathfindingManager
// ---------------------------------------------------------------------------

/**
 * Options accepted by the {@link PathfindingManager} constructor.
 */
export interface PathfindingManagerOptions {
  /**
   * Movement directions supported by the pathfinder.
   * - `4` — cardinal directions only (up/down/left/right).
   * - `8` — cardinal + diagonal (default).
   */
  directions?: 4 | 8;
  /**
   * URL of the compiled pathfinding Worker script
   * (`src/workers/pathfinding.worker.ts` / its built equivalent).
   *
   * When provided, `pathfinding/find:async` offloads A* computation to the
   * Worker, keeping the main thread free.  The synchronous
   * `pathfinding/find` event is **not** affected and continues to run on the
   * main thread for full backwards compatibility.
   *
   * When omitted, `pathfinding/find:async` falls back to the same synchronous
   * A* implementation used by `pathfinding/find`.
   *
   * **Vite / bundler usage**
   * ```ts
   * new PathfindingManager({
   *   workerUrl: new URL('../workers/pathfinding.worker.ts', import.meta.url),
   * })
   * ```
   */
  workerUrl?: string | URL;
}

/**
 * Built-in plugin providing A* pathfinding on top of the tile collision map.
 *
 * ### Design
 * - **Static obstacles** — on `physics/tilemap:set` (or directly when a
 *   tilemap is loaded via `TilemapManager`) the manager rebuilds an internal
 *   cost grid.  Tiles whose collision shape is `'solid'` (or any non-`'empty'`
 *   shape) default to {@link IMPASSABLE}; all other cells default to cost `1`.
 *   Costs can be overridden per tile-value with `pathfinding/weight:set`.
 * - **Dynamic obstacles** — when `includeDynamicObstacles: true` is set on a
 *   `pathfinding/find` call, BODY-layer entities are queried via `entity/query`
 *   and their tile cells are treated as impassable for that query only.  These
 *   results are **not** cached.
 * - **Path cache** — static searches (no dynamic obstacles) are keyed by
 *   `"fromRow,fromCol→toRow,toCol"`.  The cache is automatically invalidated
 *   whenever `physics/tilemap:set` fires.  Manual invalidation is available
 *   via `pathfinding/cache:clear`.
 * - **A\* heuristic** — Chebyshev distance (correct for 8-directional grids),
 *   or Manhattan distance when configured to 4-directional movement.
 *
 * ### EventBus API
 * | Event                      | Async? | Description                                  |
 * |----------------------------|--------|----------------------------------------------|
 * | `pathfinding/find`         | ✗ sync | Run A* from `from` to `to` (world px)        |
 * | `pathfinding/find:async`   | ✓ async| Run A* — offloads to Worker when `workerUrl` is set |
 * | `pathfinding/weight:set`   | ✗ sync | Override movement cost for a tile value      |
 * | `pathfinding/cache:clear`  | ✗ sync | Manually clear the path cache                |
 *
 * **Automatic invalidation** — the cost grid and path cache are updated
 * automatically on `physics/tilemap:set` (full reload) and on
 * `tilemap/set-tile` (single-cell O(1) update).
 *
 * ### Usage
 * ```ts
 * import { createEngine, PathfindingManager } from 'inkshot-engine';
 *
 * const { core } = await createEngine({
 *   plugins: [
 *     new KinematicPhysicsAdapter(),
 *     new EntityManager(),
 *     new PathfindingManager(),
 *   ],
 * });
 *
 * // Synchronous (main thread):
 * const { output } = core.events.emitSync<PathfindingFindParams, PathfindingFindOutput>(
 *   'pathfinding/find',
 *   { from: { x: 32, y: 32 }, to: { x: 160, y: 96 } },
 * );
 * if (output.found) console.log('Path:', output.path);
 *
 * // Async / Worker-offloaded:
 * const { output } = await core.events.emit<PathfindingFindParams, PathfindingFindOutput>(
 *   'pathfinding/find:async',
 *   { from: { x: 32, y: 32 }, to: { x: 160, y: 96 } },
 * );
 * if (output.found) console.log('Path (async):', output.path);
 * ```
 */
export class PathfindingManager implements EnginePlugin {
  readonly namespace = 'pathfinding';
  /** Must be initialised after EntityManager (entity queries used at runtime). */
  readonly dependencies = ['entityManager'] as const;
  readonly editorMeta = {
    displayName: 'Pathfinding Manager',
    icon: 'pathfinding',
    description: 'Grid-based A* pathfinding with weight maps and async path queries.',
    events: [
      'pathfinding/find', 'pathfinding/find:async',
      'pathfinding/weight:set', 'pathfinding/cache:clear',
    ] as const,
  };

  /** Sentinel cost value used to flag completely impassable cells. */
  static readonly IMPASSABLE = IMPASSABLE;

  // ---------------------------------------------------------------------------
  // Internal state
  // ---------------------------------------------------------------------------

  private _core: Core | null = null;
  private readonly _options: Required<PathfindingManagerOptions>;

  /**
   * Cost grid built from the most recent `physics/tilemap:set` data.
   * `_grid[row][col]` is the movement cost for that cell (`IMPASSABLE` = blocked).
   */
  private _grid: number[][] = [];
  /** Number of rows in the current grid. */
  private _rows = 0;
  /** Number of columns in the current grid. */
  private _cols = 0;
  /** Tile size in pixels from the current tilemap (square tiles). */
  private _tileSize = 0;

  /** Per-tile-value cost overrides applied on top of the shape-based defaults. */
  private readonly _weightOverrides = new Map<number, number>();

  /** Per-tile-value raw data from the last tilemap (needed to re-apply weight overrides). */
  private _tileValues: number[][] = [];
  private _tileShapes: Record<number, string> = {};

  /** Cached A* results keyed by `"fromRow,fromCol→toRow,toCol"`. */
  private readonly _cache = new Map<string, PathfindingFindOutput>();

  /** Worker bridge for async pathfinding.  `null` when no `workerUrl` was supplied. */
  private _bridge: WorkerBridge<Record<string, unknown>, PathfindingFindOutput> | null = null;

  /**
   * `true` once the Worker has been initialised with the current cost grid.
   * While `false`, `pathfinding/find:async` falls back to the synchronous A*.
   */
  private _workerReady = false;

  constructor(options: PathfindingManagerOptions = {}) {
    this._options = {
      directions: options.directions ?? 8,
      workerUrl: options.workerUrl ?? '',
    };
  }

  // ---------------------------------------------------------------------------
  // EnginePlugin lifecycle
  // ---------------------------------------------------------------------------

  init(core: Core): void {
    this._core = core;
    const { events } = core;

    // Spin up the Worker bridge if a URL was provided.
    if (this._options.workerUrl) {
      this._bridge = new WorkerBridge<Record<string, unknown>, PathfindingFindOutput>(
        this._options.workerUrl,
      );
    }

    // Rebuild cost grid whenever the tile collision map changes.
    events.on<PhysicsTilemapSetParams>(this.namespace, 'physics/tilemap:set', (params) => {
      this._buildGrid(params);
      this._cache.clear();
      // Sync the new grid to the Worker (fire-and-forget; _workerReady gates async calls).
      this._syncGridToWorker();
    });

    // O(1) update when a single tile is changed at runtime (e.g. door opening).
    // For collider layers this fires before the subsequent `physics/tilemap:set`
    // (which rebuilds the full grid); for non-collider layers with weight overrides
    // this is the only update that fires.
    events.on<TilemapSetTileParams>(this.namespace, 'tilemap/set-tile', (params) => {
      if (this._tileSize === 0) return;
      if (!this._inBounds(params.row, params.col)) return;
      // Update the cached raw value and recompute this cell's cost.
      if (this._tileValues[params.row] !== undefined) {
        this._tileValues[params.row]![params.col] = params.tileId;
      }
      const newCost = this._cellCost(params.tileId, this._tileShapes);
      if (this._grid[params.row] !== undefined) {
        this._grid[params.row]![params.col] = newCost;
      }
      this._cache.clear();
      // Inform the Worker of the single-cell update (fire-and-forget).
      if (this._bridge && this._workerReady) {
        this._bridge
          .run('tile:update', { row: params.row, col: params.col, cost: newCost })
          .catch((err: unknown) => {
            console.warn('[PathfindingManager] Worker tile:update failed:', err);
          });
      }
    });

    events.on<PathfindingFindParams, PathfindingFindOutput>(
      this.namespace,
      'pathfinding/find',
      (params, output) => {
        const result = this._find(params);
        output.found = result.found;
        output.path  = result.path;
        output.cost  = result.cost;
        if (result.nearest !== undefined) output.nearest = result.nearest;
      },
    );

    events.on<PathfindingWeightSetParams>(
      this.namespace,
      'pathfinding/weight:set',
      (params) => {
        this._weightOverrides.set(params.tileId, params.cost);
        // Rebuild the grid so the new weight takes effect immediately.
        if (this._tileSize > 0) {
          this._rebuildGridFromCached();
          this._cache.clear();
          // Full grid changed — re-sync to Worker.
          this._syncGridToWorker();
        }
      },
    );

    events.on<PathfindingCacheClearParams>(
      this.namespace,
      'pathfinding/cache:clear',
      () => {
        this._cache.clear();
        // Also clear the Worker's internal cache.
        if (this._bridge && this._workerReady) {
          this._bridge.run('cache:clear', {}).catch((err: unknown) => {
            console.warn('[PathfindingManager] Worker cache:clear failed:', err);
          });
        }
      },
    );

    // Async variant: offloads to Worker when available, otherwise falls back
    // to the synchronous main-thread A* implementation.
    events.on<PathfindingFindParams, PathfindingFindOutput>(
      this.namespace,
      'pathfinding/find:async',
      async (params, output) => {
        let result: PathfindingFindOutput;

        if (this._bridge && this._workerReady) {
          // Collect dynamic obstacles on the main thread (entity/query requires it).
          const dynamicObstacleCells = params.includeDynamicObstacles
            ? this._buildDynamicObstacleCells(params.tagFilter)
            : [];

          result = await this._bridge.run('find', {
            params: {
              from:                params.from,
              to:                  params.to,
              fallbackToNearest:   params.fallbackToNearest,
              smoothPath:          params.smoothPath,
              maxIterations:       params.maxIterations,
            },
            dynamicObstacleCells,
          } as Record<string, unknown>);
        } else {
          // Fallback: run synchronously on the main thread.
          result = this._find(params);
        }

        output.found = result.found;
        output.path  = result.path;
        output.cost  = result.cost;
        if (result.nearest !== undefined) output.nearest = result.nearest;
      },
    );
  }

  destroy(core: Core): void {
    core.events.removeNamespace(this.namespace);
    this._grid = [];
    this._tileValues = [];
    this._tileShapes = {};
    this._cache.clear();
    this._weightOverrides.clear();
    this._rows = 0;
    this._cols = 0;
    this._tileSize = 0;
    this._core = null;
    // Shut down the Worker.
    this._bridge?.terminate();
    this._bridge = null;
    this._workerReady = false;
  }

  // ---------------------------------------------------------------------------
  // Public direct API
  // ---------------------------------------------------------------------------

  /**
   * Returns the movement cost grid cell at `(row, col)`, or `undefined` if
   * the coordinates are out of bounds.
   */
  getCellCost(row: number, col: number): number | undefined {
    return this._grid[row]?.[col];
  }

  // ---------------------------------------------------------------------------
  // Private: Worker synchronisation
  // ---------------------------------------------------------------------------

  /**
   * Serialise the current cost grid as a `Float32Array` and send it to the
   * Worker via the `init` message type.  The method is fire-and-forget; once
   * the Worker acknowledges it sets `_workerReady = true`.
   *
   * A `Float32Array` is used so that values `> Float32.MAX` (i.e. `Infinity`)
   * round-trip correctly through `postMessage` — `Infinity` is preserved by
   * the structured-clone algorithm.
   */
  private _syncGridToWorker(): void {
    if (!this._bridge || this._rows === 0 || this._cols === 0) return;

    this._workerReady = false;

    // Build a flat row-major Float32Array from the 2-D grid.
    const flat = new Float32Array(this._rows * this._cols);
    for (let r = 0; r < this._rows; r++) {
      for (let c = 0; c < this._cols; c++) {
        flat[r * this._cols + c] = this._grid[r]![c]!;
      }
    }

    // Transfer the underlying ArrayBuffer to the Worker (zero-copy).
    this._bridge
      .run(
        'init',
        {
          grid: flat,
          rows: this._rows,
          cols: this._cols,
          tileSize: this._tileSize,
          directions: this._options.directions,
        } as unknown as Record<string, unknown>,
        [flat.buffer],
      )
      .then(() => {
        this._workerReady = true;
      })
      .catch((err: unknown) => {
        // Keep _workerReady = false so find:async falls back to sync A*.
        console.warn('[PathfindingManager] Worker initialisation failed:', err);
      });
  }

  /**
   * Collect entity tile positions for the Worker's dynamic-obstacle set.
   *
   * Returns an array of `[row, col]` pairs.  This must run on the main thread
   * because `entity/query` requires EventBus access.
   */
  private _buildDynamicObstacleCells(tagFilter?: string[]): Array<[number, number]> {
    const cells: Array<[number, number]> = [];
    if (!this._core || this._tileSize === 0) return cells;

    const queryParams: EntityQueryParams =
      tagFilter && tagFilter.length > 0 ? { tags: tagFilter } : {};

    const { output } = this._core.events.emitSync<EntityQueryParams, EntityQueryOutput>(
      'entity/query',
      queryParams,
    );

    const ts = this._tileSize;
    for (const entity of (output.entities ?? [])) {
      const row = Math.floor(entity.position.y / ts);
      const col = Math.floor(entity.position.x / ts);
      if (this._inBounds(row, col)) {
        cells.push([row, col]);
      }
    }

    return cells;
  }

  // ---------------------------------------------------------------------------
  // Private: grid construction
  // ---------------------------------------------------------------------------

  private _buildGrid(params: PhysicsTilemapSetParams): void {
    const { tileSize, layers, tileShapes } = params;
    this._tileSize = tileSize;
    this._tileShapes = tileShapes as Record<number, string>;

    // Store raw tile values for future weight-override rebuilds.
    this._tileValues = layers.map(row => [...row]);

    this._rows = layers.length;
    this._cols = layers.reduce((max, row) => Math.max(max, row.length), 0);

    this._grid = Array.from({ length: this._rows }, (_, r) =>
      Array.from({ length: this._cols }, (_, c) =>
        this._cellCost(layers[r]?.[c] ?? 0, tileShapes),
      ),
    );
  }

  /** Rebuild the grid from the cached raw tile values (after a weight override). */
  private _rebuildGridFromCached(): void {
    this._grid = Array.from({ length: this._rows }, (_, r) =>
      Array.from({ length: this._cols }, (_, c) =>
        this._cellCost(this._tileValues[r]?.[c] ?? 0, this._tileShapes),
      ),
    );
  }

  /**
   * Compute the movement cost for a single cell.
   *
   * Priority (highest first):
   * 1. Explicit weight override for this tile value (`pathfinding/weight:set`).
   * 2. If the tile has a non-empty collision shape → `IMPASSABLE`.
   * 3. Default passable cost: `1`.
   */
  private _cellCost(tileValue: number, tileShapes: Record<number, string>): number {
    const override = this._weightOverrides.get(tileValue);
    if (override !== undefined) return override;

    const shape = tileShapes[tileValue];
    if (shape !== undefined && shape !== 'empty') return IMPASSABLE;

    return 1;
  }

  // ---------------------------------------------------------------------------
  // Private: A* search
  // ---------------------------------------------------------------------------

  private _find(params: PathfindingFindParams): PathfindingFindOutput {
    const empty: PathfindingFindOutput = { found: false, path: [], cost: 0 };

    if (this._tileSize === 0) return empty; // no tilemap loaded

    const ts = this._tileSize;
    const fromRow = Math.floor(params.from.y / ts);
    const fromCol = Math.floor(params.from.x / ts);
    const toRow   = Math.floor(params.to.y   / ts);
    const toCol   = Math.floor(params.to.x   / ts);

    // Already at destination
    if (fromRow === toRow && fromCol === toCol) {
      const pt = this._tileCenter(toRow, toCol);
      return { found: true, path: [pt], cost: 0 };
    }

    // Bounds check
    if (!this._inBounds(fromRow, fromCol) || !this._inBounds(toRow, toCol)) return empty;

    // Start-cell impassability check — e.g. entity was knocked into a wall.
    if (this._grid[fromRow]![fromCol]! >= IMPASSABLE) return empty;

    // Goal cell: try fallback to nearest passable when requested.
    let effectiveToRow = toRow;
    let effectiveToCol = toCol;
    let nearest: { x: number; y: number } | undefined;

    if (this._grid[toRow]![toCol]! >= IMPASSABLE) {
      if (!params.fallbackToNearest) return empty;
      const fallback = this._findNearestPassable(toRow, toCol);
      if (!fallback) return empty;
      effectiveToRow = fallback.row;
      effectiveToCol = fallback.col;
      nearest = this._tileCenter(effectiveToRow, effectiveToCol);
    }

    // Cache lookup (static searches only)
    const cacheKey = `${fromRow},${fromCol}→${effectiveToRow},${effectiveToCol}`;
    if (!params.includeDynamicObstacles) {
      const cached = this._cacheGet(cacheKey);
      if (cached) {
        // Re-attach nearest when serving from cache.
        return nearest !== undefined ? { ...cached, nearest } : cached;
      }
    }

    // Build dynamic obstacle set if requested
    const dynamicBlocked = params.includeDynamicObstacles
      ? this._buildDynamicObstacles(params.tagFilter)
      : null;

    const maxIter = params.maxIterations ?? 10_000;
    let result = this._astar(fromRow, fromCol, effectiveToRow, effectiveToCol, dynamicBlocked, maxIter);

    // Optional path smoothing (string-pulling)
    if (result.found && params.smoothPath && result.path.length > 2) {
      result = { ...result, path: this._smoothPath(result.path) };
    }

    // Attach nearest if a fallback cell was used
    if (nearest !== undefined && result.found) {
      result = { ...result, nearest };
    }

    // Cache static results (store without nearest so cache is goal-agnostic)
    if (!params.includeDynamicObstacles) {
      const toCache = nearest !== undefined ? { found: result.found, path: result.path, cost: result.cost } : result;
      this._cacheSet(cacheKey, toCache);
    }

    return result;
  }

  private _astar(
    fromRow: number, fromCol: number,
    toRow: number, toCol: number,
    dynamicBlocked: Set<string> | null,
    maxIter: number,
  ): PathfindingFindOutput {
    const empty: PathfindingFindOutput = { found: false, path: [], cost: 0 };

    const openSet = new MinHeap();
    /** Cheapest g-cost found for each cell so far; key = `"row,col"`. */
    const gScores = new Map<string, number>();
    /** Cells already processed. */
    const closed = new Set<string>();

    const startNode: AStarNode = {
      row: fromRow, col: fromCol,
      g: 0,
      f: this._heuristic(fromRow, fromCol, toRow, toCol),
      parent: null,
    };

    const startKey = `${fromRow},${fromCol}`;
    openSet.push(startNode);
    gScores.set(startKey, 0);

    let iterations = 0;

    while (openSet.size > 0) {
      if (++iterations > maxIter) return empty;

      const current = openSet.pop()!;
      const currentKey = `${current.row},${current.col}`;

      if (closed.has(currentKey)) continue;
      closed.add(currentKey);

      if (current.row === toRow && current.col === toCol) {
        // Reconstruct path
        return this._reconstructPath(current);
      }

      for (const [nr, nc, moveCost] of this._neighbours(current.row, current.col)) {
        const nKey = `${nr},${nc}`;
        if (closed.has(nKey)) continue;

        // Check static impassability
        const cellCost = this._grid[nr][nc];
        if (cellCost >= IMPASSABLE) continue;

        // Check dynamic obstacles (skip goal cell — we want to reach it)
        if (dynamicBlocked?.has(nKey) && !(nr === toRow && nc === toCol)) continue;

        const gNew = current.g + moveCost * cellCost;
        const prevG = gScores.get(nKey) ?? Infinity;
        if (gNew < prevG) {
          gScores.set(nKey, gNew);
          openSet.push({
            row: nr, col: nc,
            g: gNew,
            f: gNew + this._heuristic(nr, nc, toRow, toCol),
            parent: current,
          });
        }
      }
    }

    return empty; // no path found
  }

  private _reconstructPath(node: AStarNode): PathfindingFindOutput {
    const cells: AStarNode[] = [];
    let cur: AStarNode | null = node;
    while (cur !== null) {
      cells.push(cur);
      cur = cur.parent;
    }
    cells.reverse();

    const path = cells.map(n => this._tileCenter(n.row, n.col));
    return { found: true, path, cost: node.g };
  }

  /** Chebyshev distance (8-dir) or Manhattan distance (4-dir). */
  private _heuristic(r1: number, c1: number, r2: number, c2: number): number {
    const dr = Math.abs(r1 - r2);
    const dc = Math.abs(c1 - c2);
    if (this._options.directions === 8) {
      return Math.max(dr, dc); // Chebyshev
    }
    return dr + dc; // Manhattan
  }

  /**
   * Returns the neighbouring cells of `(row, col)` that are within the grid
   * bounds, together with the base movement cost (1 for cardinal, √2 ≈ 1.414
   * for diagonal — the actual per-cell cost is multiplied in `_astar`).
   */
  private _neighbours(
    row: number,
    col: number,
  ): Array<[row: number, col: number, moveCost: number]> {
    const dirs =
      this._options.directions === 8
        ? DIRS_8
        : DIRS_4;

    const result: Array<[number, number, number]> = [];
    for (const [dr, dc, cost] of dirs) {
      const nr = row + dr;
      const nc = col + dc;
      if (this._inBounds(nr, nc)) {
        result.push([nr, nc, cost]);
      }
    }
    return result;
  }

  private _inBounds(row: number, col: number): boolean {
    return row >= 0 && row < this._rows && col >= 0 && col < this._cols;
  }

  /** World-pixel coordinate of the centre of tile `(row, col)`. */
  private _tileCenter(row: number, col: number): { x: number; y: number } {
    const half = this._tileSize / 2;
    return {
      x: col * this._tileSize + half,
      y: row * this._tileSize + half,
    };
  }

  // ---------------------------------------------------------------------------
  // Private: dynamic obstacles
  // ---------------------------------------------------------------------------

  /**
   * Query active entities and return a set of tile-cell keys (`"row,col"`)
   * that are occupied by those entities.
   *
   * Pass `tagFilter` to restrict which entities are considered.  Without a
   * filter every active entity is included; use tags such as `'obstacle'` to
   * exclude decorative sprites and HUD anchors.
   *
   * The method queries entity positions via `entity/query` and uses its own
   * simple AABB-to-tile conversion without depending on `CollisionManager`
   * internals.
   */
  private _buildDynamicObstacles(tagFilter?: string[]): Set<string> {
    const blocked = new Set<string>();
    if (!this._core || this._tileSize === 0) return blocked;

    const queryParams: EntityQueryParams = tagFilter && tagFilter.length > 0
      ? { tags: tagFilter }
      : {};

    const { output } = this._core.events.emitSync<EntityQueryParams, EntityQueryOutput>(
      'entity/query',
      queryParams,
    );

    const ts = this._tileSize;
    for (const entity of (output.entities ?? [])) {
      const row = Math.floor(entity.position.y / ts);
      const col = Math.floor(entity.position.x / ts);
      if (this._inBounds(row, col)) {
        blocked.add(`${row},${col}`);
      }
    }

    return blocked;
  }

  // ---------------------------------------------------------------------------
  // Private: LRU cache helpers
  // ---------------------------------------------------------------------------

  /**
   * Retrieve a cached path, refreshing its recency so it is not evicted before
   * less-recently-used entries.
   */
  private _cacheGet(key: string): PathfindingFindOutput | undefined {
    const value = this._cache.get(key);
    if (value === undefined) return undefined;
    // Move to most-recently-used position by re-inserting.
    this._cache.delete(key);
    this._cache.set(key, value);
    return value;
  }

  /**
   * Insert a path into the LRU cache.  When the cache exceeds
   * {@link CACHE_MAX_SIZE} the oldest (least-recently-used) entry is evicted.
   */
  private _cacheSet(key: string, value: PathfindingFindOutput): void {
    if (this._cache.has(key)) this._cache.delete(key);
    this._cache.set(key, value);
    if (this._cache.size > CACHE_MAX_SIZE) {
      // Map preserves insertion order; the first key is the oldest.
      this._cache.delete(this._cache.keys().next().value!);
    }
  }

  // ---------------------------------------------------------------------------
  // Private: fallback nearest-passable cell (BFS)
  // ---------------------------------------------------------------------------

  /**
   * BFS outward from `(row, col)` to find the closest cell in the static grid
   * that is passable (cost < {@link IMPASSABLE}).
   *
   * Returns `null` when no passable cell is found within
   * {@link NEAREST_MAX_EXPANSIONS} steps.
   */
  private _findNearestPassable(
    row: number,
    col: number,
  ): { row: number; col: number } | null {
    const visited = new Set<string>();
    const queue: Array<{ row: number; col: number }> = [{ row, col }];
    visited.add(`${row},${col}`);
    let expansions = 0;

    while (queue.length > 0 && expansions < NEAREST_MAX_EXPANSIONS) {
      const current = queue.shift()!;
      expansions++;

      if ((this._grid[current.row]?.[current.col] ?? IMPASSABLE) < IMPASSABLE) {
        return current;
      }

      for (const [dr, dc] of DIRS_4) {
        const nr = current.row + dr;
        const nc = current.col + dc;
        const nKey = `${nr},${nc}`;
        if (this._inBounds(nr, nc) && !visited.has(nKey)) {
          visited.add(nKey);
          queue.push({ row: nr, col: nc });
        }
      }
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // Private: path smoothing (string-pulling)
  // ---------------------------------------------------------------------------

  /**
   * Remove redundant intermediate waypoints using a string-pulling pass.
   *
   * Two consecutive waypoints are merged when there is unobstructed
   * line-of-sight between them on the tile grid (verified with Bresenham's
   * line algorithm).  This eliminates the staircase artifacts typical of
   * diagonal A* paths.
   */
  private _smoothPath(
    path: { x: number; y: number }[],
  ): { x: number; y: number }[] {
    if (path.length <= 2) return path;

    const result: { x: number; y: number }[] = [path[0]!];
    let anchor = 0;

    for (let i = 2; i < path.length; i++) {
      if (!this._hasLoS(path[anchor]!, path[i]!)) {
        // No LoS from anchor to i — commit the previous waypoint.
        result.push(path[i - 1]!);
        anchor = i - 1;
      }
    }

    result.push(path[path.length - 1]!);
    return result;
  }

  /**
   * Returns `true` when every tile cell along the straight line from `a` to
   * `b` (in world-pixel coordinates) is passable in the static grid.
   *
   * Uses Bresenham's line algorithm for integer tile-grid traversal.
   */
  private _hasLoS(
    a: { x: number; y: number },
    b: { x: number; y: number },
  ): boolean {
    const ts = this._tileSize;
    let r0 = Math.floor(a.y / ts);
    let c0 = Math.floor(a.x / ts);
    const r1 = Math.floor(b.y / ts);
    const c1 = Math.floor(b.x / ts);

    const dr = Math.abs(r1 - r0);
    const dc = Math.abs(c1 - c0);
    const sr = r0 < r1 ? 1 : -1;
    const sc = c0 < c1 ? 1 : -1;
    let err = dr - dc;

    while (true) {
      if ((this._grid[r0]?.[c0] ?? IMPASSABLE) >= IMPASSABLE) return false;
      if (r0 === r1 && c0 === c1) break;
      const e2 = 2 * err;
      if (e2 > -dc) { err -= dc; r0 += sr; }
      if (e2 < dr)  { err += dr; c0 += sc; }
    }

    return true;
  }
}

// ---------------------------------------------------------------------------
// Direction tables
// ---------------------------------------------------------------------------

/** [dRow, dCol, movementCost] for 4-directional movement. */
const DIRS_4: Array<[number, number, number]> = [
  [-1,  0, 1], // up
  [ 1,  0, 1], // down
  [ 0, -1, 1], // left
  [ 0,  1, 1], // right
];

/** [dRow, dCol, movementCost] for 8-directional movement. */
const DIRS_8: Array<[number, number, number]> = [
  [-1,  0, 1],       // up
  [ 1,  0, 1],       // down
  [ 0, -1, 1],       // left
  [ 0,  1, 1],       // right
  [-1, -1, Math.SQRT2], // up-left
  [-1,  1, Math.SQRT2], // up-right
  [ 1, -1, Math.SQRT2], // down-left
  [ 1,  1, Math.SQRT2], // down-right
];
