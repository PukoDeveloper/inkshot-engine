import type { Core } from '../../core/Core.js';
import type { EnginePlugin } from '../../types/plugin.js';
import type { Entity, EntityQueryOutput } from '../../types/entity.js';
import { CollisionLayer } from '../../types/physics.js';
import type {
  ColliderShape,
  Collider,
  TileCollisionMapData,
  TileShapeContext,
  TileShapeResolver,
  PhysicsBodyAddParams,
  PhysicsBodyRemoveParams,
  PhysicsTilemapSetParams,
  PhysicsMoveParams,
  PhysicsMoveOutput,
  PhysicsQueryParams,
  PhysicsQueryOutput,
  PhysicsRaycastParams,
  PhysicsRaycastOutput,
  PhysicsGridSnapParams,
  PhysicsGridSnapOutput,
  PhysicsWorldToTileParams,
  PhysicsWorldToTileOutput,
  PhysicsTileToWorldParams,
  PhysicsTileToWorldOutput,
  PhysicsImpulseParams,
  PhysicsHitParams,
  PhysicsOverlapParams,
} from '../../types/physics.js';

// ---------------------------------------------------------------------------
// KinematicPhysicsAdapter options
// ---------------------------------------------------------------------------

/**
 * Options accepted by the {@link KinematicPhysicsAdapter} constructor.
 */
export interface KinematicPhysicsAdapterOptions {
  /**
   * Custom shape resolvers evaluated after all built-in shapes.
   *
   * Resolvers are tried in registration order; the first non-`null`
   * result wins.  Any unknown shape string that is not handled by any
   * resolver is treated as passable (no collision).
   *
   * @example
   * ```ts
   * new KinematicPhysicsAdapter({
   *   customShapeResolvers: [
   *     (shape, ctx) => {
   *       if (shape !== 'ice') return null;
   *       // Ice tiles: block movement but return a slightly higher snap
   *       // so the entity sits on top of the ice surface.
   *       if (ctx.axis === 'y' && ctx.dy > 0 && ctx.entityAABB.bottom >= ctx.tileY) {
   *         return { blocked: true, resolved: ctx.tileY - (ctx.entityAABB.bottom - ctx.entityY) };
   *       }
   *       return { blocked: false, resolved: ctx.entityY };
   *     },
   *   ],
   * });
   * ```
   */
  customShapeResolvers?: TileShapeResolver[];
}

// ---------------------------------------------------------------------------
// Module-level geometry helpers
// ---------------------------------------------------------------------------

/** World-space AABB of a shape placed at entity position (px, py). */
function getShapeAABB(
  shape: ColliderShape,
  px: number,
  py: number,
): { left: number; top: number; right: number; bottom: number } {
  const ox = shape.offsetX ?? 0;
  const oy = shape.offsetY ?? 0;
  if (shape.type === 'rect') {
    return {
      left: px + ox,
      top: py + oy,
      right: px + ox + shape.width,
      bottom: py + oy + shape.height,
    };
  }
  if (shape.type === 'circle') {
    return {
      left: px + ox - shape.radius,
      top: py + oy - shape.radius,
      right: px + ox + shape.radius,
      bottom: py + oy + shape.radius,
    };
  }
  // point
  return { left: px + ox, top: py + oy, right: px + ox, bottom: py + oy };
}

/**
 * Horizontal distance from entity position to the shape's right edge.
 * Used for axis-aligned collision snapping.
 */
function shapeRightOffset(shape: ColliderShape): number {
  const ox = shape.offsetX ?? 0;
  if (shape.type === 'rect') return ox + shape.width;
  if (shape.type === 'circle') return ox + shape.radius;
  return ox;
}

/** Horizontal distance from entity position to the shape's left edge (may be negative). */
function shapeLeftOffset(shape: ColliderShape): number {
  const ox = shape.offsetX ?? 0;
  if (shape.type === 'circle') return ox - shape.radius;
  return ox; // rect and point: left edge = offsetX
}

/** Vertical distance from entity position to the shape's bottom edge. */
function shapeBottomOffset(shape: ColliderShape): number {
  const oy = shape.offsetY ?? 0;
  if (shape.type === 'rect') return oy + shape.height;
  if (shape.type === 'circle') return oy + shape.radius;
  return oy;
}

/** Vertical distance from entity position to the shape's top edge (may be negative). */
function shapeTopOffset(shape: ColliderShape): number {
  const oy = shape.offsetY ?? 0;
  if (shape.type === 'circle') return oy - shape.radius;
  return oy; // rect and point: top edge = offsetY
}

/** Whether a circle (cx, cy, r) overlaps an AABB. Uses nearest-point clamping. */
function circleVsAABB(
  cx: number, cy: number, r: number,
  left: number, top: number, right: number, bottom: number,
): boolean {
  const nearX = Math.max(left, Math.min(right, cx));
  const nearY = Math.max(top, Math.min(bottom, cy));
  const dx = cx - nearX;
  const dy = cy - nearY;
  return dx * dx + dy * dy <= r * r;
}

