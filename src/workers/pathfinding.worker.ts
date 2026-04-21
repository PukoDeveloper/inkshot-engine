/**
 * Pathfinding Web Worker
 *
 * Runs A* path-finding off the main thread.  This file has **no** dependencies
 * on Pixi.js or any DOM API beyond the standard `Worker` globals (`self`,
 * `postMessage`, `onmessage`).
 *
 * ### Message protocol
 * Every message follows the {@link WorkerTask} / {@link WorkerResult} shape
 * defined in `../types/worker.ts`.
 *
 * | `type`        | Direction      | Description                              |
 * |---------------|----------------|------------------------------------------|
 * | `init`        | main → worker  | Load a new cost grid                     |
 * | `tile:update` | main → worker  | Update a single cell's cost              |
 * | `cache:clear` | main → worker  | Invalidate the LRU path cache            |
 * | `find`        | main → worker  | Run A* and reply with the path           |
 *
 * For `init`, the flat `Float32Array` grid may be *transferred* (zero-copy)
 * to the Worker.  The Worker sends back an acknowledgement reply so the caller
 * can confirm initialisation completed before relying on the Worker for paths.
 */

// ---------------------------------------------------------------------------
// Types (inlined to avoid importing from the main bundle)
// ---------------------------------------------------------------------------

interface WorkerTask<P = unknown> {
  readonly id: string;
  readonly type: string;
  readonly payload: P;
}

interface WorkerResult<R = unknown> {
  readonly id: string;
  readonly result?: R;
  readonly error?: string;
}

// Payloads ----------------------------------------------------------------

interface InitPayload {
  /** Flat row-major cost grid (`rows × cols` elements). */
  grid: Float32Array;
  rows: number;
  cols: number;
  tileSize: number;
  directions: 4 | 8;
}

interface TileUpdatePayload {
  row: number;
  col: number;
  cost: number;
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
interface CacheClearPayload {}

interface FindPayload {
  params: {
    from: { x: number; y: number };
    to: { x: number; y: number };
    fallbackToNearest?: boolean;
    smoothPath?: boolean;
    maxIterations?: number;
  };
  /** Tile cells already occupied by dynamic entities: [[row, col], ...] */
  dynamicObstacleCells?: Array<[number, number]>;
}

interface FindResult {
  found: boolean;
  path: Array<{ x: number; y: number }>;
  cost: number;
  nearest?: { x: number; y: number };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const IMPASSABLE = Infinity;
const CACHE_MAX_SIZE = 512;
const NEAREST_MAX_EXPANSIONS = 1_000;

// ---------------------------------------------------------------------------
// Direction tables
// ---------------------------------------------------------------------------

/** [dRow, dCol, movementCost] for 4-directional movement. */
const DIRS_4: Array<[number, number, number]> = [
  [-1, 0, 1], // up
  [1, 0, 1],  // down
  [0, -1, 1], // left
  [0, 1, 1],  // right
];

/** [dRow, dCol, movementCost] for 8-directional movement. */
const DIRS_8: Array<[number, number, number]> = [
  [-1, 0, 1],              // up
  [1, 0, 1],               // down
  [0, -1, 1],              // left
  [0, 1, 1],               // right
  [-1, -1, Math.SQRT2],    // up-left
  [-1, 1, Math.SQRT2],     // up-right
  [1, -1, Math.SQRT2],     // down-left
  [1, 1, Math.SQRT2],      // down-right
];

// ---------------------------------------------------------------------------
// Min-heap for A* open set
// ---------------------------------------------------------------------------

interface AStarNode {
  row: number;
  col: number;
  g: number;
  f: number;
  parent: AStarNode | null;
}

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
    const top = this._data[0]!;
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
      if (this._data[parent]!.f <= this._data[i]!.f) break;
      [this._data[parent], this._data[i]] = [this._data[i]!, this._data[parent]!];
      i = parent;
    }
  }

  private _siftDown(i: number): void {
    const n = this._data.length;
    while (true) {
      let smallest = i;
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      if (left < n && this._data[left]!.f < this._data[smallest]!.f) smallest = left;
      if (right < n && this._data[right]!.f < this._data[smallest]!.f) smallest = right;
      if (smallest === i) break;
      [this._data[smallest], this._data[i]] = [this._data[i]!, this._data[smallest]!];
      i = smallest;
    }
  }
}

// ---------------------------------------------------------------------------
// Worker state
// ---------------------------------------------------------------------------

/** Flat row-major cost grid. `grid[row * cols + col]` = movement cost. */
let _flatGrid: Float32Array = new Float32Array(0);
let _rows = 0;
let _cols = 0;
let _tileSize = 0;
let _directions: 4 | 8 = 8;

/** LRU path cache. */
const _cache = new Map<string, FindResult>();

