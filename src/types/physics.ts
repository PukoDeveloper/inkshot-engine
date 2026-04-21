// ---------------------------------------------------------------------------
// PhysicsAdapter — abstract interface every physics backend must satisfy
// ---------------------------------------------------------------------------

/**
 * Abstract contract that every physics backend must implement.
 *
 * Register event handlers for **all** events listed below during `init`.
 * The engine always has **exactly one** active physics backend at a time.
 *
 * ### Required events to handle (input)
 * | Event                        | Description                                     |
 * |------------------------------|-------------------------------------------------|
 * | `physics/body:add`           | Attach a collider / rigid-body to an entity     |
 * | `physics/body:remove`        | Detach a collider / rigid-body from an entity   |
 * | `physics/tilemap:set`        | Register/replace the active tile collision map  |
 * | `physics/move`               | Move with BODY-layer collision resolution       |
 * | `physics/query`              | Spatial overlap query                           |
 * | `physics/raycast`            | Cast a ray; return the first hit                |
 * | `physics/grid:snap`          | Snap a pixel position to the tile grid          |
 * | `physics/grid:worldToTile`   | Convert pixel coords → tile row/col             |
 * | `physics/grid:tileToWorld`   | Convert tile row/col → pixel corner coords      |
 *
 * ### Optional events to handle (input)
 * | Event                        | Description                                     |
 * |------------------------------|-------------------------------------------------|
 * | `physics/impulse`            | Apply an impulse to a rigid-body entity         |
 *
 * ### Notification events to emit (output)
 * | Event                        | Description                                     |
 * |------------------------------|-------------------------------------------------|
 * | `physics/hit`                | First-frame hitbox ↔ hurtbox contact            |
 * | `physics/overlap`            | Sensor overlap begin / end                      |
 */
export interface PhysicsAdapter {
  /** Must equal `'physics'` so the engine recognises it as the active backend. */
  readonly namespace: 'physics';
}

// ---------------------------------------------------------------------------
// Collider shapes
// ---------------------------------------------------------------------------

/** Axis-aligned bounding box collider. */
export interface RectShape {
  type: 'rect';
  /** Horizontal offset relative to the entity's position. Defaults to `0`. */
  offsetX?: number;
  /** Vertical offset relative to the entity's position. Defaults to `0`. */
  offsetY?: number;
  width: number;
  height: number;
}

/** Circle collider. */
export interface CircleShape {
  type: 'circle';
  /** Horizontal offset of the circle centre relative to the entity's position. Defaults to `0`. */
  offsetX?: number;
  /** Vertical offset of the circle centre relative to the entity's position. Defaults to `0`. */
  offsetY?: number;
  radius: number;
}

/** Zero-size point collider. */
export interface PointShape {
  type: 'point';
  /** Horizontal offset relative to the entity's position. Defaults to `0`. */
  offsetX?: number;
  /** Vertical offset relative to the entity's position. Defaults to `0`. */
  offsetY?: number;
}

/** Union of all supported collider shapes. */
export type ColliderShape = RectShape | CircleShape | PointShape;

// ---------------------------------------------------------------------------
// Collision layers
// ---------------------------------------------------------------------------

/**
 * Bit-flag constants for the built-in collision layers.
 *
 * Multiple layers can be combined with bitwise OR:
 * ```ts
 * const layer = CollisionLayer.BODY | CollisionLayer.HURTBOX;
 * ```
 *
 * | Layer     | Bit | Purpose                                       |
 * |-----------|-----|-----------------------------------------------|
 * | `BODY`    |   1 | Physical obstacle — blocks movement           |
 * | `HITBOX`  |   2 | Deals damage (weapon swing area)              |
 * | `HURTBOX` |   4 | Receives damage (character body)              |
 * | `SENSOR`  |   8 | Overlap detection without physical blocking   |
 */
export const CollisionLayer = {
  /** Physical movement/obstacle layer — blocked by solid tiles and other BODY entities. */
  BODY: 1,
  /** Deals damage (weapon swing area). */
  HITBOX: 2,
  /** Receives damage (character body). */
  HURTBOX: 4,
  /** Overlap detection without physical blocking (triggers, pick-up zones, aggro ranges). */
  SENSOR: 8,
} as const;

// ---------------------------------------------------------------------------
// Collider record (stored in KinematicPhysicsAdapter's registry)
// ---------------------------------------------------------------------------

/** A collider attached to an entity. */
export interface Collider {
  shape: ColliderShape;
  /** Bitmask of active layers. Use {@link CollisionLayer} constants. */
  layer: number;
  /**
   * Movement mode for `BODY` colliders.
   * - `'pixel'` (default) — free sub-pixel movement with tile/entity resolution.
   * - `'grid'` — position is automatically snapped to the tile grid after each move.
   */
  movementMode: 'pixel' | 'grid';
}