/** Whether two shapes (each given an entity world position) overlap. */
function shapesOverlap(
  a: ColliderShape, ax: number, ay: number,
  b: ColliderShape, bx: number, by: number,
): boolean {
  const aox = a.offsetX ?? 0;
  const aoy = a.offsetY ?? 0;
  const box = b.offsetX ?? 0;
  const boy = b.offsetY ?? 0;

  // rect vs rect
  if (a.type === 'rect' && b.type === 'rect') {
    return (
      ax + aox < bx + box + b.width &&
      ax + aox + a.width > bx + box &&
      ay + aoy < by + boy + b.height &&
      ay + aoy + a.height > by + boy
    );
  }

  // circle vs circle
  if (a.type === 'circle' && b.type === 'circle') {
    const dx = (ax + aox) - (bx + box);
    const dy = (ay + aoy) - (by + boy);
    const rSum = a.radius + b.radius;
    return dx * dx + dy * dy <= rSum * rSum;
  }

  // rect vs circle
  if (a.type === 'rect' && b.type === 'circle') {
    return circleVsAABB(
      bx + box, by + boy, b.radius,
      ax + aox, ay + aoy, ax + aox + a.width, ay + aoy + a.height,
    );
  }
  if (a.type === 'circle' && b.type === 'rect') {
    return circleVsAABB(
      ax + aox, ay + aoy, a.radius,
      bx + box, by + boy, bx + box + b.width, by + boy + b.height,
    );
  }

  // point vs rect / rect vs point
  if (a.type === 'point' && b.type === 'rect') {
    const px = ax + aox; const py = ay + aoy;
    return px >= bx + box && px <= bx + box + b.width &&
           py >= by + boy && py <= by + boy + b.height;
  }
  if (a.type === 'rect' && b.type === 'point') {
    const px = bx + box; const py = by + boy;
    return px >= ax + aox && px <= ax + aox + a.width &&
           py >= ay + aoy && py <= ay + aoy + a.height;
  }

  // point vs circle / circle vs point
  if (a.type === 'point' && b.type === 'circle') {
    const dx = (ax + aox) - (bx + box);
    const dy = (ay + aoy) - (by + boy);
    return dx * dx + dy * dy <= b.radius * b.radius;
  }
  if (a.type === 'circle' && b.type === 'point') {
    const dx = (bx + box) - (ax + aox);
    const dy = (by + boy) - (ay + aoy);
    return dx * dx + dy * dy <= a.radius * a.radius;
  }

  // point vs point (exact coincidence only)
  return ax + aox === bx + box && ay + aoy === by + boy;
}

/**
 * Ray vs AABB intersection (slab method).
 * Direction MUST be normalised before calling.
 * Returns parametric distance t ≥ 0 to the intersection, or `null` if no hit.
 */
function rayVsAABB(
  ox: number, oy: number,
  dx: number, dy: number,
  left: number, top: number, right: number, bottom: number,
): number | null {
  let tMin = 0;
  let tMax = Infinity;

  if (Math.abs(dx) > 1e-9) {
    const t1 = (left - ox) / dx;
    const t2 = (right - ox) / dx;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
  } else if (ox < left || ox > right) {
    return null; // parallel ray outside the slab
  }

  if (Math.abs(dy) > 1e-9) {
    const t1 = (top - oy) / dy;
    const t2 = (bottom - oy) / dy;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
  } else if (oy < top || oy > bottom) {
    return null;
  }

  return tMin <= tMax ? tMin : null;
}

// ---------------------------------------------------------------------------
// KinematicPhysicsAdapter
// ---------------------------------------------------------------------------