// ---------------------------------------------------------------------------
// Grid helpers
// ---------------------------------------------------------------------------

function _inBounds(row: number, col: number): boolean {
  return row >= 0 && row < _rows && col >= 0 && col < _cols;
}

function _getCost(row: number, col: number): number {
  if (!_inBounds(row, col)) return IMPASSABLE;
  return _flatGrid[row * _cols + col]!;
}

function _tileCenter(row: number, col: number): { x: number; y: number } {
  const half = _tileSize / 2;
  return { x: col * _tileSize + half, y: row * _tileSize + half };
}

// ---------------------------------------------------------------------------
// LRU cache helpers
// ---------------------------------------------------------------------------

function _cacheGet(key: string): FindResult | undefined {
  const value = _cache.get(key);
  if (value === undefined) return undefined;
  _cache.delete(key);
  _cache.set(key, value);
  return value;
}

function _cacheSet(key: string, value: FindResult): void {
  if (_cache.has(key)) _cache.delete(key);
  _cache.set(key, value);
  if (_cache.size > CACHE_MAX_SIZE) {
    _cache.delete(_cache.keys().next().value!);
  }
}

// ---------------------------------------------------------------------------
// Heuristic
// ---------------------------------------------------------------------------

function _heuristic(r1: number, c1: number, r2: number, c2: number): number {
  const dr = Math.abs(r1 - r2);
  const dc = Math.abs(c1 - c2);
  return _directions === 8 ? Math.max(dr, dc) : dr + dc;
}

// ---------------------------------------------------------------------------
// BFS: nearest passable cell
// ---------------------------------------------------------------------------

