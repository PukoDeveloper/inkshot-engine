// ---------------------------------------------------------------------------
// pathfinding/find
// ---------------------------------------------------------------------------

/**
 * Parameters for `pathfinding/find`.
 *
 * Requests an A* path from `from` to `to` in world-pixel coordinates.
 * The result contains the path as an array of world-pixel waypoints
 * (centre of each traversed tile).
 *
 * @example
 * ```ts
 * const { output } = core.events.emitSync<PathfindingFindParams, PathfindingFindOutput>(
 *   'pathfinding/find',
 *   { from: player.position, to: target.position },
 * );
 * if (output.found) {
 *   followPath(output.path);
 * }
 * ```
 */
export interface PathfindingFindParams {
  /** Start position in world pixels. */
  readonly from: { x: number; y: number };
  /** Goal position in world pixels. */
  readonly to: { x: number; y: number };
  /**
   * When `true`, entities with a `BODY` collider layer are treated as dynamic
   * obstacles and added to the impassable set for this query only.
   *
   * This makes the search more expensive (entity positions are queried and
   * converted to tile cells) but produces more accurate paths in scenes with
   * many moving obstacles.  Paths found with dynamic obstacles are **not**
   * cached.
   *
   * Default: `false`.
   */
  readonly includeDynamicObstacles?: boolean;
  /**
   * Maximum number of A* iterations before the search is abandoned.
   * Protects against pathological cases on very large maps.
   * Default: `10 000`.
   */
  readonly maxIterations?: number;
}

/** Output for `pathfinding/find`. */
export interface PathfindingFindOutput {
  /**
   * `true` when a path was successfully found.
   * `false` when no path exists or the search was aborted (max iterations).
   */
  found: boolean;
  /**
   * Ordered list of world-pixel waypoints from `from` to `to` (inclusive).
   * Each waypoint is the centre of the corresponding tile cell.
   * Empty when `found` is `false`.
   */
  path: { x: number; y: number }[];
  /**
   * Total movement cost of the path.
   * `0` when `found` is `false`.
   */
  cost: number;
}

// ---------------------------------------------------------------------------
// pathfinding/weight:set
// ---------------------------------------------------------------------------

/**
 * Parameters for `pathfinding/weight:set`.
 *
 * Overrides the movement cost for a specific tile value.  The default cost
 * for passable tiles is `1`.  Set a higher value to model difficult terrain
 * (e.g. mud, water) that A* will try to avoid unless necessary.
 *
 * Setting cost to `Infinity` (or any value ≥ `PathfindingManager.IMPASSABLE`)
 * makes the tile completely impassable.
 *
 * @example
 * ```ts
 * // Make water tiles twice as costly to traverse
 * core.events.emitSync('pathfinding/weight:set', { tileId: 3, cost: 2 });
 *
 * // Make lava tiles completely impassable
 * core.events.emitSync('pathfinding/weight:set', { tileId: 4, cost: Infinity });
 * ```
 */
export interface PathfindingWeightSetParams {
  /** The tile value whose traversal cost should be overridden. */
  readonly tileId: number;
  /**
   * Movement cost for this tile type.
   * - `1` — default, normal terrain.
   * - `> 1` — weighted terrain (A* will favour cheaper paths around it).
   * - `Infinity` — impassable (treated like a solid collision tile).
   */
  readonly cost: number;
}

// ---------------------------------------------------------------------------
// pathfinding/cache:clear
// ---------------------------------------------------------------------------

/**
 * Parameters for `pathfinding/cache:clear`.
 *
 * Manually clears cached paths.  Useful when the game world changes in a way
 * that does not trigger `collision/tilemap:set` (e.g. a door opens).
 *
 * @example
 * ```ts
 * // Clear everything after a door opens
 * core.events.emitSync('pathfinding/cache:clear', {});
 * ```
 */
export interface PathfindingCacheClearParams {
  // Currently clears the entire cache; reserved for future per-region filtering.
}