/**
 * Built-in **kinematic** physics backend for Inkshot Engine.
 *
 * Implements the unified {@link PhysicsAdapter} contract so it can be swapped
 * for a rigid-body backend (Matter.js, Rapier, …) without changing any game
 * code.  All physics events live under the `physics` namespace — the same
 * namespace every alternative backend must use.
 *
 * ### Design
 * All positions are in **pixel space** — the same coordinate system used by
 * `EntityManager`.  Tile-grid utilities convert tile coordinates to and from
 * pixel space on demand, so pixel-movement and grid-movement games (and
 * hybrids) all work without any extra configuration.
 *
 * ### Shapes
 * | Shape    | Key fields                 | Description                  |
 * |----------|----------------------------|------------------------------|
 * | `rect`   | `width`, `height`          | Axis-aligned bounding box    |
 * | `circle` | `radius`                   | Circle collider              |
 * | `point`  | —                          | Zero-size point              |
 *
 * All shapes accept optional `offsetX` / `offsetY` fields (relative to the
 * entity's logical position).
 *
 * ### Collision layers (bit flags)
 * Use {@link CollisionLayer} constants and combine with `|`:
 * ```ts
 * const layer = CollisionLayer.BODY | CollisionLayer.HURTBOX;
 * ```
 *
 * | Layer     | Bit | Purpose                                           |
 * |-----------|-----|---------------------------------------------------|
 * | `BODY`    |   1 | Physical obstacle — blocks movement               |
 * | `HITBOX`  |   2 | Deals damage (weapon swing area)                  |
 * | `HURTBOX` |   4 | Receives damage (character body)                  |
 * | `SENSOR`  |   8 | Overlap detection without physical blocking       |
 *
 * ### EventBus API
 * | Event                      | Async? | Description                                     |
 * |----------------------------|--------|-------------------------------------------------|
 * | `physics/body:add`         | ✗ sync | Attach a collider to an entity                  |
 * | `physics/body:remove`      | ✗ sync | Detach a collider from an entity                |
 * | `physics/tilemap:set`      | ✗ sync | Register/replace the active tile collision map  |
 * | `physics/move`             | ✗ sync | Move with BODY-layer collision resolution       |
 * | `physics/query`            | ✗ sync | Spatial overlap query                           |
 * | `physics/raycast`          | ✗ sync | Cast a ray; return the first hit                |
 * | `physics/grid:snap`        | ✗ sync | Snap a pixel position to the tile grid          |
 * | `physics/grid:worldToTile` | ✗ sync | Convert pixel coords → tile row/col             |
 * | `physics/grid:tileToWorld` | ✗ sync | Convert tile row/col → pixel corner coords      |
 * | `physics/hit`              | emitted | First-frame hitbox ↔ hurtbox contact           |
 * | `physics/overlap`          | emitted | Sensor overlap begin / end                      |
 *
 * ### Usage
 * ```ts
 * import { createEngine, KinematicPhysicsAdapter, CollisionLayer } from 'inkshot-engine';
 *
 * const { core } = await createEngine({
 *   plugins: [new KinematicPhysicsAdapter()],
 * });
 *
 * // Attach a BODY + HURTBOX collider to the player
 * core.events.emitSync('physics/body:add', {
 *   entityId: player.id,
 *   shape: { type: 'rect', width: 16, height: 24, offsetX: -8, offsetY: -12 },
 *   layer: CollisionLayer.BODY | CollisionLayer.HURTBOX,
 * });
 *
 * // Move with collision resolution each fixed update
 * core.events.on('myGame', 'core/update', () => {
 *   const { output } = core.events.emitSync('physics/move', {
 *     entityId: player.id,
 *     dx: velocityX * dt,
 *     dy: velocityY * dt,
 *   });
 *   if (output.blockedY) velocityY = 0; // hit floor or ceiling
 * });
 *
 * // React to combat hits
 * core.events.on('combat', 'physics/hit', ({ attackerId, victimId }) => {
 *   applyDamage(attackerId, victimId);
 * });
 * ```
 */
export class KinematicPhysicsAdapter implements EnginePlugin {
  readonly namespace = 'physics' as const;
  /** Must be initialised after EntityManager so `entity/query` is available. */
  readonly dependencies = ['entityManager'] as const;
  readonly editorMeta = {
    displayName: 'Kinematic Physics Adapter',
    icon: 'physics',
    description: 'Built-in AABB-based kinematic physics with slope and tilemap collision support.',
    commands: [
      'physics/body:add', 'physics/body:remove', 'physics/move', 'physics/impulse',
      'physics/query', 'physics/raycast', 'physics/hit', 'physics/overlap',
      'physics/tilemap:set', 'physics/grid:snap',
    ] as const,
  };
  private _core: Core | null = null;

  private readonly _options: KinematicPhysicsAdapterOptions;

  constructor(options: KinematicPhysicsAdapterOptions = {}) {
    this._options = options;
  }

  /** Colliders keyed by entity ID. */
  private readonly _colliders = new Map<string, Collider>();

  /** Active tile collision map, or `null` if none has been registered. */
  private _tilemap: TileCollisionMapData | null = null;

  /** O(1) tile shape lookup. Key: `"row,col"`, value: shape string. */
  private readonly _tileShapeMap = new Map<string, string>();

  /**
   * Hit pairs overlapping in the previous fixed update.
   * Key: `"${attackerId}|${victimId}"`.
   */
  private readonly _prevHitPairs = new Set<string>();

  /**
   * Sensor overlap pairs overlapping in the previous fixed update.
   * Key: canonical `"${idA}|${idB}"` where `idA < idB` lexicographically.
   */
  private readonly _prevSensorPairs = new Set<string>();

  // ---------------------------------------------------------------------------
  // EnginePlugin lifecycle
  // ---------------------------------------------------------------------------

