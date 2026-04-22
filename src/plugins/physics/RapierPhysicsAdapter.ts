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
// Minimal Rapier.js type surface
// ---------------------------------------------------------------------------

/**
 * Minimal Rapier rigid body descriptor.
 * @public
 */
export interface RapierRigidBodyDesc {
  setTranslation(x: number, y: number): this;
  setLinvel?(x: number, y: number): this;
  setAdditionalMass?(mass: number): this;
}

/**
 * Minimal Rapier rigid body.
 * @public
 */
export interface RapierRigidBody {
  readonly handle: number;
  translation(): { x: number; y: number };
  setTranslation(pos: { x: number; y: number }, wakeUp: boolean): void;
  linvel(): { x: number; y: number };
  setLinvel(vel: { x: number; y: number }, wakeUp: boolean): void;
  applyImpulse(impulse: { x: number; y: number }, wakeUp: boolean): void;
}

/**
 * Minimal Rapier collider descriptor.
 * @public
 */
export interface RapierColliderDesc {
  setTranslation?(x: number, y: number): this;
  setSensor?(isSensor: boolean): this;
}

/**
 * Minimal Rapier collider.
 * @public
 */
export interface RapierCollider {
  readonly handle: number;
  translation(): { x: number; y: number };
}

/**
 * Shape descriptor used for intersection/cast queries.
 * @public
 */
export interface RapierShapeDesc {
  type: string;
}

/**
 * Minimal Rapier world.
 * @public
 */
export interface RapierWorld {
  step(eventQueue?: unknown): void;
  createRigidBody(desc: RapierRigidBodyDesc): RapierRigidBody;
  createCollider(desc: RapierColliderDesc, parent?: RapierRigidBody): RapierCollider;
  removeRigidBody(body: RapierRigidBody): void;
  removeCollider(collider: RapierCollider, wakeUp: boolean): void;
  /**
   * Enumerate all bodies that overlap the given shape.
   * Callback receives the collider handle; return `true` to continue, `false` to stop.
   */
  intersectionsWithShape(
    shapePos: { x: number; y: number },
    shapeRot: number,
    shape: RapierShapeDesc,
    callback: (handle: number) => boolean,
    filterFlags?: number,
    filterGroups?: number,
    filterExcludeCollider?: number,
    filterExcludeRigidBody?: number,
  ): void;
  /**
   * Cast a shape along a direction, return the first hit distance or null.
   */
  castShape(
    shapePos: { x: number; y: number },
    shapeRot: number,
    shapeVel: { x: number; y: number },
    shape: RapierShapeDesc,
    maxToi: number,
    stopAtPenetration: boolean,
    callback?: (handle: number) => boolean,
  ): { toi: number; witness1?: { x: number; y: number }; colliderHandle?: number } | null;
  /** Get the collider for a given handle (may not exist in all versions). */
  getCollider?(handle: number): RapierCollider | null;
}

/**
 * Minimal subset of the Rapier.js library API required by this adapter.
 *
 * Pass the loaded RAPIER module (or a compatible mock in tests) to the
 * {@link RapierPhysicsAdapter} constructor.
 *
 * @example
 * ```ts
 * import RAPIER from '@dimforge/rapier2d';
 * import { createEngine, RapierPhysicsAdapter } from 'inkshot-engine';
 *
 * await RAPIER.init();
 * const physics = new RapierPhysicsAdapter(RAPIER);
 * ```
 *
 * @public
 */
