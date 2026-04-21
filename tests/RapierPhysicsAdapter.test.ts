import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { EntityManager } from '../src/plugins/entity/EntityManager.js';
import { RapierPhysicsAdapter } from '../src/plugins/physics/RapierPhysicsAdapter.js';
import type {
  RapierLib,
  RapierRigidBody,
  RapierCollider,
  RapierRigidBodyDesc,
  RapierColliderDesc,
  RapierWorld,
} from '../src/plugins/physics/RapierPhysicsAdapter.js';
import { CollisionLayer } from '../src/types/physics.js';
import type {
  PhysicsMoveOutput,
  PhysicsQueryOutput,
  PhysicsRaycastOutput,
  PhysicsGridSnapOutput,
  PhysicsWorldToTileOutput,
  PhysicsTileToWorldOutput,
} from '../src/types/physics.js';
import type { Core } from '../src/core/Core.js';

// ---------------------------------------------------------------------------
// Mock Rapier library
// ---------------------------------------------------------------------------

interface MockBody extends RapierRigidBody {
  _pos: { x: number; y: number };
  _vel: { x: number; y: number };
  _colliders: MockCollider[];
  _isFixed: boolean;
}

interface MockCollider extends RapierCollider {
  _pos: { x: number; y: number };
  _parentBody?: MockBody;
}

function makeBodyDesc(isFixed: boolean, isKinematic: boolean): RapierRigidBodyDesc {
  const desc: RapierRigidBodyDesc & { _isFixed: boolean; _isKinematic: boolean; _tx: number; _ty: number } = {
    _isFixed: isFixed,
    _isKinematic: isKinematic,
    _tx: 0,
    _ty: 0,
    setTranslation(x: number, y: number) {
      this._tx = x;
      this._ty = y;
      return this;
    },
    setLinvel: () => desc,
    setAdditionalMass: () => desc,
  };
  return desc;
}

function makeColliderDesc(): RapierColliderDesc {
  return {
    setTranslation: function () { return this; },
    setSensor: function () { return this; },
  };
}

function createMockWorld(): RapierWorld & { _bodies: MockBody[] } {
  const handleCounter = { value: 0 };
  const bodies: MockBody[] = [];

  return {
    _bodies: bodies,

    step: vi.fn(),

    createRigidBody(desc: RapierRigidBodyDesc & Record<string, unknown>): RapierRigidBody {
      const body: MockBody = {
        handle: ++handleCounter.value,
        _pos: { x: (desc._tx as number) ?? 0, y: (desc._ty as number) ?? 0 },
        _vel: { x: 0, y: 0 },
        _colliders: [],
        _isFixed: !!(desc._isFixed),
        translation() { return { ...this._pos }; },
        setTranslation(pos, _wake) { this._pos = { ...pos }; },
        linvel() { return { ...this._vel }; },
        setLinvel(vel, _wake) { this._vel = { ...vel }; },
        applyImpulse: vi.fn(),
      };
      bodies.push(body);
      return body;
    },

    createCollider(desc: RapierColliderDesc, parent?: RapierRigidBody): RapierCollider {
      const collider: MockCollider = {
        handle: ++handleCounter.value,
        _pos: { x: 0, y: 0 },
        _parentBody: parent as MockBody | undefined,
        translation() { return { ...this._pos }; },
      };
      if (parent) {
        (parent as MockBody)._colliders.push(collider);
      }
      return collider;
    },

    removeRigidBody(body: RapierRigidBody): void {
      const i = bodies.indexOf(body as MockBody);
      if (i >= 0) bodies.splice(i, 1);
    },

    removeCollider(_collider: RapierCollider, _wakeUp: boolean): void {
      // No-op for mock.
    },

    intersectionsWithShape(
      _shapePos: { x: number; y: number },
      _shapeRot: number,
      _shape: unknown,
      callback: (handle: number) => boolean,
    ): void {
      // Invoke callback for all non-fixed bodies.
      for (const b of bodies) {
        if (!b._isFixed && b._colliders.length > 0) {
          const cont = callback(b._colliders[0].handle);
          if (!cont) break;
        }
      }
    },

    castShape: vi.fn().mockReturnValue(null),
    getCollider: vi.fn().mockReturnValue(null),
  };
}

