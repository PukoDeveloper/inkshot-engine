import type { Core } from '../../core/Core.js';
import type { EnginePlugin } from '../../types/plugin.js';
import type { Entity, EntityQueryOutput } from '../../types/entity.js';
import { CollisionLayer } from '../../types/physics.js';
import type {
  ColliderShape,
  TileCollisionMapData,
  PhysicsBodyAddParams,
  PhysicsBodyRemoveParams,
  PhysicsTilemapSetParams,
  PhysicsMoveParams,
  PhysicsMoveOutput,
  PhysicsImpulseParams,
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
  PhysicsHitParams,
  PhysicsOverlapParams,
} from '../../types/physics.js';

// ---------------------------------------------------------------------------
// Minimal Matter.js type surface
// ---------------------------------------------------------------------------

/**
 * Minimal Matter.js body used internally by this adapter.
 * @public
 */
export interface MatterBody {
  /** Unique Matter internal ID. */
  readonly id: number;
  position: { x: number; y: number };
  velocity: { x: number; y: number };
  isStatic: boolean;
  /** Arbitrary label (we store the entity ID here for reverse lookups). */
  label?: string;
}

/**
 * Minimal Matter.js Composite (world container).
 * @public
 */
export interface MatterComposite {
  bodies?: MatterBody[];
}

/**
 * Minimal Matter.js Engine.
 * @public
 */
export interface MatterEngine {
  world: MatterComposite;
  gravity?: { x: number; y: number; scale?: number };
}

/**
 * Bounding box used by Matter Query.
 * @public
 */
export interface MatterBounds {
  min: { x: number; y: number };
  max: { x: number; y: number };
}

/**
 * Minimal subset of the Matter.js library API required by this adapter.
 *
 * Pass an object that satisfies this interface (the real `matter-js` module
 * satisfies it) to the {@link MatterPhysicsAdapter} constructor.
 *
 * @example
 * ```ts
 * import Matter from 'matter-js';
 * import { MatterPhysicsAdapter } from 'inkshot-engine';
 *
 * const physics = new MatterPhysicsAdapter(Matter);
 * ```
 *
 * @public
 */
export interface MatterLib {
  Engine: {
    create(options?: {
      gravity?: { x?: number; y?: number; scale?: number };
      enableSleeping?: boolean;
    }): MatterEngine;
    update(engine: MatterEngine, delta?: number, correction?: number): void;
  };
  Composite: {
    add(composite: MatterComposite, body: MatterBody | MatterBody[]): MatterComposite;
    remove(composite: MatterComposite, body: MatterBody, deep?: boolean): MatterComposite;
    allBodies(composite: MatterComposite): MatterBody[];
    clear(composite: MatterComposite, keepStatic?: boolean): MatterComposite;
  };
  Bodies: {
    rectangle(
      x: number,
      y: number,
      width: number,
      height: number,
      options?: Partial<{ isStatic: boolean; label: string; isSensor: boolean; friction: number; frictionStatic: number; restitution: number }>,
    ): MatterBody;
    circle(
      x: number,
      y: number,
      radius: number,
      options?: Partial<{ isStatic: boolean; label: string; isSensor: boolean }>,
    ): MatterBody;
  };
  Body: {
    setPosition(body: MatterBody, position: { x: number; y: number }): void;
    setVelocity(body: MatterBody, velocity: { x: number; y: number }): void;
    applyForce(
      body: MatterBody,
      position: { x: number; y: number },
      force: { x: number; y: number },
    ): void;
    setStatic(body: MatterBody, isStatic: boolean): void;
  };
  Query: {
    region(bodies: MatterBody[], bounds: MatterBounds): MatterBody[];
    ray(
      bodies: MatterBody[],
      startPoint: { x: number; y: number },
      endPoint: { x: number; y: number },
      rayWidth?: number,
    ): Array<{ body: MatterBody; bodyA?: MatterBody; bodyB?: MatterBody }>;
  };
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/**
 * Options for {@link MatterPhysicsAdapter}.
 * @public
 */
export interface MatterPhysicsAdapterOptions {
  /**
   * Gravity vector applied to all dynamic bodies.
   * Defaults to `{ x: 0, y: 1 }` (downward gravity with standard Matter scale).
   */
  gravity?: { x: number; y: number };
  /**
   * Fixed physics step duration in milliseconds passed to `Engine.update`.
   * Defaults to `16.667` (60 Hz).
   */
  fixedDeltaMs?: number;
}

// ---------------------------------------------------------------------------
// Collider record
// ---------------------------------------------------------------------------

interface ColliderRecord {
  shape: ColliderShape;
  layer: number;
}

// ---------------------------------------------------------------------------
// Geometry helpers (shared with kinematic adapter logic)
// ---------------------------------------------------------------------------

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
  return { left: px + ox, top: py + oy, right: px + ox, bottom: py + oy };
}