export interface RapierLib {
  /** Create a new physics world. */
  World: new (gravity: { x: number; y: number }) => RapierWorld;
  RigidBodyDesc: {
    /** A fully simulated dynamic body. */
    dynamic(): RapierRigidBodyDesc;
    /** A fully fixed (immovable) body — used for tilemap tiles. */
    fixed(): RapierRigidBodyDesc;
    /** Kinematic body driven by target positions. */
    kinematicPositionBased(): RapierRigidBodyDesc;
  };
  ColliderDesc: {
    /** Axis-aligned rectangle; half-extents are half the full width/height. */
    cuboid(halfX: number, halfY: number): RapierColliderDesc;
    /** Circle collider. */
    ball(radius: number): RapierColliderDesc;
  };
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/**
 * Options for {@link RapierPhysicsAdapter}.
 * @public
 */
export interface RapierPhysicsAdapterOptions {
  /**
   * Gravity applied to dynamic bodies.
   * Defaults to `{ x: 0, y: 9.81 }`.
   */
  gravity?: { x: number; y: number };
}

// ---------------------------------------------------------------------------
// Internal records
// ---------------------------------------------------------------------------

interface BodyRecord {
  body: RapierRigidBody;
  collider: RapierCollider;
  shape: ColliderShape;
  layer: number;
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------

function getShapeAABB(
  shape: ColliderShape,
  px: number,
  py: number,
): { left: number; top: number; right: number; bottom: number } {
  const ox = shape.offsetX ?? 0;
  const oy = shape.offsetY ?? 0;
  if (shape.type === 'rect') {
    return { left: px + ox, top: py + oy, right: px + ox + shape.width, bottom: py + oy + shape.height };
  }
  if (shape.type === 'circle') {
    return { left: px + ox - shape.radius, top: py + oy - shape.radius, right: px + ox + shape.radius, bottom: py + oy + shape.radius };
  }
  return { left: px + ox, top: py + oy, right: px + ox, bottom: py + oy };
}

function aabbsOverlap(
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number },
): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

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
  } else if (ox < left || ox > right) { return null; }
  if (Math.abs(dy) > 1e-9) {
    const t1 = (top - oy) / dy;
    const t2 = (bottom - oy) / dy;
    tMin = Math.max(tMin, Math.min(t1, t2));
    tMax = Math.min(tMax, Math.max(t1, t2));
  } else if (oy < top || oy > bottom) { return null; }
  return tMin <= tMax ? tMin : null;
}

// ---------------------------------------------------------------------------
// RapierPhysicsAdapter
// ---------------------------------------------------------------------------

/**
 * **Rapier.js** WASM physics backend for Inkshot Engine.
 *
 * Wraps the [Rapier.js](https://rapier.rs/) high-performance rigid-body
 * simulation library (2-D) and exposes it through the unified `physics/*`
 * EventBus API so it can replace {@link KinematicPhysicsAdapter} without any
 * changes to game code.
 *
 * Rapier must be installed separately and the WASM module must be **fully
 * initialised** before constructing this adapter:
 *
 * ```sh
 * npm install @dimforge/rapier2d
 * ```
 *
 * ```ts
 * import RAPIER from '@dimforge/rapier2d';
 * import { createEngine, RapierPhysicsAdapter } from 'inkshot-engine';
 *
 * await RAPIER.init();
 * const { core } = await createEngine({
 *   plugins: [new RapierPhysicsAdapter(RAPIER)],
 * });
 * ```
 *
 * ### Body modes
 * - Bodies registered with {@link CollisionLayer.BODY} use **kinematic
 *   position-based** rigid bodies, controlled via `physics/move`.
 * - Non-BODY layers (HITBOX, HURTBOX, SENSOR) use **dynamic** rigid bodies
 *   so they respond to `physics/impulse`.
 *
 * ### Tilemap static bodies
 * `physics/tilemap:set` creates a batch of static (`fixed`) rectangular
 * colliders for every non-empty tile, replacing the previous set.
 *
 * ### Entity position sync
 * After each `core/update` tick the adapter reads every dynamic body's
 * translation and writes it back to `entity.position`, keeping the logical
 * and visual state in lock-step.
 *
 * @public
 */
export class RapierPhysicsAdapter implements EnginePlugin {
  readonly namespace = 'physics' as const;
  /** Must be initialised after EntityManager so `entity/query` is available. */
  readonly dependencies = ['entityManager'] as const;
  readonly editorMeta = {
    displayName: 'Rapier Physics Adapter',
    icon: 'physics',
    description: 'Physics backend powered by Rapier (WASM) for high-performance simulation.',
    commands: [
      'physics/body:add', 'physics/body:remove', 'physics/move', 'physics/impulse',
      'physics/query', 'physics/raycast', 'physics/hit', 'physics/overlap',
      'physics/tilemap:set', 'physics/grid:snap',
    ] as const,
  };

  private _core: Core | null = null;
  private readonly _RAPIER: RapierLib;
  private readonly _options: Required<RapierPhysicsAdapterOptions>;

  private _world!: RapierWorld;

  /** entityId → { rapier body, rapier collider, shape, layer }. */
  private readonly _records = new Map<string, BodyRecord>();

  /** Static bodies created from the current tilemap. */
  private _tilemapBodies: RapierRigidBody[] = [];