function createMockRapier(): RapierLib & { _worldInstance: ReturnType<typeof createMockWorld> } {
  const worldInstance = createMockWorld();

  return {
    _worldInstance: worldInstance,

    World: vi.fn(function() { return worldInstance; }) as unknown as RapierLib['World'],

    RigidBodyDesc: {
      dynamic: vi.fn().mockImplementation(() => makeBodyDesc(false, false)),
      fixed: vi.fn().mockImplementation(() => makeBodyDesc(true, false)),
      kinematicPositionBased: vi.fn().mockImplementation(() => makeBodyDesc(false, true)),
    },

    ColliderDesc: {
      cuboid: vi.fn().mockImplementation(() => makeColliderDesc()),
      ball: vi.fn().mockImplementation(() => makeColliderDesc()),
    },
  };
}

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createContainerStub() {
  const children: unknown[] = [];
  return {
    x: 0, y: 0, label: '', parent: null as unknown,
    addChild(c: unknown) { children.push(c); (c as Record<string, unknown>).parent = this; },
    removeChild(c: unknown) { const i = children.indexOf(c); if (i >= 0) children.splice(i, 1); },
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

function createSetup() {
  const { core } = createCoreStub();
  const em = new EntityManager();
  const RAPIER = createMockRapier();
  const adapter = new RapierPhysicsAdapter(RAPIER);
  em.init(core);
  adapter.init(core);
  return { core, events: core.events, em, RAPIER, adapter };
}

const TILE_SIZE = 16;
const TILEMAP = {
  tileSize: TILE_SIZE,
  layers: [
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 1, 0, 0],
    [1, 1, 1, 1, 1],
  ],
  tileShapes: { 1: 'solid' as const },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RapierPhysicsAdapter', () => {
  describe('body registration', () => {
    it('creates a Rapier rigid body when a collider is added', () => {
      const { core, em, RAPIER } = createSetup();
      const entity = em.create({ id: 'a' });

      core.events.emitSync('physics/body:add', {
        entityId: entity.id,
        shape: { type: 'rect', width: 16, height: 16 },
        layer: CollisionLayer.BODY,
      });

      expect(RAPIER.RigidBodyDesc.kinematicPositionBased).toHaveBeenCalled();
      expect(RAPIER.ColliderDesc.cuboid).toHaveBeenCalled();
    });

    it('uses dynamic body for non-BODY layer entities', () => {
      const { core, em, RAPIER } = createSetup();
      const entity = em.create({ id: 'dynamic' });

      core.events.emitSync('physics/body:add', {
        entityId: entity.id,
        shape: { type: 'rect', width: 16, height: 16 },
        layer: CollisionLayer.HURTBOX,
      });

      expect(RAPIER.RigidBodyDesc.dynamic).toHaveBeenCalled();
    });

    it('removes the Rapier body when physics/body:remove is emitted', () => {
      const { core, em, RAPIER } = createSetup();
      const entity = em.create({ id: 'b' });

      core.events.emitSync('physics/body:add', {
        entityId: entity.id,
        shape: { type: 'rect', width: 16, height: 16 },
        layer: CollisionLayer.BODY,
      });
      const bodyCountAfterAdd = RAPIER._worldInstance._bodies.length;

      core.events.emitSync('physics/body:remove', { entityId: entity.id });

      expect(RAPIER._worldInstance._bodies.length).toBe(bodyCountAfterAdd - 1);
    });

    it('auto-removes body when entity is destroyed', () => {
      const { core, em, RAPIER } = createSetup();
      const entity = em.create({ id: 'c' });

      core.events.emitSync('physics/body:add', {
        entityId: entity.id,
        shape: { type: 'rect', width: 16, height: 16 },
        layer: CollisionLayer.BODY,
      });
      const bodyCountAfterAdd = RAPIER._worldInstance._bodies.length;

      em.destroyById(entity.id);

      expect(RAPIER._worldInstance._bodies.length).toBe(bodyCountAfterAdd - 1);
    });

    it('creates a ball collider for circle shape', () => {
      const { core, em, RAPIER } = createSetup();
      const entity = em.create({ id: 'circ' });

      core.events.emitSync('physics/body:add', {
        entityId: entity.id,
        shape: { type: 'circle', radius: 8 },
        layer: CollisionLayer.BODY,
      });

      expect(RAPIER.ColliderDesc.ball).toHaveBeenCalledWith(8);
    });
  });

  describe('tilemap', () => {
    it('creates fixed bodies for all solid tiles', () => {
      const { core, RAPIER } = createSetup();
      const worldBefore = RAPIER._worldInstance._bodies.length;

      core.events.emitSync('physics/tilemap:set', TILEMAP);

      // 1 solid at (2,2) + 5 solids at row 3 = 6
      const solidTileCount = 6;
      expect(RAPIER._worldInstance._bodies.length - worldBefore).toBe(solidTileCount);
      expect(RAPIER.RigidBodyDesc.fixed).toHaveBeenCalledTimes(solidTileCount);
    });

    it('removes previous tilemap bodies when a new tilemap is set', () => {
      const { core, RAPIER } = createSetup();

      core.events.emitSync('physics/tilemap:set', TILEMAP);
      const bodyCountAfterFirst = RAPIER._worldInstance._bodies.length;

      core.events.emitSync('physics/tilemap:set', {
        tileSize: TILE_SIZE,
        layers: [[0, 1], [1, 0]],
        tileShapes: { 1: 'solid' as const },
      });

      expect(RAPIER._worldInstance._bodies.length).toBe(bodyCountAfterFirst - 6 + 2);
    });
  });

  describe('movement', () => {
    it('moves entity via physics/move and sets body translation', () => {
      const { core, em, RAPIER } = createSetup();
      const entity = em.create({ id: 'mover', position: { x: 10, y: 10 } });

      core.events.emitSync('physics/body:add', {
        entityId: entity.id,
        shape: { type: 'rect', width: 8, height: 8 },
        layer: CollisionLayer.BODY,
      });

      const { output } = core.events.emitSync('physics/move', {
        entityId: entity.id, dx: 5, dy: 3,
      }) as { output: PhysicsMoveOutput };

      expect(output.x).toBe(15);
      expect(output.y).toBe(13);
      expect(output.blockedX).toBe(false);
      expect(output.blockedY).toBe(false);
      expect(entity.position.x).toBe(15);
      expect(entity.position.y).toBe(13);

      // Body should be at (15 + 4, 13 + 4) = (19, 17) for a 8x8 rect
      const body = RAPIER._worldInstance._bodies.find(
        b => !b._isFixed,
      ) as MockBody | undefined;
      expect(body?._pos.x).toBe(19);
      expect(body?._pos.y).toBe(17);
    });

    it('blocks Y movement against solid tile', () => {
      const { core, em } = createSetup();
      core.events.emitSync('physics/tilemap:set', TILEMAP);

      const entity = em.create({ id: 'faller', position: { x: 8, y: 30 } });
      core.events.emitSync('physics/body:add', {
        entityId: entity.id,
        shape: { type: 'rect', width: 16, height: 16 },
        layer: CollisionLayer.BODY,
      });

      const { output } = core.events.emitSync('physics/move', {
        entityId: entity.id, dx: 0, dy: 20,
      }) as { output: PhysicsMoveOutput };

      expect(output.blockedY).toBe(true);
      expect(output.y).toBe(32);
    });
  });

  describe('impulse', () => {
    it('calls applyImpulse on the Rapier body', () => {
      const { core, em, RAPIER } = createSetup();
      const entity = em.create({ id: 'target' });

      core.events.emitSync('physics/body:add', {
        entityId: entity.id,
        shape: { type: 'rect', width: 16, height: 16 },
        layer: CollisionLayer.HURTBOX, // dynamic body
      });

      core.events.emitSync('physics/impulse', {
        entityId: entity.id,
        forceX: 5,
        forceY: -10,
      });

      const body = RAPIER._worldInstance._bodies.find(b => !b._isFixed) as MockBody | undefined;
      expect(body?.applyImpulse).toHaveBeenCalledWith({ x: 5, y: -10 }, true);
    });

    it('silently ignores physics/impulse for unknown entity', () => {
      const { core } = createSetup();

      expect(() => {
        core.events.emitSync('physics/impulse', {
          entityId: 'ghost',
          forceX: 1,
          forceY: 1,
        });
      }).not.toThrow();
    });
  });

  describe('entity position sync after physics step', () => {
    it('syncs dynamic body position back to entity.position after core/update', () => {
      const { core, em, RAPIER } = createSetup();
      const entity = em.create({ id: 'synced', position: { x: 0, y: 0 } });

      // Register as dynamic (non-BODY) collider so sync runs for it.
      core.events.emitSync('physics/body:add', {
        entityId: entity.id,
        shape: { type: 'rect', width: 16, height: 16 },
        layer: CollisionLayer.HURTBOX,
      });

      // Simulate the world moving the body.
      const body = RAPIER._worldInstance._bodies.find(b => !b._isFixed) as MockBody | undefined;
      if (body) {
        body._pos = { x: 28, y: 38 };
      }

      (RAPIER._worldInstance.step as ReturnType<typeof vi.fn>).mockImplementation(() => {
        // step already moved the body above
      });

      core.events.emitSync('core/update', { dt: 16, elapsed: 16 });

      // entity.position = bodyPos - offset - halfWidth = (28 - 0 - 8, 38 - 0 - 8) = (20, 30)
      expect(entity.position.x).toBe(20);
      expect(entity.position.y).toBe(30);
    });

    it('calls world.step each core/update', () => {
      const { core, RAPIER } = createSetup();

      core.events.emitSync('core/update', { dt: 16, elapsed: 16 });
      core.events.emitSync('core/update', { dt: 16, elapsed: 32 });

      expect(RAPIER._worldInstance.step).toHaveBeenCalledTimes(2);
    });
  });

  describe('query', () => {
    it('finds entities via physics/query using intersectionsWithShape', () => {
      const { core, em } = createSetup();
      const e1 = em.create({ id: 'q1', position: { x: 0, y: 0 } });
      const e2 = em.create({ id: 'q2', position: { x: 100, y: 100 } });

      // Both as dynamic bodies (HURTBOX) so intersectionsWithShape returns them.
      core.events.emitSync('physics/body:add', {
        entityId: e1.id,
        shape: { type: 'rect', width: 16, height: 16 },
        layer: CollisionLayer.HURTBOX,
      });
      core.events.emitSync('physics/body:add', {
        entityId: e2.id,
        shape: { type: 'rect', width: 16, height: 16 },
        layer: CollisionLayer.HURTBOX,
      });

      const { output } = core.events.emitSync('physics/query', {
        shape: { type: 'rect', width: 20, height: 20 },
        position: { x: 0, y: 0 },
        layerMask: CollisionLayer.HURTBOX,
      }) as { output: PhysicsQueryOutput };

      // Both dynamic bodies are returned by mock intersectionsWithShape;
      // the adapter then filters by layer (both are HURTBOX).
      expect(output.entities).toContain(e1.id);
      expect(output.entities).toContain(e2.id);
    });
  });

  describe('grid utilities', () => {
    it('snaps position to tile grid', () => {
      const { core } = createSetup();
      core.events.emitSync('physics/tilemap:set', TILEMAP);

      const { output } = core.events.emitSync('physics/grid:snap', { x: 10, y: 10 }) as { output: PhysicsGridSnapOutput };
      expect(output.x).toBe(16);
      expect(output.y).toBe(16);
    });

    it('converts world to tile coords', () => {
      const { core } = createSetup();
      core.events.emitSync('physics/tilemap:set', TILEMAP);

      const { output } = core.events.emitSync('physics/grid:worldToTile', { x: 35, y: 20 }) as { output: PhysicsWorldToTileOutput };
      expect(output.col).toBe(2);
      expect(output.row).toBe(1);
    });

    it('converts tile to world coords', () => {
      const { core } = createSetup();
      core.events.emitSync('physics/tilemap:set', TILEMAP);

      const { output } = core.events.emitSync('physics/grid:tileToWorld', { col: 2, row: 3 }) as { output: PhysicsTileToWorldOutput };
      expect(output.x).toBe(32);
      expect(output.y).toBe(48);
    });
  });

  describe('raycast', () => {
    it('returns hit: false when castShape returns null', () => {
      const { core } = createSetup();

      const { output } = core.events.emitSync('physics/raycast', {
        origin: { x: 0, y: 0 },
        direction: { x: 1, y: 0 },
        layerMask: CollisionLayer.BODY,
      }) as { output: PhysicsRaycastOutput };

      expect(output.hit).toBe(false);
    });
  });

  describe('destroy', () => {
    it('cleans up on destroy without throwing', () => {
      const { core, em, adapter } = createSetup();
      const entity = em.create({ id: 'cleanup' });

      core.events.emitSync('physics/body:add', {
        entityId: entity.id,
        shape: { type: 'rect', width: 16, height: 16 },
        layer: CollisionLayer.BODY,
      });

      expect(() => adapter.destroy(core)).not.toThrow();
    });
  });
});