  init(core: Core): void {
    this._core = core;
    const { events } = core;

    events.on<PhysicsBodyAddParams>(this.namespace, 'physics/body:add', (params) => {
      this._addCollider(params);
    });

    events.on<PhysicsBodyRemoveParams>(this.namespace, 'physics/body:remove', (params) => {
      this._removeCollider(params.entityId);
    });

    events.on<PhysicsTilemapSetParams>(this.namespace, 'physics/tilemap:set', (params) => {
      this._setTilemap(params);
    });

    events.on<PhysicsMoveParams, PhysicsMoveOutput>(
      this.namespace,
      'physics/move',
      (params, output) => {
        const result = this._move(params.entityId, params.dx, params.dy);
        output.x = result.x;
        output.y = result.y;
        output.blockedX = result.blockedX;
        output.blockedY = result.blockedY;
      },
    );

    events.on<PhysicsQueryParams, PhysicsQueryOutput>(
      this.namespace,
      'physics/query',
      (params, output) => {
        output.entities = this._query(params);
      },
    );

    events.on<PhysicsRaycastParams, PhysicsRaycastOutput>(
      this.namespace,
      'physics/raycast',
      (params, output) => {
        const result = this._raycast(params);
        output.hit = result.hit;
        if (result.entityId !== undefined) output.entityId = result.entityId;
        if (result.point !== undefined) output.point = result.point;
        if (result.distance !== undefined) output.distance = result.distance;
        if (result.tileHit !== undefined) output.tileHit = result.tileHit;
      },
    );

    events.on<PhysicsGridSnapParams, PhysicsGridSnapOutput>(
      this.namespace,
      'physics/grid:snap',
      (params, output) => {
        const s = this._gridSnap(params.x, params.y);
        output.x = s.x;
        output.y = s.y;
      },
    );

    events.on<PhysicsWorldToTileParams, PhysicsWorldToTileOutput>(
      this.namespace,
      'physics/grid:worldToTile',
      (params, output) => {
        const t = this._worldToTile(params.x, params.y);
        output.col = t.col;
        output.row = t.row;
      },
    );

    events.on<PhysicsTileToWorldParams, PhysicsTileToWorldOutput>(
      this.namespace,
      'physics/grid:tileToWorld',
      (params, output) => {
        const w = this._tileToWorld(params.col, params.row);
        output.x = w.x;
        output.y = w.y;
      },
    );

    // physics/impulse is a no-op for the kinematic backend (no rigid-body velocity).
    events.on<PhysicsImpulseParams>(this.namespace, 'physics/impulse', (_params) => {
      // Kinematic bodies do not support impulse forces; ignore silently.
    });

    // Per-frame overlap detection — runs after game logic (lower priority).
    events.on(this.namespace, 'core/update', this._onUpdate, { priority: -20 });

    // Auto-remove colliders when their owning entities are destroyed.
    events.on<{ entity: Entity }>(this.namespace, 'entity/destroyed', ({ entity }) => {
      this._removeCollider(entity.id);
    });
  }

  destroy(core: Core): void {
    core.events.removeNamespace(this.namespace);
    this._colliders.clear();
    this._tileShapeMap.clear();
    this._tilemap = null;
    this._prevHitPairs.clear();
    this._prevSensorPairs.clear();
    this._core = null;
  }

  // ---------------------------------------------------------------------------
  // Private: collider registration
  // ---------------------------------------------------------------------------

  private _addCollider(params: PhysicsBodyAddParams): void {
    this._colliders.set(params.entityId, {
      shape: params.shape,
      layer: params.layer,
      movementMode: params.movementMode ?? 'pixel',
    });
  }