// ---------------------------------------------------------------------------
// Tile collision shapes
// ---------------------------------------------------------------------------

/**
 * Built-in tile collision shapes.
 *
 * | Shape        | Behaviour                                                        |
 * |--------------|------------------------------------------------------------------|
 * | `'solid'`    | Full impassable block on all sides.                              |
 * | `'empty'`    | Explicitly passable (overrides the default pass-through).        |
 * | `'top-only'` | One-way platform — blocks downward movement only when the        |
 * |              | entity's bottom was above the tile top before the move.          |
 * | `'slope-ne'` | ◣ Floor slope rising left-to-right. Blocks downward movement.    |
 * | `'slope-nw'` | ◢ Floor slope falling left-to-right. Blocks downward movement.   |
 * | `'slope-se'` | ◤ Ceiling slope descending left-to-right. Blocks upward movement. |
 * | `'slope-sw'` | ◥ Ceiling slope ascending left-to-right. Blocks upward movement.  |
 *
 * Pass any other string for a custom shape handled by
 * {@link KinematicPhysicsAdapterOptions.customShapeResolvers}.
 */
export type TileCollisionShape =
  | 'solid'
  | 'empty'
  | 'top-only'
  | 'slope-ne'
  | 'slope-nw'
  | 'slope-se'
  | 'slope-sw';

/**
 * Context passed to a {@link TileShapeResolver}.
 */
export interface TileShapeContext {
  /** World-space X of the tile's left edge. */
  tileX: number;
  /** World-space Y of the tile's top edge. */
  tileY: number;
  /** Tile size in pixels (square tiles). */
  tileSize: number;
  /** Entity AABB in world space after the partial move on the current axis. */
  entityAABB: { left: number; top: number; right: number; bottom: number };
  /** The entity's collider shape (for offset / size data). */
  entityShape: ColliderShape;
  /** Entity world X after the move. */
  entityX: number;
  /** Entity world Y after the move. */
  entityY: number;
  /**
   * Horizontal displacement for this move.
   * `0` when the Y axis is being resolved.
   */
  dx: number;
  /**
   * Vertical displacement for this move.
   * `0` when the X axis is being resolved.
   */
  dy: number;
  /** Which axis is currently being resolved. */
  axis: 'x' | 'y';
}

/**
 * A function that resolves collision for a custom tile shape.
 *
 * Resolvers are tried in order; the first non-`null` result wins.
 *
 * @param shape  The shape string registered in `tileShapes`.
 * @param ctx    Collision context for the current entity / tile pair.
 * @returns `{ blocked: true, resolved }` to snap the entity on this axis,
 *          `{ blocked: false, resolved }` to allow the move,
 *          or `null` to pass handling to the next resolver (or default to
 *          no collision when all resolvers return `null`).
 */
export type TileShapeResolver = (
  shape: string,
  ctx: TileShapeContext,
) => { blocked: boolean; resolved: number } | null;

// ---------------------------------------------------------------------------
// Tilemap collision data
// ---------------------------------------------------------------------------

/** Tile collision map registered via `physics/tilemap:set`. */
export interface TileCollisionMapData {
  /** Size of each tile in pixels (square tiles assumed). */
  tileSize: number;
  /**
   * Row-major tile data array.
   * `layers[row][col]` is the tile value at that cell.
   */
  layers: number[][];
  /**
   * Maps tile values to their collision shape.
   *
   * Tile values absent from this record are treated as passable.
   * Use {@link TileCollisionShape} strings for built-in behaviours, or any
   * other string for custom shapes handled by
   * {@link KinematicPhysicsAdapterOptions.customShapeResolvers}.
   *
   * @example
   * ```ts
   * tileShapes: {
   *   1: 'solid',      // full block
   *   2: 'top-only',   // one-way platform
   *   3: 'slope-ne',   // ◣ ramp
   * }
   * ```
   */
  tileShapes: Record<number, TileCollisionShape | string>;
}

// ---------------------------------------------------------------------------
// Event params — body registration
// ---------------------------------------------------------------------------

/** Params for `physics/body:add`. */
export interface PhysicsBodyAddParams {
  /** ID of the entity to attach the collider to. */
  entityId: string;
  shape: ColliderShape;
  /** Bitmask of active layers. Use {@link CollisionLayer} constants. */
  layer: number;
  /** Movement mode for BODY colliders. Defaults to `'pixel'`. */
  movementMode?: 'pixel' | 'grid';
}

/** Params for `physics/body:remove`. */
export interface PhysicsBodyRemoveParams {
  entityId: string;
}

/** Params for `physics/tilemap:set`. */
export interface PhysicsTilemapSetParams extends TileCollisionMapData {}