  /** Active tilemap data (for grid utilities). */
  private _tilemap: TileCollisionMapData | null = null;

  /** Solid-tile lookup. Key: `"row,col"`. */
  private readonly _solidTiles = new Set<string>();

  /** Handle → entityId reverse lookup for query/raycast results. */
  private readonly _colliderHandleToEntityId = new Map<number, string>();

  /** Hit pairs active in the previous update. */
  private readonly _prevHitPairs = new Set<string>();

  /** Sensor overlap pairs active in the previous update. */
  private readonly _prevSensorPairs = new Set<string>();

  constructor(RAPIER: RapierLib, options: RapierPhysicsAdapterOptions = {}) {
    this._RAPIER = RAPIER;
    this._options = {
      gravity: options.gravity ?? { x: 0, y: 9.81 },
    };
  }

  // ---------------------------------------------------------------------------
  // EnginePlugin lifecycle
  // ---------------------------------------------------------------------------

  init(core: Core): void {
    this._core = core;
    const { events } = core;

    this._world = new this._RAPIER.World(this._options.gravity);

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

    // Step the physics world and sync entity positions each fixed update.
    events.on(this.namespace, 'core/update', () => {
      this._world.step();
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
    this._records.clear();
    this._tilemapBodies = [];
    this._solidTiles.clear();
    this._colliderHandleToEntityId.clear();
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
    const shape = params.shape;

    const isKinematic = !!(params.layer & CollisionLayer.BODY);

    const bodyDesc = isKinematic
      ? this._RAPIER.RigidBodyDesc.kinematicPositionBased()
      : this._RAPIER.RigidBodyDesc.dynamic();

    bodyDesc.setTranslation(
      pos.x + (shape.offsetX ?? 0) + (shape.type === 'rect' ? shape.width / 2 : 0),
      pos.y + (shape.offsetY ?? 0) + (shape.type === 'rect' ? shape.height / 2 : 0),
    );

    const body = this._world.createRigidBody(bodyDesc);

    const colliderDesc = this._buildColliderDesc(shape);
    const collider = this._world.createCollider(colliderDesc, body);

    this._records.set(params.entityId, { body, collider, shape, layer: params.layer });
    this._colliderHandleToEntityId.set(collider.handle, params.entityId);
  }

  private _removeBody(entityId: string): void {
    const record = this._records.get(entityId);
    if (record) {
      this._colliderHandleToEntityId.delete(record.collider.handle);
      this._world.removeCollider(record.collider, false);
      this._world.removeRigidBody(record.body);
      this._records.delete(entityId);
    }

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

  private _buildColliderDesc(shape: ColliderShape): RapierColliderDesc {
    if (shape.type === 'rect') {
      return this._RAPIER.ColliderDesc.cuboid(shape.width / 2, shape.height / 2);
    }
    if (shape.type === 'circle') {
      return this._RAPIER.ColliderDesc.ball(shape.radius);
    }
    // point — represent as a tiny ball
    return this._RAPIER.ColliderDesc.ball(0.5);
  }

  // ---------------------------------------------------------------------------
  // Private: tilemap
  // ---------------------------------------------------------------------------

  private _setTilemap(params: PhysicsTilemapSetParams): void {
    // Remove old tilemap bodies.
    for (const b of this._tilemapBodies) {
      this._world.removeRigidBody(b);
    }
    this._tilemapBodies = [];
    this._solidTiles.clear();

    this._tilemap = {
      tileSize: params.tileSize,
      layers: params.layers,
      tileShapes: params.tileShapes,
    };

    const ts = params.tileSize;
    const newBodies: RapierRigidBody[] = [];

    for (let row = 0; row < params.layers.length; row++) {
      const rowData = params.layers[row];
      for (let col = 0; col < rowData.length; col++) {
        const tileValue = rowData[col];
        const tileShape = params.tileShapes[tileValue];
        if (!tileShape || tileShape === 'empty') continue;

        this._solidTiles.add(`${row},${col}`);

        const cx = col * ts + ts / 2;
        const cy = row * ts + ts / 2;

        const bodyDesc = this._RAPIER.RigidBodyDesc.fixed().setTranslation(cx, cy);
        const body = this._world.createRigidBody(bodyDesc);
        const colliderDesc = this._RAPIER.ColliderDesc.cuboid(ts / 2, ts / 2);
        this._world.createCollider(colliderDesc, body);
        newBodies.push(body);
      }
    }

    this._tilemapBodies = newBodies;
  }

  // ---------------------------------------------------------------------------
  // Private: movement
  // ---------------------------------------------------------------------------

  private _move(entityId: string, dx: number, dy: number): PhysicsMoveOutput {
    const record = this._records.get(entityId);
    const entityMap = this._getAllEntities();
    const entity = entityMap.get(entityId);

    if (!record || !(record.layer & CollisionLayer.BODY) || !entity) {
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

    if (this._tilemap && dx !== 0) {
      const res = this._checkTileBlockingX(record.shape, posX, posY, dx);
      if (res.blocked) { posX = res.resolved; blockedX = true; }
    }
    if (this._tilemap && dy !== 0) {
      const res = this._checkTileBlockingY(record.shape, posX, posY, dy);
      if (res.blocked) { posY = res.resolved; blockedY = true; }
    }

    entity.position.x = posX;
    entity.position.y = posY;

    // Move the Rapier kinematic body.
    const ox = record.shape.offsetX ?? 0;
    const oy = record.shape.offsetY ?? 0;
    let bodyX = posX + ox;
    let bodyY = posY + oy;
    if (record.shape.type === 'rect') {
      bodyX += record.shape.width / 2;
      bodyY += record.shape.height / 2;
    }
    record.body.setTranslation({ x: bodyX, y: bodyY }, true);

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
    const rightOff = shape.type === 'rect' ? ox + shape.width : shape.type === 'circle' ? ox + shape.radius : ox;
    const leftOff = shape.type === 'circle' ? ox - shape.radius : ox;

    for (let row = rowMin; row <= rowMax; row++) {
      for (let col = colMin; col <= colMax; col++) {
        if (!this._solidTiles.has(`${row},${col}`)) continue;
        blocked = true;
        if (dx > 0) {
          const snap = col * ts - rightOff;
          if (snap < resolved) resolved = snap;
        } else {
          const snap = (col + 1) * ts - leftOff;
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
    const botOff = shape.type === 'rect' ? oy + shape.height : shape.type === 'circle' ? oy + shape.radius : oy;
    const topOff = shape.type === 'circle' ? oy - shape.radius : oy;

    for (let row = rowMin; row <= rowMax; row++) {
      for (let col = colMin; col <= colMax; col++) {
        if (!this._solidTiles.has(`${row},${col}`)) continue;
        blocked = true;
        if (dy > 0) {
          const snap = row * ts - botOff;
          if (snap < resolved) resolved = snap;
        } else {
          const snap = (row + 1) * ts - topOff;
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
    const record = this._records.get(entityId);
    if (!record) return;
    record.body.applyImpulse({ x: forceX, y: forceY }, true);
  }

  // ---------------------------------------------------------------------------
  // Private: spatial query (AABB overlap using internal records)
  // ---------------------------------------------------------------------------

  private _query(params: PhysicsQueryParams): string[] {
    const results: string[] = [];
    const queryAABB = getShapeAABB(params.shape, params.position.x, params.position.y);
    const entityMap = this._getAllEntities();

    // Use the Rapier world intersectionsWithShape if available, otherwise fall
    // back to a manual AABB sweep over registered bodies.
    if (typeof this._world.intersectionsWithShape === 'function') {
      const shape = this._buildQueryShape(params.shape);
      this._world.intersectionsWithShape(
        params.position,
        0,
        shape,
        (handle) => {
          const entityId = this._colliderHandleToEntityId.get(handle);
          if (!entityId) return true;
          if (params.excludeEntityId === entityId) return true;
          const record = this._records.get(entityId);
          if (!record) return true;
          if (!(record.layer & params.layerMask)) return true;
          results.push(entityId);
          return true; // continue iteration
        },
      );
    } else {
      // Fallback: manual AABB check.
      for (const [entityId, record] of this._records) {
        if (params.excludeEntityId === entityId) continue;
        if (!(record.layer & params.layerMask)) continue;
        const entity = entityMap.get(entityId);
        if (!entity) continue;
        const entityAABB = getShapeAABB(record.shape, entity.position.x, entity.position.y);
        if (aabbsOverlap(queryAABB, entityAABB)) {
          results.push(entityId);
        }
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

    let bestDist = maxDistance;
    let bestEntityId: string | undefined;
    let tileHit = false;

    if (typeof this._world.castShape === 'function') {
      // Use a tiny ball as the sweep shape for the ray query.
      const sweepShape = this._RAPIER.ColliderDesc.ball(0.5);
      const hit = this._world.castShape(
        origin,
        0,
        { x: ndx, y: ndy },
        sweepShape as unknown as Parameters<RapierWorld['castShape']>[3],
        maxDistance,
        false,
      );
      if (hit && hit.toi < bestDist) {
        bestDist = hit.toi;
        if (hit.colliderHandle !== undefined) {
          const eid = this._colliderHandleToEntityId.get(hit.colliderHandle);
          if (eid) {
            bestEntityId = eid;
          } else {
            tileHit = true;
          }
        }
      }
    } else {
      // Fallback: manual AABB ray check.
      const entityMap = this._getAllEntities();
      for (const [entityId, record] of this._records) {
        if (!(record.layer & layerMask)) continue;
        const entity = entityMap.get(entityId);
        if (!entity) continue;
        const aabb = getShapeAABB(record.shape, entity.position.x, entity.position.y);
        const t = rayVsAABB(origin.x, origin.y, ndx, ndy, aabb.left, aabb.top, aabb.right, aabb.bottom);
        if (t !== null && t < bestDist) {
          bestDist = t;
          bestEntityId = entityId;
          tileHit = false;
        }
      }
      // Check solid tiles.
      if (this._tilemap) {
        const ts = this._tilemap.tileSize;
        for (const key of this._solidTiles) {
          const sep = key.indexOf(',');
          const row = parseInt(key.slice(0, sep), 10);
          const col = parseInt(key.slice(sep + 1), 10);
          const tl = col * ts;
          const tt = row * ts;
          const t = rayVsAABB(origin.x, origin.y, ndx, ndy, tl, tt, tl + ts, tt + ts);
          if (t !== null && t < bestDist) {
            bestDist = t;
            bestEntityId = undefined;
            tileHit = true;
          }
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

  /** Build a Rapier shape descriptor for a given ColliderShape (used in queries). */
  private _buildQueryShape(shape: ColliderShape): Parameters<RapierWorld['intersectionsWithShape']>[2] {
    if (shape.type === 'rect') {
      return this._RAPIER.ColliderDesc.cuboid(shape.width / 2, shape.height / 2) as unknown as Parameters<RapierWorld['intersectionsWithShape']>[2];
    }
    if (shape.type === 'circle') {
      return this._RAPIER.ColliderDesc.ball(shape.radius) as unknown as Parameters<RapierWorld['intersectionsWithShape']>[2];
    }
    return this._RAPIER.ColliderDesc.ball(0.5) as unknown as Parameters<RapierWorld['intersectionsWithShape']>[2];
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
   * After each Rapier world step, sync body translations back to entity.position.
   */
  private _syncPositions(): void {
    if (!this._core) return;
    const entityMap = this._getAllEntities();

    for (const [entityId, record] of this._records) {
      // Only sync dynamic bodies — kinematic BODY bodies are moved via physics/move.
      if (record.layer & CollisionLayer.BODY) continue;

      const entity = entityMap.get(entityId);
      if (!entity) continue;

      const t = record.body.translation();
      const ox = record.shape.offsetX ?? 0;
      const oy = record.shape.offsetY ?? 0;
      let entityX = t.x - ox;
      let entityY = t.y - oy;
      if (record.shape.type === 'rect') {
        entityX -= record.shape.width / 2;
        entityY -= record.shape.height / 2;
      }

      entity.position.x = entityX;
      entity.position.y = entityY;
    }
  }

  private _detectOverlaps(): void {
    if (!this._core || this._records.size === 0) return;
    const entityMap = this._getAllEntities();

    type Entry = { id: string; layer: number; shape: ColliderShape; pos: { x: number; y: number } };
    const hitboxers: Entry[] = [];
    const hurtboxers: Entry[] = [];
    const sensorers: Entry[] = [];

    for (const [id, record] of this._records) {
      const entity = entityMap.get(id);
      if (!entity) continue;
      const pos = entity.position;
      if (record.layer & CollisionLayer.HITBOX) hitboxers.push({ id, layer: record.layer, shape: record.shape, pos });
      if (record.layer & CollisionLayer.HURTBOX) hurtboxers.push({ id, layer: record.layer, shape: record.shape, pos });
      if (record.layer & CollisionLayer.SENSOR) sensorers.push({ id, layer: record.layer, shape: record.shape, pos });
    }

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