function _findNearestPassable(
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

    if (_getCost(current.row, current.col) < IMPASSABLE) {
      return current;
    }

    for (const [dr, dc] of DIRS_4) {
      const nr = current.row + dr;
      const nc = current.col + dc;
      const nKey = `${nr},${nc}`;
      if (_inBounds(nr, nc) && !visited.has(nKey)) {
        visited.add(nKey);
        queue.push({ row: nr, col: nc });
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// A* search
// ---------------------------------------------------------------------------

function _astar(
  fromRow: number,
  fromCol: number,
  toRow: number,
  toCol: number,
  dynamicBlocked: Set<string> | null,
  maxIter: number,
): FindResult {
  const empty: FindResult = { found: false, path: [], cost: 0 };
  const openSet = new MinHeap();
  const gScores = new Map<string, number>();
  const closed = new Set<string>();

  const startNode: AStarNode = {
    row: fromRow,
    col: fromCol,
    g: 0,
    f: _heuristic(fromRow, fromCol, toRow, toCol),
    parent: null,
  };

  const startKey = `${fromRow},${fromCol}`;
  openSet.push(startNode);
  gScores.set(startKey, 0);

  let iterations = 0;
  const dirs = _directions === 8 ? DIRS_8 : DIRS_4;

  while (openSet.size > 0) {
    if (++iterations > maxIter) return empty;

    const current = openSet.pop()!;
    const currentKey = `${current.row},${current.col}`;

    if (closed.has(currentKey)) continue;
    closed.add(currentKey);

    if (current.row === toRow && current.col === toCol) {
      // Reconstruct path
      const cells: AStarNode[] = [];
      let cur: AStarNode | null = current;
      while (cur !== null) {
        cells.push(cur);
        cur = cur.parent;
      }
      cells.reverse();
      const path = cells.map((n) => _tileCenter(n.row, n.col));
      return { found: true, path, cost: current.g };
    }

    for (const [dr, dc, moveCost] of dirs) {
      const nr = current.row + dr;
      const nc = current.col + dc;
      if (!_inBounds(nr, nc)) continue;

      const nKey = `${nr},${nc}`;
      if (closed.has(nKey)) continue;

      const cellCost = _getCost(nr, nc);
      if (cellCost >= IMPASSABLE) continue;

      if (dynamicBlocked?.has(nKey) && !(nr === toRow && nc === toCol)) continue;

      const gNew = current.g + moveCost * cellCost;
      const prevG = gScores.get(nKey) ?? Infinity;
      if (gNew < prevG) {
        gScores.set(nKey, gNew);
        openSet.push({
          row: nr,
          col: nc,
          g: gNew,
          f: gNew + _heuristic(nr, nc, toRow, toCol),
          parent: current,
        });
      }
    }
  }

  return empty;
}

// ---------------------------------------------------------------------------
// LoS (Bresenham) for path smoothing
// ---------------------------------------------------------------------------

function _hasLoS(
  a: { x: number; y: number },
  b: { x: number; y: number },
): boolean {
  const ts = _tileSize;
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
    if (_getCost(r0, c0) >= IMPASSABLE) return false;
    if (r0 === r1 && c0 === c1) break;
    const e2 = 2 * err;
    if (e2 > -dc) {
      err -= dc;
      r0 += sr;
    }
    if (e2 < dr) {
      err += dr;
      c0 += sc;
    }
  }

  return true;
}

function _smoothPath(
  path: Array<{ x: number; y: number }>,
): Array<{ x: number; y: number }> {
  if (path.length <= 2) return path;

  const result: Array<{ x: number; y: number }> = [path[0]!];
  let anchor = 0;

  for (let i = 2; i < path.length; i++) {
    if (!_hasLoS(path[anchor]!, path[i]!)) {
      result.push(path[i - 1]!);
      anchor = i - 1;
    }
  }

  result.push(path[path.length - 1]!);
  return result;
}

// ---------------------------------------------------------------------------
// Main find function
// ---------------------------------------------------------------------------

function _find(payload: FindPayload): FindResult {
  const empty: FindResult = { found: false, path: [], cost: 0 };
  if (_tileSize === 0) return empty;

  const { params } = payload;
  const ts = _tileSize;

  const fromRow = Math.floor(params.from.y / ts);
  const fromCol = Math.floor(params.from.x / ts);
  const toRow = Math.floor(params.to.y / ts);
  const toCol = Math.floor(params.to.x / ts);

  if (fromRow === toRow && fromCol === toCol) {
    return { found: true, path: [_tileCenter(toRow, toCol)], cost: 0 };
  }

  if (!_inBounds(fromRow, fromCol) || !_inBounds(toRow, toCol)) return empty;

  if (_getCost(fromRow, fromCol) >= IMPASSABLE) return empty;

  let effectiveToRow = toRow;
  let effectiveToCol = toCol;
  let nearest: { x: number; y: number } | undefined;

  if (_getCost(toRow, toCol) >= IMPASSABLE) {
    if (!params.fallbackToNearest) return empty;
    const fallback = _findNearestPassable(toRow, toCol);
    if (!fallback) return empty;
    effectiveToRow = fallback.row;
    effectiveToCol = fallback.col;
    nearest = _tileCenter(effectiveToRow, effectiveToCol);
  }

  const cacheKey = `${fromRow},${fromCol}→${effectiveToRow},${effectiveToCol}`;
  const hasDynamic = payload.dynamicObstacleCells && payload.dynamicObstacleCells.length > 0;

  if (!hasDynamic) {
    const cached = _cacheGet(cacheKey);
    if (cached) {
      return nearest !== undefined ? { ...cached, nearest } : cached;
    }
  }

  // Build dynamic obstacle set
  let dynamicBlocked: Set<string> | null = null;
  if (hasDynamic) {
    dynamicBlocked = new Set<string>();
    for (const [r, c] of payload.dynamicObstacleCells!) {
      dynamicBlocked.add(`${r},${c}`);
    }
  }

  const maxIter = params.maxIterations ?? 10_000;
  let result = _astar(fromRow, fromCol, effectiveToRow, effectiveToCol, dynamicBlocked, maxIter);

  if (result.found && params.smoothPath && result.path.length > 2) {
    result = { ...result, path: _smoothPath(result.path) };
  }

  if (nearest !== undefined && result.found) {
    result = { ...result, nearest };
  }

  if (!hasDynamic) {
    const toCache =
      nearest !== undefined ? { found: result.found, path: result.path, cost: result.cost } : result;
    _cacheSet(cacheKey, toCache);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

function reply<R>(id: string, result: R): void {
  const msg: WorkerResult<R> = { id, result };
  (self as unknown as Worker).postMessage(msg);
}

function replyError(id: string, message: string): void {
  const msg: WorkerResult<never> = { id, error: message };
  (self as unknown as Worker).postMessage(msg);
}

(self as unknown as Worker).onmessage = (evt: MessageEvent<WorkerTask>) => {
  const { id, type, payload } = evt.data;

  try {
    switch (type) {
      case 'init': {
        const p = payload as InitPayload;
        _flatGrid = p.grid;
        _rows = p.rows;
        _cols = p.cols;
        _tileSize = p.tileSize;
        _directions = p.directions;
        _cache.clear();
        reply(id, { ok: true });
        break;
      }

      case 'tile:update': {
        const p = payload as TileUpdatePayload;
        if (_inBounds(p.row, p.col)) {
          _flatGrid[p.row * _cols + p.col] = p.cost;
        }
        _cache.clear();
        reply(id, { ok: true });
        break;
      }

      case 'cache:clear': {
        _cache.clear();
        reply(id, { ok: true });
        break;
      }

      case 'find': {
        const result = _find(payload as FindPayload);
        reply(id, result);
        break;
      }

      default:
        replyError(id, `[pathfinding.worker] Unknown message type: "${type}"`);
    }
  } catch (err) {
    replyError(id, err instanceof Error ? err.message : String(err));
  }
};