// ---------------------------------------------------------------------------
// Event params — movement
// ---------------------------------------------------------------------------

/** Params for `physics/move`. */
export interface PhysicsMoveParams {
  /** ID of the entity to move. Must have a `BODY` collider registered. */
  entityId: string;
  /** Desired X displacement in pixels. */
  dx: number;
  /** Desired Y displacement in pixels. */
  dy: number;
}

/** Output for `physics/move`. */
export interface PhysicsMoveOutput {
  /** Resolved world X position after collision. */
  x: number;
  /** Resolved world Y position after collision. */
  y: number;
  /** `true` when horizontal movement was fully or partially blocked. */
  blockedX: boolean;
  /** `true` when vertical movement was fully or partially blocked. */
  blockedY: boolean;
}

// ---------------------------------------------------------------------------
// Event params — impulse
// ---------------------------------------------------------------------------

/** Params for `physics/impulse`. */
export interface PhysicsImpulseParams {
  /** ID of the entity to apply the impulse to. Must have a physics body registered. */
  entityId: string;
  /** Impulse force on the X axis in world-space units. */
  forceX: number;
  /** Impulse force on the Y axis in world-space units. */
  forceY: number;
}

// ---------------------------------------------------------------------------
// Event params — spatial query
// ---------------------------------------------------------------------------

/** Params for `physics/query`. */
export interface PhysicsQueryParams {
  /** Shape used as the query volume. */
  shape: ColliderShape;
  /** World-space origin for the query shape. */
  position: { x: number; y: number };
  /** Bitmask of layers to test against. Only colliders on matching layers are returned. */
  layerMask: number;
  /** Entity ID to exclude from results (e.g. the querying entity itself). */
  excludeEntityId?: string;
}

/** Output for `physics/query`. */
export interface PhysicsQueryOutput {
  /** IDs of entities whose colliders overlap the query shape. */
  entities: string[];
}

// ---------------------------------------------------------------------------
// Event params — raycast
// ---------------------------------------------------------------------------

/** Params for `physics/raycast`. */
export interface PhysicsRaycastParams {
  /** World-space ray origin. */
  origin: { x: number; y: number };
  /**
   * Ray direction vector. Does NOT need to be normalised.
   * Examples: `{ x: 1, y: 0 }` (right), `{ x: 0, y: -1 }` (up).
   */
  direction: { x: number; y: number };
  /** Maximum ray length in pixels. Defaults to `10 000`. */
  maxDistance?: number;
  /** Bitmask of layers to test against. */
  layerMask: number;
}

/** Output for `physics/raycast`. */
export interface PhysicsRaycastOutput {
  /** Whether the ray hit anything. */
  hit: boolean;
  /** ID of the first entity hit, if the ray stopped at an entity. */
  entityId?: string;
  /** World-space intersection point. */
  point?: { x: number; y: number };
  /** Distance from `origin` to the intersection point. */
  distance?: number;
  /** `true` when the ray stopped at a solid tile rather than an entity. */
  tileHit?: boolean;
}

// ---------------------------------------------------------------------------
// Event params — grid utilities
// ---------------------------------------------------------------------------

/** Params for `physics/grid:snap`. */
export interface PhysicsGridSnapParams {
  x: number;
  y: number;
}

/** Output for `physics/grid:snap`. */
export interface PhysicsGridSnapOutput {
  /** X position snapped to the nearest tile-grid corner. */
  x: number;
  /** Y position snapped to the nearest tile-grid corner. */
  y: number;
}

/** Params for `physics/grid:worldToTile`. */
export interface PhysicsWorldToTileParams {
  x: number;
  y: number;
}

/** Output for `physics/grid:worldToTile`. */
export interface PhysicsWorldToTileOutput {
  col: number;
  row: number;
}

/** Params for `physics/grid:tileToWorld`. */
export interface PhysicsTileToWorldParams {
  col: number;
  row: number;
}

/** Output for `physics/grid:tileToWorld`. */
export interface PhysicsTileToWorldOutput {
  /** World X of the tile's top-left corner. */
  x: number;
  /** World Y of the tile's top-left corner. */
  y: number;
}

// ---------------------------------------------------------------------------
// Notification events (emitted by the physics backend, not used as input)
// ---------------------------------------------------------------------------

/** Params emitted with `physics/hit` when a hitbox first contacts a hurtbox. */
export interface PhysicsHitParams {
  /** Entity ID of the attacker (owns the hitbox). */
  attackerId: string;
  /** Entity ID of the victim (owns the hurtbox). */
  victimId: string;
}

/** Params emitted with `physics/overlap` when a sensor overlap begins or ends. */
export interface PhysicsOverlapParams {
  entityAId: string;
  entityBId: string;
  /** `true` when the overlap begins; `false` when it ends. */
  entered: boolean;
}
