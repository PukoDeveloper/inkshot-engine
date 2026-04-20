import type { Core } from '../core/Core.js';
import type { EnginePlugin } from '../types/plugin.js';
import type { TilemapSetParams } from '../types/collision.js';
import type { EntityQueryOutput } from '../types/entity.js';
import type {
  PathfindingFindParams,
  PathfindingFindOutput,
  PathfindingWeightSetParams,
  PathfindingCacheClearParams,
} from '../types/pathfinding.js';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

/** Cost value that marks a cell as completely impassable. */
const IMPASSABLE = Infinity;

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
}

/**
 * Built-in plugin providing A* pathfinding on top of the tile collision map.
 *
 * ### Design
 * - **Static obstacles** — on `collision/tilemap:set` (or directly when a
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
 *   whenever `collision/tilemap:set` fires.  Manual invalidation is available
 *   via `pathfinding/cache:clear`.
 * - **A\* heuristic** — Chebyshev distance (correct for 8-directional grids),
 *   or Manhattan distance when configured to 4-directional movement.
 *
 * ### EventBus API
 * | Event                      | Async? | Description                                  |
 * |----------------------------|--------|----------------------------------------------|
 * | `pathfinding/find`         | ✗ sync | Run A* from `from` to `to` (world px)        |
 * | `pathfinding/weight:set`   | ✗ sync | Override movement cost for a tile value      |
 * | `pathfinding/cache:clear`  | ✗ sync | Manually clear the path cache                |
 *
 * ### Usage
 * ```ts
 * import { createEngine, PathfindingManager } from 'inkshot-engine';
 *
 * const { core } = await createEngine({
 *   plugins: [
 *     new CollisionManager(),
 *     new EntityManager(),
 *     new PathfindingManager(),
 *   ],
 * });
 *
 * // After a tilemap is loaded and collision/tilemap:set has fired…
 * const { output } = core.events.emitSync<PathfindingFindParams, PathfindingFindOutput>(
 *   'pathfinding/find',
 *   { from: { x: 32, y: 32 }, to: { x: 160, y: 96 } },
 * );
 *
 * if (output.found) {
 *   console.log('Path:', output.path, 'Cost:', output.cost);
 * }
 * ```
 */
export class PathfindingManager implements EnginePlugin {
  readonly namespace = 'pathfinding';
  /** Must be initialised after CollisionManager (for tilemap data) and EntityManager. */
  readonly dependencies = ['collision', 'entity'] as const;

  /** Sentinel cost value used to flag completely impassable cells. */
  static readonly IMPASSABLE = IMPASSABLE;

  // ---------------------------------------------------------------------------
  // Internal state
  // ---------------------------------------------------------------------------

  private _core: Core | null = null;
  private readonly _options: Required<PathfindingManagerOptions>;

  /**
   * Cost grid built from the most recent `collision/tilemap:set` data.
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

  constructor(options: PathfindingManagerOptions = {}) {
    this._options = {
      directions: options.directions ?? 8,
    };
  }

  // ---------------------------------------------------------------------------
  // EnginePlugin lifecycle
  // ---------------------------------------------------------------------------

  init(core: Core): void {
    this._core = core;
    const { events } = core;

    // Rebuild cost grid whenever the tile collision map changes.
    events.on<TilemapSetParams>(this.namespace, 'collision/tilemap:set', (params) => {
      this._buildGrid(params);
      this._cache.clear();
    });

    events.on<PathfindingFindParams, PathfindingFindOutput>(
      this.namespace,
      'pathfinding/find',
      (params, output) => {
        const result = this._find(params);
        output.found = result.found;
        output.path  = result.path;
        output.cost  = result.cost;
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
        }
      },
    );

    events.on<PathfindingCacheClearParams>(
      this.namespace,
      'pathfinding/cache:clear',
      () => {
        this._cache.clear();
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
  // Private: grid construction
  // ---------------------------------------------------------------------------

  private _buildGrid(params: TilemapSetParams): void {
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

    // Goal cell impassable (use static grid only — dynamic obstacles are checked below)
    if (this._grid[toRow][toCol] >= IMPASSABLE) return empty;

    // Cache lookup (static searches only)
    const cacheKey = `${fromRow},${fromCol}→${toRow},${toCol}`;
    if (!params.includeDynamicObstacles) {
      const cached = this._cache.get(cacheKey);
      if (cached) return cached;
    }

    // Build dynamic obstacle set if requested
    const dynamicBlocked = params.includeDynamicObstacles
      ? this._buildDynamicObstacles()
      : null;

    const maxIter = params.maxIterations ?? 10_000;
    const result = this._astar(fromRow, fromCol, toRow, toCol, dynamicBlocked, maxIter);

    // Cache static results
    if (!params.includeDynamicObstacles) {
      this._cache.set(cacheKey, result);
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
   * Query all active entities and return a set of tile-cell keys (`"row,col"`)
   * that are occupied by BODY-layer colliders.
   *
   * The method intentionally does **not** depend on `CollisionManager`
   * internals — it queries entity positions via `entity/query` and uses its
   * own simple AABB-to-tile conversion.
   */
  private _buildDynamicObstacles(): Set<string> {
    const blocked = new Set<string>();
    if (!this._core || this._tileSize === 0) return blocked;

    const { output } = this._core.events.emitSync<Record<string, never>, EntityQueryOutput>(
      'entity/query',
      {},
    );

    const ts = this._tileSize;
    for (const entity of (output.entities ?? [])) {
      // Use the entity's position as a single-cell obstacle.
      // This is intentionally conservative — the entity occupies the tile its
      // origin lands in.  Games that need more accurate footprints should
      // extend PathfindingManager via subclassing or custom weight overrides.
      const row = Math.floor(entity.position.y / ts);
      const col = Math.floor(entity.position.x / ts);
      if (this._inBounds(row, col)) {
        blocked.add(`${row},${col}`);
      }
    }

    return blocked;
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