function aabbsOverlap(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number },
): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

/** Slab-based ray vs AABB — direction must be normalised. */
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
    return null;
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
// MatterPhysicsAdapter
// ---------------------------------------------------------------------------

/**
 * **Matter.js** physics backend for Inkshot Engine.
 *
 * Wraps the [Matter.js](https://brm.io/matter-js/) rigid-body library and
 * exposes it through the unified `physics/*` EventBus API so it can be swapped
 * in place of {@link KinematicPhysicsAdapter} without changing any game code.
 *
 * Matter.js must be installed separately and passed to the constructor:
 *
 * ```sh
 * npm install matter-js
 * ```
 *
 * ```ts
 * import Matter from 'matter-js';
 * import { createEngine, MatterPhysicsAdapter } from 'inkshot-engine';
 *
 * const { core } = await createEngine({
 *   plugins: [new MatterPhysicsAdapter(Matter)],
 * });
 * ```
 *
 * ### Rigid-body vs kinematic movement
 * - **`physics/move`** — moves the body directly (kinematic-style), suitable
 *   for player-controlled characters.
 * - **`physics/impulse`** — applies an instantaneous force to a dynamic body,
 *   causing physically-simulated acceleration.  After each `core/update` tick
 *   the engine integrates all forces and syncs body positions back to
 *   `entity.position`.
 *
 * ### Tilemap static bodies
 * `physics/tilemap:set` creates a batch of static rectangular bodies for all
 * non-empty tiles.  Each tile body is labelled `'tile'` and is completely
 * immovable.
 *
 * @public
 */
export class MatterPhysicsAdapter implements EnginePlugin {
  readonly namespace = 'physics' as const;
  /** Must be initialised after EntityManager so `entity/query` is available. */
  readonly dependencies = ['entityManager'] as const;
  readonly editorMeta = {
    displayName: 'Matter.js Physics Adapter',
    icon: 'physics',
    description: 'Physics backend powered by Matter.js with rigid-body simulation.',
    events: [
      'physics/body:add', 'physics/body:remove', 'physics/move', 'physics/impulse',
      'physics/query', 'physics/raycast', 'physics/hit', 'physics/overlap',
      'physics/tilemap:set', 'physics/grid:snap',
    ] as const,
  };

  private _core: Core | null = null;
  private readonly _Matter: MatterLib;
  private readonly _options: Required<MatterPhysicsAdapterOptions>;

  private _engine!: MatterEngine;

  /** entityId → Matter body. */
  private readonly _bodies = new Map<string, MatterBody>();

  /** entityId → collider metadata (shape + layer). */
  private readonly _colliders = new Map<string, ColliderRecord>();

  /** Static bodies created from the last `physics/tilemap:set` call. */
  private _tilemapBodies: MatterBody[] = [];

  /** Active tilemap data (for grid utilities). */
  private _tilemap: TileCollisionMapData | null = null;

  /** O(1) solid-tile lookup. Key: `"row,col"`. */
  private readonly _solidTiles = new Set<string>();

  /** Hit pairs active in the previous update. */
  private readonly _prevHitPairs = new Set<string>();

  /** Sensor overlap pairs active in the previous update. */
  private readonly _prevSensorPairs = new Set<string>();

  constructor(Matter: MatterLib, options: MatterPhysicsAdapterOptions = {}) {
    this._Matter = Matter;
    this._options = {
      gravity: options.gravity ?? { x: 0, y: 1 },
      fixedDeltaMs: options.fixedDeltaMs ?? 1000 / 60,
    };
  }

  // ---------------------------------------------------------------------------
  // EnginePlugin lifecycle
  // ---------------------------------------------------------------------------