  private _removeCollider(entityId: string): void {
    this._colliders.delete(entityId);

    // Clean up overlap tracking for this entity.
    for (const key of this._prevHitPairs) {
      if (key.startsWith(entityId + '|') || key.endsWith('|' + entityId)) {
        this._prevHitPairs.delete(key);
      }
    }
    for (const key of this._prevSensorPairs) {
      if (key.startsWith(entityId + '|') || key.endsWith('|' + entityId)) {
        this._prevSensorPairs.delete(key);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Private: tilemap
  // ---------------------------------------------------------------------------

  private _setTilemap(params: PhysicsTilemapSetParams): void {
    this._tilemap = {
      tileSize: params.tileSize,
      layers: params.layers,
      tileShapes: params.tileShapes,
    };

    // Rebuild O(1) tile shape lookup.
    this._tileShapeMap.clear();
    for (let row = 0; row < params.layers.length; row++) {
      const rowData = params.layers[row];
      for (let col = 0; col < rowData.length; col++) {
        const shape = params.tileShapes[rowData[col]];
        if (shape !== undefined && shape !== 'empty') {
          this._tileShapeMap.set(`${row},${col}`, shape);
        }
      }
    }
  }

  private _getTileShape(row: number, col: number): string | null {
    return this._tileShapeMap.get(`${row},${col}`) ?? null;
  }

  // ---------------------------------------------------------------------------
  // Private: movement
  // ---------------------------------------------------------------------------

  /**
   * Move an entity by `(dx, dy)`, resolving BODY-layer collisions against solid
   * tiles and other BODY entities.  Axes are resolved independently
   * (X first, then Y) to prevent corner-cutting.
   */
  private _move(entityId: string, dx: number, dy: number): PhysicsMoveOutput {
    const collider = this._colliders.get(entityId);
    const entityMap = this._getAllEntities();
    const entity = entityMap.get(entityId);

    if (!collider || !(collider.layer & CollisionLayer.BODY) || !entity) {
      return {
        x: entity?.position.x ?? 0,
        y: entity?.position.y ?? 0,
        blockedX: false,
        blockedY: false,
      };
    }

    let posX = entity.position.x;
    let posY = entity.position.y;
    let blockedX = false;
    let blockedY = false;

    // ── Resolve X ─────────────────────────────────────────────────────────
    if (dx !== 0) {
      posX += dx;

      const tileX = this._resolveTilesX(collider.shape, posX, posY, dx);
      if (tileX.blocked) { posX = tileX.resolved; blockedX = true; }

      const entX = this._resolveBodyEntitiesX(entityId, collider, posX, posY, dx, entityMap);
      if (entX.blocked) { posX = entX.resolved; blockedX = true; }
    }

    // ── Resolve Y ─────────────────────────────────────────────────────────
    if (dy !== 0) {
      posY += dy;

      const tileY = this._resolveTilesY(collider.shape, posX, posY, dy);
      if (tileY.blocked) { posY = tileY.resolved; blockedY = true; }

      const entY = this._resolveBodyEntitiesY(entityId, collider, posX, posY, dy, entityMap);
      if (entY.blocked) { posY = entY.resolved; blockedY = true; }
    }

    // ── Optional grid snap ─────────────────────────────────────────────────
    if (collider.movementMode === 'grid' && this._tilemap) {
      const snap = this._gridSnap(posX, posY);
      posX = snap.x;
      posY = snap.y;
    }

    entity.position.x = posX;
    entity.position.y = posY;

    return { x: posX, y: posY, blockedX, blockedY };
  }

  /** Resolve the entity's collider AABB against solid tiles on the X axis. */
  private _resolveTilesX(
    shape: ColliderShape,
    posX: number,
    posY: number,
    dx: number,
  ): { blocked: boolean; resolved: number } {
    if (!this._tilemap) return { blocked: false, resolved: posX };

    const ts = this._tilemap.tileSize;
    const aabb = getShapeAABB(shape, posX, posY);
    const rowMin = Math.floor(aabb.top / ts);
    const rowMax = Math.floor((aabb.bottom - 1) / ts);
    const colMin = Math.floor(aabb.left / ts);
    const colMax = Math.floor((aabb.right - 1) / ts);

    let blocked = false;
    let resolved = posX;

    for (let row = rowMin; row <= rowMax; row++) {
      for (let col = colMin; col <= colMax; col++) {
        const tileShape = this._getTileShape(row, col);
        if (!tileShape) continue;
        const result = this._resolveTileOnAxis(
          tileShape, shape, posX, posY, col * ts, row * ts, ts, dx, 0, 'x',
        );
        if (result.blocked) {
          blocked = true;
          if (dx > 0) {
            if (result.resolved < resolved) resolved = result.resolved;
          } else {
            if (result.resolved > resolved) resolved = result.resolved;
          }
        }
      }
    }

    return { blocked, resolved };
  }

  /** Resolve the entity's collider AABB against solid tiles on the Y axis. */
  private _resolveTilesY(
    shape: ColliderShape,
    posX: number,
    posY: number,
    dy: number,
  ): { blocked: boolean; resolved: number } {
    if (!this._tilemap) return { blocked: false, resolved: posY };

    const ts = this._tilemap.tileSize;
    const aabb = getShapeAABB(shape, posX, posY);
    const rowMin = Math.floor(aabb.top / ts);
    const rowMax = Math.floor((aabb.bottom - 1) / ts);
    const colMin = Math.floor(aabb.left / ts);
    const colMax = Math.floor((aabb.right - 1) / ts);

    let blocked = false;
    let resolved = posY;

    for (let row = rowMin; row <= rowMax; row++) {
      for (let col = colMin; col <= colMax; col++) {
        const tileShape = this._getTileShape(row, col);
        if (!tileShape) continue;
        const result = this._resolveTileOnAxis(
          tileShape, shape, posX, posY, col * ts, row * ts, ts, 0, dy, 'y',
        );
        if (result.blocked) {
          blocked = true;
          if (dy > 0) {
            if (result.resolved < resolved) resolved = result.resolved;
          } else {
            if (result.resolved > resolved) resolved = result.resolved;
          }
        }
      }
    }

    return { blocked, resolved };
  }

  /**
   * Resolve a single tile's collision contribution on one axis.
   *
   * Returns `{ blocked, resolved }` where `resolved` is the entity's position
   * (on the given axis) after applying the tile constraint.
   */
  private _resolveTileOnAxis(
    shapeId: string,
    entityShape: ColliderShape,
    entityX: number,
    entityY: number,
    tileX: number,
    tileY: number,
    ts: number,
    dx: number,
    dy: number,
    axis: 'x' | 'y',
  ): { blocked: boolean; resolved: number } {
    const defaultResolved = axis === 'x' ? entityX : entityY;

    switch (shapeId) {
      case 'empty':
        return { blocked: false, resolved: defaultResolved };

      case 'solid': {
        if (axis === 'x') {
          const snap = dx > 0
            ? tileX - shapeRightOffset(entityShape)
            : tileX + ts - shapeLeftOffset(entityShape);
          return { blocked: true, resolved: snap };
        }
        const snap = dy > 0
          ? tileY - shapeBottomOffset(entityShape)
          : tileY + ts - shapeTopOffset(entityShape);
        return { blocked: true, resolved: snap };
      }

      case 'top-only': {
        // Blocks only downward movement when the entity was above the tile top
        // before this move (prevents tunnelling through from above).
        if (axis === 'y' && dy > 0) {
          const prevBottom = (entityY - dy) + shapeBottomOffset(entityShape);
          if (prevBottom <= tileY) {
            return { blocked: true, resolved: tileY - shapeBottomOffset(entityShape) };
          }
        }
        return { blocked: false, resolved: defaultResolved };
      }

      case 'slope-ne':
      case 'slope-nw': {
        // Floor slopes — only block downward movement on the Y axis.
        if (axis === 'y' && dy > 0) {
          const entityAABB = getShapeAABB(entityShape, entityX, entityY);
          const centreX = (entityAABB.left + entityAABB.right) / 2;
          const localX = Math.max(0, Math.min(ts, centreX - tileX));
          // slope-ne ◣: surface rises left-to-right (/ shape)
          // slope-nw ◢: surface falls left-to-right (\ shape)
          const surfaceY = shapeId === 'slope-ne'
            ? tileY + ts - localX
            : tileY + localX;
          if (entityAABB.bottom >= surfaceY) {
            return { blocked: true, resolved: surfaceY - shapeBottomOffset(entityShape) };
          }
        }
        return { blocked: false, resolved: defaultResolved };
      }

      case 'slope-se':
      case 'slope-sw': {
        // Ceiling slopes — only block upward movement on the Y axis.
        if (axis === 'y' && dy < 0) {
          const entityAABB = getShapeAABB(entityShape, entityX, entityY);
          const centreX = (entityAABB.left + entityAABB.right) / 2;
          const localX = Math.max(0, Math.min(ts, centreX - tileX));
          // slope-se ◤: ceiling descends left-to-right
          // slope-sw ◥: ceiling ascends left-to-right
          const ceilY = shapeId === 'slope-se'
            ? tileY + localX
            : tileY + ts - localX;
          if (entityAABB.top <= ceilY) {
            return { blocked: true, resolved: ceilY - shapeTopOffset(entityShape) };
          }
        }
        return { blocked: false, resolved: defaultResolved };
      }

      default:
        return this._resolveCustomShape(
          shapeId, entityShape, entityX, entityY, tileX, tileY, ts, dx, dy, axis,
        );
    }
  }

  /** Delegate unknown shapes to registered custom resolvers. */
  private _resolveCustomShape(
    shapeId: string,
    entityShape: ColliderShape,
    entityX: number,
    entityY: number,
    tileX: number,
    tileY: number,
    ts: number,
    dx: number,
    dy: number,
    axis: 'x' | 'y',
  ): { blocked: boolean; resolved: number } {
    const defaultResolved = axis === 'x' ? entityX : entityY;
    const resolvers = this._options.customShapeResolvers;
    if (!resolvers?.length) return { blocked: false, resolved: defaultResolved };

    const ctx: TileShapeContext = {
      tileX,
      tileY,
      tileSize: ts,
      entityAABB: getShapeAABB(entityShape, entityX, entityY),
      entityShape,
      entityX,
      entityY,
      dx,
      dy,
      axis,
    };

    for (const resolver of resolvers) {
      const result = resolver(shapeId, ctx);
      if (result !== null) return result;
    }

    return { blocked: false, resolved: defaultResolved };
  }

  /** Resolve the entity against other BODY entities on the X axis. */
  private _resolveBodyEntitiesX(
    entityId: string,
    collider: Collider,
    posX: number,
    posY: number,
    dx: number,
    entityMap: Map<string, Entity>,
  ): { blocked: boolean; resolved: number } {
    let blocked = false;
    let resolved = posX;

    for (const [otherId, otherCollider] of this._colliders) {
      if (otherId === entityId) continue;
      if (!(otherCollider.layer & CollisionLayer.BODY)) continue;

      const other = entityMap.get(otherId);
      if (!other) continue;

      if (!shapesOverlap(
        collider.shape, posX, posY,
        otherCollider.shape, other.position.x, other.position.y,
      )) continue;

      blocked = true;
      const otherAABB = getShapeAABB(otherCollider.shape, other.position.x, other.position.y);

      if (dx > 0) {
        const snap = otherAABB.left - shapeRightOffset(collider.shape);
        if (snap < resolved) resolved = snap;
      } else {
        const snap = otherAABB.right - shapeLeftOffset(collider.shape);
        if (snap > resolved) resolved = snap;
      }
    }

    return { blocked, resolved };
  }

  /** Resolve the entity against other BODY entities on the Y axis. */
  private _resolveBodyEntitiesY(
    entityId: string,
    collider: Collider,
    posX: number,
    posY: number,
    dy: number,
    entityMap: Map<string, Entity>,
  ): { blocked: boolean; resolved: number } {
    let blocked = false;
    let resolved = posY;

    for (const [otherId, otherCollider] of this._colliders) {
      if (otherId === entityId) continue;
      if (!(otherCollider.layer & CollisionLayer.BODY)) continue;

      const other = entityMap.get(otherId);
      if (!other) continue;

      if (!shapesOverlap(
        collider.shape, posX, posY,
        otherCollider.shape, other.position.x, other.position.y,
      )) continue;

      blocked = true;
      const otherAABB = getShapeAABB(otherCollider.shape, other.position.x, other.position.y);

      if (dy > 0) {
        const snap = otherAABB.top - shapeBottomOffset(collider.shape);
        if (snap < resolved) resolved = snap;
      } else {
        const snap = otherAABB.bottom - shapeTopOffset(collider.shape);
        if (snap > resolved) resolved = snap;
      }
    }

    return { blocked, resolved };
  }

  // ---------------------------------------------------------------------------
  // Private: spatial query
  // ---------------------------------------------------------------------------

  private _query(params: PhysicsQueryParams): string[] {
    const results: string[] = [];
    const entityMap = this._getAllEntities();

    for (const [entityId, collider] of this._colliders) {
      if (params.excludeEntityId === entityId) continue;
      if (!(collider.layer & params.layerMask)) continue;

      const entity = entityMap.get(entityId);
      if (!entity) continue;

      if (shapesOverlap(
        params.shape, params.position.x, params.position.y,
        collider.shape, entity.position.x, entity.position.y,
      )) {
        results.push(entityId);
      }
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // Private: raycast
  // ---------------------------------------------------------------------------

  private _raycast(params: PhysicsRaycastParams): PhysicsRaycastOutput {
    const { origin, direction, maxDistance = 10_000, layerMask } = params;

    // Normalise direction.
    const len = Math.sqrt(direction.x * direction.x + direction.y * direction.y);
    if (len < 1e-9) return { hit: false };

    const ndx = direction.x / len;
    const ndy = direction.y / len;

    let bestDist = maxDistance;
    let bestEntityId: string | undefined;
    let tileHit = false;

    // ── Entity check ──────────────────────────────────────────────────────
    const entityMap = this._getAllEntities();
    for (const [entityId, collider] of this._colliders) {
      if (!(collider.layer & layerMask)) continue;

      const entity = entityMap.get(entityId);
      if (!entity) continue;

      const aabb = getShapeAABB(collider.shape, entity.position.x, entity.position.y);
      const t = rayVsAABB(origin.x, origin.y, ndx, ndy, aabb.left, aabb.top, aabb.right, aabb.bottom);

      if (t !== null && t < bestDist) {
        bestDist = t;
        bestEntityId = entityId;
        tileHit = false;
      }
    }

    // ── Tile check via DDA ────────────────────────────────────────────────
    if (this._tilemap) {
      const ts = this._tilemap.tileSize;
      const tileT = this._raycastTiles(origin.x, origin.y, ndx, ndy, bestDist, ts);
      if (tileT !== null && tileT < bestDist) {
        bestDist = tileT;
        bestEntityId = undefined;
        tileHit = true;
      }
    }

    if (!bestEntityId && !tileHit) {
      return { hit: false };
    }

    return {
      hit: true,
      entityId: bestEntityId,
      point: { x: origin.x + ndx * bestDist, y: origin.y + ndy * bestDist },
      distance: bestDist,
      tileHit,
    };
  }

  /**
   * DDA tile traversal along a normalised ray.
   * Returns the parametric distance to the first solid tile's entry point,
   * or `null` if no solid tile is hit within `maxDistance`.
   */
  private _raycastTiles(
    ox: number, oy: number,
    dx: number, dy: number,
    maxDistance: number,
    ts: number,
  ): number | null {
    let tileCol = Math.floor(ox / ts);
    let tileRow = Math.floor(oy / ts);

    const stepCol = dx > 0 ? 1 : -1;
    const stepRow = dy > 0 ? 1 : -1;

    // How far along the ray to cross one full tile width / height.
    const tDeltaCol = Math.abs(dx) > 1e-9 ? Math.abs(ts / dx) : Infinity;
    const tDeltaRow = Math.abs(dy) > 1e-9 ? Math.abs(ts / dy) : Infinity;

    // t at which the ray first crosses a vertical / horizontal grid line.
    let tMaxCol = Math.abs(dx) > 1e-9
      ? (dx > 0 ? (tileCol + 1) * ts - ox : ox - tileCol * ts) / Math.abs(dx)
      : Infinity;
    let tMaxRow = Math.abs(dy) > 1e-9
      ? (dy > 0 ? (tileRow + 1) * ts - oy : oy - tileRow * ts) / Math.abs(dy)
      : Infinity;

    let t = 0;

    while (t <= maxDistance) {
      if (this._getTileShape(tileRow, tileCol) !== null) {
        return t;
      }

      // Step to the next grid crossing.
      if (tMaxCol < tMaxRow) {
        t = tMaxCol;
        tMaxCol += tDeltaCol;
        tileCol += stepCol;
      } else {
        t = tMaxRow;
        tMaxRow += tDeltaRow;
        tileRow += stepRow;
      }

      if (t > maxDistance) break;
    }

    return null;
  }

  // ---------------------------------------------------------------------------
  // Private: grid utilities
  // ---------------------------------------------------------------------------

  private _gridSnap(x: number, y: number): { x: number; y: number } {
    const ts = this._tilemap?.tileSize ?? 0;
    if (!ts) return { x, y };
    return { x: Math.round(x / ts) * ts, y: Math.round(y / ts) * ts };
  }

  private _worldToTile(x: number, y: number): { col: number; row: number } {
    const ts = this._tilemap?.tileSize ?? 1;
    return { col: Math.floor(x / ts), row: Math.floor(y / ts) };
  }

  private _tileToWorld(col: number, row: number): { x: number; y: number } {
    const ts = this._tilemap?.tileSize ?? 0;
    return { x: col * ts, y: row * ts };
  }

  // ---------------------------------------------------------------------------
  // Private: per-frame overlap detection
  // ---------------------------------------------------------------------------

  private readonly _onUpdate = (): void => {
    if (!this._core || this._colliders.size === 0) return;

    const entityMap = this._getAllEntities();

    type Entry = { id: string; collider: Collider; pos: { x: number; y: number } };
    const hitboxers: Entry[] = [];
    const hurtboxers: Entry[] = [];
    const sensorers: Entry[] = [];

    for (const [id, collider] of this._colliders) {
      const entity = entityMap.get(id);
      if (!entity) continue;
      const pos = entity.position;
      if (collider.layer & CollisionLayer.HITBOX) hitboxers.push({ id, collider, pos });
      if (collider.layer & CollisionLayer.HURTBOX) hurtboxers.push({ id, collider, pos });
      if (collider.layer & CollisionLayer.SENSOR) sensorers.push({ id, collider, pos });
    }

    this._detectHitboxOverlaps(hitboxers, hurtboxers);
    this._detectSensorOverlaps(sensorers);
  };

  private _detectHitboxOverlaps(
    hitboxers: Array<{ id: string; collider: Collider; pos: { x: number; y: number } }>,
    hurtboxers: Array<{ id: string; collider: Collider; pos: { x: number; y: number } }>,
  ): void {
    const currentPairs = new Set<string>();

    for (const atk of hitboxers) {
      for (const vic of hurtboxers) {
        if (atk.id === vic.id) continue; // no self-hits
        if (!shapesOverlap(
          atk.collider.shape, atk.pos.x, atk.pos.y,
          vic.collider.shape, vic.pos.x, vic.pos.y,
        )) continue;

        const key = `${atk.id}|${vic.id}`;
        currentPairs.add(key);

        // Emit only on the first frame of contact.
        if (!this._prevHitPairs.has(key)) {
          this._core!.events.emitSync<PhysicsHitParams, Record<string, never>>(
            'physics/hit',
            { attackerId: atk.id, victimId: vic.id },
          );
        }
      }
    }

    this._prevHitPairs.clear();
    for (const key of currentPairs) this._prevHitPairs.add(key);
  }

  private _detectSensorOverlaps(
    sensorers: Array<{ id: string; collider: Collider; pos: { x: number; y: number } }>,
  ): void {
    const currentPairs = new Set<string>();

    for (let i = 0; i < sensorers.length; i++) {
      for (let j = i + 1; j < sensorers.length; j++) {
        const a = sensorers[i];
        const b = sensorers[j];

        if (!shapesOverlap(
          a.collider.shape, a.pos.x, a.pos.y,
          b.collider.shape, b.pos.x, b.pos.y,
        )) continue;

        // Canonical key: lexicographically smaller ID first.
        const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
        currentPairs.add(key);
      }
    }

    // Newly overlapping pairs → entered = true.
    for (const key of currentPairs) {
      if (!this._prevSensorPairs.has(key)) {
        const sep = key.indexOf('|');
        this._core!.events.emitSync<PhysicsOverlapParams, Record<string, never>>(
          'physics/overlap',
          { entityAId: key.slice(0, sep), entityBId: key.slice(sep + 1), entered: true },
        );
      }
    }

    // Previously overlapping but no longer → entered = false.
    for (const key of this._prevSensorPairs) {
      if (!currentPairs.has(key)) {
        const sep = key.indexOf('|');
        this._core!.events.emitSync<PhysicsOverlapParams, Record<string, never>>(
          'physics/overlap',
          { entityAId: key.slice(0, sep), entityBId: key.slice(sep + 1), entered: false },
        );
      }
    }

    this._prevSensorPairs.clear();
    for (const key of currentPairs) this._prevSensorPairs.add(key);
  }

  // ---------------------------------------------------------------------------
  // Private: entity helpers
  // ---------------------------------------------------------------------------

  /** Fetch all entities as a `Map<id, Entity>` via the EventBus. */
  private _getAllEntities(): Map<string, Entity> {
    if (!this._core) return new Map();
    const { output } = this._core.events.emitSync<Record<string, never>, EntityQueryOutput>(
      'entity/query',
      {},
    );
    const map = new Map<string, Entity>();
    for (const e of output.entities ?? []) {
      map.set(e.id, e);
    }
    return map;
  }
}