  init(core: Core): void {
    this._core = core;
    const { events } = core;
    const { gravity, fixedDeltaMs } = this._options;

    this._engine = this._Matter.Engine.create({
      gravity: { x: gravity.x, y: gravity.y },
    });

    events.on<PhysicsBodyAddParams>(this.namespace, 'physics/body:add', (params) => {
      this._addBody(params);
    });

    events.on<PhysicsBodyRemoveParams>(this.namespace, 'physics/body:remove', (params) => {
      this._removeBody(params.entityId);
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

    events.on<PhysicsImpulseParams>(this.namespace, 'physics/impulse', (params) => {
      this._applyImpulse(params.entityId, params.forceX, params.forceY);
    });

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

    // Step the physics engine and sync entity positions each fixed update.
    events.on(this.namespace, 'core/update', () => {
      this._Matter.Engine.update(this._engine, fixedDeltaMs);
      this._syncPositions();
      this._detectOverlaps();
    }, { priority: -20 });

    // Auto-remove bodies when their owning entities are destroyed.
    events.on<{ entity: Entity }>(this.namespace, 'entity/destroyed', ({ entity }) => {
      this._removeBody(entity.id);
    });
  }

  destroy(core: Core): void {
    core.events.removeNamespace(this.namespace);
    this._bodies.clear();
    this._colliders.clear();
    this._tilemapBodies = [];
    this._solidTiles.clear();
    this._tilemap = null;
    this._prevHitPairs.clear();
    this._prevSensorPairs.clear();
    this._core = null;
  }

  // ---------------------------------------------------------------------------
  // Private: body management
  // ---------------------------------------------------------------------------

  private _addBody(params: PhysicsBodyAddParams): void {
    const entityMap = this._getAllEntities();
    const entity = entityMap.get(params.entityId);
    const pos = entity?.position ?? { x: 0, y: 0 };

    const isStatic = !(params.layer & CollisionLayer.BODY);
    const body = this._createBodyForShape(params.shape, pos.x, pos.y, isStatic, params.entityId);

    this._bodies.set(params.entityId, body);
    this._colliders.set(params.entityId, { shape: params.shape, layer: params.layer });
    this._Matter.Composite.add(this._engine.world, body);
  }

  private _removeBody(entityId: string): void {
    const body = this._bodies.get(entityId);
    if (body) {
      this._Matter.Composite.remove(this._engine.world, body);
      this._bodies.delete(entityId);
    }
    this._colliders.delete(entityId);

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

  private _createBodyForShape(
    shape: ColliderShape,
    px: number,
    py: number,
    isStatic: boolean,
    label: string,
  ): MatterBody {
    const ox = shape.offsetX ?? 0;
    const oy = shape.offsetY ?? 0;
    // (cx, cy) is the top-left corner of the shape in world space.
    const cx = px + ox;
    const cy = py + oy;

    if (shape.type === 'rect') {
      const hw = shape.width / 2;
      const hh = shape.height / 2;
      // Matter.js Bodies.rectangle(x, y, w, h) centres the body at (x, y).
      // We add half-extents to convert from top-left to centre coordinates.
      return this._Matter.Bodies.rectangle(cx + hw, cy + hh, shape.width, shape.height, {
        isStatic,
        label,
        friction: 0,
        frictionStatic: 0,
        restitution: 0,
      });
    }
    if (shape.type === 'circle') {
      return this._Matter.Bodies.circle(cx, cy, shape.radius, { isStatic, label });
    }
    // point — represent as a very small rectangle
    return this._Matter.Bodies.rectangle(cx, cy, 1, 1, { isStatic, label });
  }

  // ---------------------------------------------------------------------------
  // Private: tilemap
  // ---------------------------------------------------------------------------

  private _setTilemap(params: PhysicsTilemapSetParams): void {
    // Remove old tilemap bodies from the world.
    for (const b of this._tilemapBodies) {
      this._Matter.Composite.remove(this._engine.world, b);
    }
    this._tilemapBodies = [];
    this._solidTiles.clear();

    this._tilemap = {
      tileSize: params.tileSize,
      layers: params.layers,
      tileShapes: params.tileShapes,
    };

    const ts = params.tileSize;
    const newBodies: MatterBody[] = [];

    for (let row = 0; row < params.layers.length; row++) {
      const rowData = params.layers[row];
      for (let col = 0; col < rowData.length; col++) {
        const tileValue = rowData[col];
        const shape = params.tileShapes[tileValue];
        if (!shape || shape === 'empty') continue;

        // Mark as solid for internal raycasting / query fallback.
        this._solidTiles.add(`${row},${col}`);

        // Create a static body for solid tiles (other shapes treated as solid here).
        const tileX = col * ts + ts / 2;
        const tileY = row * ts + ts / 2;
        const body = this._Matter.Bodies.rectangle(tileX, tileY, ts, ts, {
          isStatic: true,
          label: 'tile',
        });
        newBodies.push(body);
      }
    }

    this._tilemapBodies = newBodies;
    if (newBodies.length > 0) {
      this._Matter.Composite.add(this._engine.world, newBodies);
    }
  }

  // ---------------------------------------------------------------------------
  // Private: movement (kinematic-style direct position set)
  // ---------------------------------------------------------------------------

  private _move(entityId: string, dx: number, dy: number): PhysicsMoveOutput {
    const collider = this._colliders.get(entityId);
    const entityMap = this._getAllEntities();
    const entity = entityMap.get(entityId);
    const body = this._bodies.get(entityId);

    if (!collider || !(collider.layer & CollisionLayer.BODY) || !entity) {
      return {
        x: entity?.position.x ?? 0,
        y: entity?.position.y ?? 0,
        blockedX: false,
        blockedY: false,
      };
    }

    let posX = entity.position.x + dx;
    let posY = entity.position.y + dy;
    let blockedX = false;
    let blockedY = false;

    // Check axis-aligned blocking against solid tiles.
    if (this._tilemap && dx !== 0) {
      const res = this._checkTileBlockingX(collider.shape, posX, posY, dx);
      if (res.blocked) { posX = res.resolved; blockedX = true; }
    }
    if (this._tilemap && dy !== 0) {
      const res = this._checkTileBlockingY(collider.shape, posX, posY, dy);
      if (res.blocked) { posY = res.resolved; blockedY = true; }
    }

    entity.position.x = posX;
    entity.position.y = posY;

    // Sync the Matter body to the resolved position.
    if (body) {
      const ox = collider.shape.offsetX ?? 0;
      const oy = collider.shape.offsetY ?? 0;
      let bodyX = posX + ox;
      let bodyY = posY + oy;
      if (collider.shape.type === 'rect') {
        bodyX += collider.shape.width / 2;
        bodyY += collider.shape.height / 2;
      }
      this._Matter.Body.setPosition(body, { x: bodyX, y: bodyY });
      this._Matter.Body.setVelocity(body, { x: 0, y: 0 });
    }

    return { x: posX, y: posY, blockedX, blockedY };
  }

  private _checkTileBlockingX(
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
    const ox = shape.offsetX ?? 0;
    const rightOffset = shape.type === 'rect' ? ox + shape.width : shape.type === 'circle' ? ox + shape.radius : ox;
    const leftOffset = shape.type === 'circle' ? ox - shape.radius : ox;

    for (let row = rowMin; row <= rowMax; row++) {
      for (let col = colMin; col <= colMax; col++) {
        if (!this._solidTiles.has(`${row},${col}`)) continue;
        blocked = true;
        if (dx > 0) {
          const snap = col * ts - rightOffset;
          if (snap < resolved) resolved = snap;
        } else {
          const snap = (col + 1) * ts - leftOffset;
          if (snap > resolved) resolved = snap;
        }
      }
    }
    return { blocked, resolved };
  }

  private _checkTileBlockingY(
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
    const oy = shape.offsetY ?? 0;
    const bottomOffset = shape.type === 'rect' ? oy + shape.height : shape.type === 'circle' ? oy + shape.radius : oy;
    const topOffset = shape.type === 'circle' ? oy - shape.radius : oy;

    for (let row = rowMin; row <= rowMax; row++) {
      for (let col = colMin; col <= colMax; col++) {
        if (!this._solidTiles.has(`${row},${col}`)) continue;
        blocked = true;
        if (dy > 0) {
          const snap = row * ts - bottomOffset;
          if (snap < resolved) resolved = snap;
        } else {
          const snap = (row + 1) * ts - topOffset;
          if (snap > resolved) resolved = snap;
        }
      }
    }
    return { blocked, resolved };
  }

  // ---------------------------------------------------------------------------
  // Private: impulse
  // ---------------------------------------------------------------------------

  private _applyImpulse(entityId: string, forceX: number, forceY: number): void {
    const body = this._bodies.get(entityId);
    if (!body) return;
    this._Matter.Body.applyForce(body, body.position, { x: forceX, y: forceY });
  }

  // ---------------------------------------------------------------------------
  // Private: spatial query
  // ---------------------------------------------------------------------------

  private _query(params: PhysicsQueryParams): string[] {
    const results: string[] = [];
    const queryAABB = getShapeAABB(params.shape, params.position.x, params.position.y);
    const queryBounds: MatterBounds = {
      min: { x: queryAABB.left, y: queryAABB.top },
      max: { x: queryAABB.right, y: queryAABB.bottom },
    };

    const entityBodies = Array.from(this._bodies.values());
    const hits = this._Matter.Query.region(entityBodies, queryBounds);

    const hitIds = new Set(hits.map(b => b.label ?? ''));

    for (const [entityId, collider] of this._colliders) {
      if (params.excludeEntityId === entityId) continue;
      if (!(collider.layer & params.layerMask)) continue;
      if (hitIds.has(entityId)) {
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
    const len = Math.sqrt(direction.x * direction.x + direction.y * direction.y);
    if (len < 1e-9) return { hit: false };

    const ndx = direction.x / len;
    const ndy = direction.y / len;

    const endPoint = {
      x: origin.x + ndx * maxDistance,
      y: origin.y + ndy * maxDistance,
    };

    // Filter to only bodies on the requested layers.
    const candidateBodies: MatterBody[] = [];
    for (const [entityId, collider] of this._colliders) {
      if (!(collider.layer & layerMask)) continue;
      const body = this._bodies.get(entityId);
      if (body) candidateBodies.push(body);
    }

    const rayHits = this._Matter.Query.ray(candidateBodies, origin, endPoint);

    let bestDist = maxDistance;
    let bestEntityId: string | undefined;
    let tileHit = false;

    for (const hit of rayHits) {
      const hitBody = hit.body ?? hit.bodyA ?? hit.bodyB;
      if (!hitBody) continue;
      const label = hitBody.label ?? '';
      // Find which entity this body belongs to.
      const entityBodies = this._bodies;
      for (const [eid, b] of entityBodies) {
        if (b === hitBody || b.id === hitBody.id) {
          const collider = this._colliders.get(eid);
          if (!collider) break;
          const aabb = getShapeAABB(collider.shape, hitBody.position.x, hitBody.position.y);
          const t = rayVsAABB(origin.x, origin.y, ndx, ndy, aabb.left, aabb.top, aabb.right, aabb.bottom);
          if (t !== null && t < bestDist) {
            bestDist = t;
            bestEntityId = eid;
            tileHit = false;
          }
          break;
        }
      }
      // Check tile bodies.
      if (label === 'tile') {
        const halfSize = (this._tilemap?.tileSize ?? 0) / 2;
        const aabb = {
          left: hitBody.position.x - halfSize,
          top: hitBody.position.y - halfSize,
          right: hitBody.position.x + halfSize,
          bottom: hitBody.position.y + halfSize,
        };
        const t = rayVsAABB(origin.x, origin.y, ndx, ndy, aabb.left, aabb.top, aabb.right, aabb.bottom);
        if (t !== null && t < bestDist) {
          bestDist = t;
          bestEntityId = undefined;
          tileHit = true;
        }
      }
    }

    if (!bestEntityId && !tileHit) return { hit: false };

    return {
      hit: true,
      entityId: bestEntityId,
      point: { x: origin.x + ndx * bestDist, y: origin.y + ndy * bestDist },
      distance: bestDist,
      tileHit,
    };
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
  // Private: position sync and overlap detection
  // ---------------------------------------------------------------------------

  /**
   * After each Matter engine step, pull body positions back into entity.position
   * for **dynamic** (non-BODY-layer) bodies only.
   *
   * BODY-layer bodies are kinematic — their position is authoritative from
   * `physics/move`.  Syncing them here would overwrite the resolved position
   * with whatever Matter's gravity/integration produced.
   */
  private _syncPositions(): void {
    if (!this._core) return;
    const entityMap = this._getAllEntities();

    for (const [entityId, body] of this._bodies) {
      const collider = this._colliders.get(entityId);
      if (!collider) continue;

      // Only sync dynamic bodies — kinematic BODY bodies are moved via physics/move.
      if (collider.layer & CollisionLayer.BODY) continue;

      const entity = entityMap.get(entityId);
      if (!entity) continue;

      // Reverse the offset applied when creating the body.
      const ox = collider.shape.offsetX ?? 0;
      const oy = collider.shape.offsetY ?? 0;
      let entityX = body.position.x - ox;
      let entityY = body.position.y - oy;
      if (collider.shape.type === 'rect') {
        entityX -= collider.shape.width / 2;
        entityY -= collider.shape.height / 2;
      }

      entity.position.x = entityX;
      entity.position.y = entityY;
    }
  }

  private _detectOverlaps(): void {
    if (!this._core || this._colliders.size === 0) return;
    const entityMap = this._getAllEntities();

    type Entry = { id: string; layer: number; shape: ColliderShape; pos: { x: number; y: number } };
    const hitboxers: Entry[] = [];
    const hurtboxers: Entry[] = [];
    const sensorers: Entry[] = [];

    for (const [id, collider] of this._colliders) {
      const entity = entityMap.get(id);
      if (!entity) continue;
      const pos = entity.position;
      if (collider.layer & CollisionLayer.HITBOX) hitboxers.push({ id, layer: collider.layer, shape: collider.shape, pos });
      if (collider.layer & CollisionLayer.HURTBOX) hurtboxers.push({ id, layer: collider.layer, shape: collider.shape, pos });
      if (collider.layer & CollisionLayer.SENSOR) sensorers.push({ id, layer: collider.layer, shape: collider.shape, pos });
    }

    // Hit detection.
    const currentHitPairs = new Set<string>();
    for (const atk of hitboxers) {
      for (const vic of hurtboxers) {
        if (atk.id === vic.id) continue;
        const atkAABB = getShapeAABB(atk.shape, atk.pos.x, atk.pos.y);
        const vicAABB = getShapeAABB(vic.shape, vic.pos.x, vic.pos.y);
        if (!aabbsOverlap(atkAABB, vicAABB)) continue;
        const key = `${atk.id}|${vic.id}`;
        currentHitPairs.add(key);
        if (!this._prevHitPairs.has(key)) {
          this._core.events.emitSync<PhysicsHitParams, Record<string, never>>(
            'physics/hit',
            { attackerId: atk.id, victimId: vic.id },
          );
        }
      }
    }
    this._prevHitPairs.clear();
    for (const key of currentHitPairs) this._prevHitPairs.add(key);

    // Sensor detection.
    const currentSensorPairs = new Set<string>();
    for (let i = 0; i < sensorers.length; i++) {
      for (let j = i + 1; j < sensorers.length; j++) {
        const a = sensorers[i];
        const b = sensorers[j];
        const aAABB = getShapeAABB(a.shape, a.pos.x, a.pos.y);
        const bAABB = getShapeAABB(b.shape, b.pos.x, b.pos.y);
        if (!aabbsOverlap(aAABB, bAABB)) continue;
        const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
        currentSensorPairs.add(key);
      }
    }
    for (const key of currentSensorPairs) {
      if (!this._prevSensorPairs.has(key)) {
        const sep = key.indexOf('|');
        this._core.events.emitSync<PhysicsOverlapParams, Record<string, never>>(
          'physics/overlap',
          { entityAId: key.slice(0, sep), entityBId: key.slice(sep + 1), entered: true },
        );
      }
    }
    for (const key of this._prevSensorPairs) {
      if (!currentSensorPairs.has(key)) {
        const sep = key.indexOf('|');
        this._core.events.emitSync<PhysicsOverlapParams, Record<string, never>>(
          'physics/overlap',
          { entityAId: key.slice(0, sep), entityBId: key.slice(sep + 1), entered: false },
        );
      }
    }
    this._prevSensorPairs.clear();
    for (const key of currentSensorPairs) this._prevSensorPairs.add(key);
  }

  // ---------------------------------------------------------------------------
  // Private: entity helpers
  // ---------------------------------------------------------------------------

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
