import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { EntityManager } from '../src/plugins/EntityManager.js';
import { MatterPhysicsAdapter } from '../src/plugins/MatterPhysicsAdapter.js';
import type { MatterLib, MatterBody, MatterEngine, MatterComposite } from '../src/plugins/MatterPhysicsAdapter.js';
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
// Mock Matter.js library
// ---------------------------------------------------------------------------

function makeMockBody(bodyIdCounter: { value: number }, x: number, y: number, isStatic: boolean, label?: string): MatterBody {
  return {
    id: ++bodyIdCounter.value,
    position: { x, y },
    velocity: { x: 0, y: 0 },
    isStatic,
    label: label ?? '',
  };
}

function createMockMatter(): MatterLib & { _bodies: MatterBody[]; _engine: MatterEngine } {
  const bodyIdCounter = { value: 0 };
  const worldComposite: MatterComposite & { bodies: MatterBody[] } = { bodies: [] };
  const engine: MatterEngine = { world: worldComposite };

  const mock = {
    _bodies: worldComposite.bodies,
    _engine: engine,

    Engine: {
      create: vi.fn().mockReturnValue(engine),
      update: vi.fn(),
    },
    Composite: {
      add: vi.fn((composite: MatterComposite & { bodies?: MatterBody[] }, body: MatterBody | MatterBody[]) => {
        const arr = Array.isArray(body) ? body : [body];
        composite.bodies = composite.bodies ?? [];
        composite.bodies.push(...arr);
        return composite;
      }),
      remove: vi.fn((composite: MatterComposite & { bodies?: MatterBody[] }, body: MatterBody) => {
        if (composite.bodies) {
          const i = composite.bodies.indexOf(body);
          if (i >= 0) composite.bodies.splice(i, 1);
        }
        return composite;
      }),
      allBodies: vi.fn(() => [...worldComposite.bodies]),
      clear: vi.fn((composite: MatterComposite & { bodies?: MatterBody[] }, keepStatic?: boolean) => {
        if (!keepStatic) {
          composite.bodies = [];
        }
        return composite;
      }),
    },
    Bodies: {
      rectangle: vi.fn((x: number, y: number, _w: number, _h: number, opts?: { isStatic?: boolean; label?: string }) =>
        makeMockBody(bodyIdCounter, x, y, opts?.isStatic ?? false, opts?.label),
      ),
      circle: vi.fn((x: number, y: number, _r: number, opts?: { isStatic?: boolean; label?: string }) =>
        makeMockBody(bodyIdCounter, x, y, opts?.isStatic ?? false, opts?.label),
      ),
    },
    Body: {
      setPosition: vi.fn((body: MatterBody, pos: { x: number; y: number }) => {
        body.position.x = pos.x;
        body.position.y = pos.y;
      }),
      setVelocity: vi.fn((body: MatterBody, vel: { x: number; y: number }) => {
        body.velocity.x = vel.x;
        body.velocity.y = vel.y;
      }),
      applyForce: vi.fn(),
      setStatic: vi.fn((body: MatterBody, isStatic: boolean) => {
        body.isStatic = isStatic;
      }),
    },
    Query: {
      region: vi.fn((bodies: MatterBody[], bounds: { min: { x: number; y: number }; max: { x: number; y: number } }) => {
        return bodies.filter(b =>
          b.position.x >= bounds.min.x &&
          b.position.x <= bounds.max.x &&
          b.position.y >= bounds.min.y &&
          b.position.y <= bounds.max.y,
        );
      }),
      ray: vi.fn().mockReturnValue([]),
    },
  };

  return mock;
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
  const Matter = createMockMatter();
  const adapter = new MatterPhysicsAdapter(Matter);
  em.init(core);
  adapter.init(core);
  return { core, events: core.events, em, Matter, adapter };
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

describe('MatterPhysicsAdapter', () => {
  describe('body registration', () => {
    it('creates a Matter body when a collider is added', () => {
      const { core, em, Matter } = createSetup();
      const entity = em.create({ id: 'a' });

      core.events.emitSync('physics/body:add', {
        entityId: entity.id,
        shape: { type: 'rect', width: 16, height: 16 },
        layer: CollisionLayer.BODY,
      });

      expect(Matter.Bodies.rectangle).toHaveBeenCalled();
      expect(Matter.Composite.add).toHaveBeenCalled();
    });

    it('removes the Matter body when physics/body:remove is emitted', () => {
      const { core, em, Matter } = createSetup();
      const entity = em.create({ id: 'b' });

      core.events.emitSync('physics/body:add', {
        entityId: entity.id,
        shape: { type: 'rect', width: 16, height: 16 },
        layer: CollisionLayer.BODY,
      });
      const bodyCountAfterAdd = Matter._bodies.length;

      core.events.emitSync('physics/body:remove', { entityId: entity.id });

      expect(Matter._bodies.length).toBe(bodyCountAfterAdd - 1);
      expect(Matter.Composite.remove).toHaveBeenCalled();
    });

    it('auto-removes the Matter body when the entity is destroyed', () => {
      const { core, em, Matter } = createSetup();
      const entity = em.create({ id: 'c' });

      core.events.emitSync('physics/body:add', {
        entityId: entity.id,
        shape: { type: 'rect', width: 16, height: 16 },
        layer: CollisionLayer.BODY,
      });
      const bodyCountAfterAdd = Matter._bodies.length;

      em.destroyById(entity.id);

      expect(Matter._bodies.length).toBe(bodyCountAfterAdd - 1);
    });

    it('creates a circle body for circle shape', () => {
      const { core, em, Matter } = createSetup();
      const entity = em.create({ id: 'circle' });

      core.events.emitSync('physics/body:add', {
        entityId: entity.id,
        shape: { type: 'circle', radius: 8 },
        layer: CollisionLayer.BODY,
      });

      expect(Matter.Bodies.circle).toHaveBeenCalled();
    });
  });

  describe('tilemap', () => {
    it('creates static bodies for all solid tiles', () => {
      const { core, Matter } = createSetup();
      const bodiesBeforeSet = Matter._bodies.length;

      core.events.emitSync('physics/tilemap:set', TILEMAP);

      // Solid tiles: (2,2) and row 3 = 5 tiles → total 6 solid tiles
      const solidTileCount = 6;
      expect(Matter._bodies.length - bodiesBeforeSet).toBe(solidTileCount);
    });

    it('removes previous tilemap bodies when a new tilemap is set', () => {
      const { core, Matter } = createSetup();

      core.events.emitSync('physics/tilemap:set', TILEMAP);
      const bodyCountAfterFirst = Matter._bodies.length;

      // Set a smaller tilemap.
      core.events.emitSync('physics/tilemap:set', {
        tileSize: TILE_SIZE,
        layers: [[0, 1], [1, 0]],
        tileShapes: { 1: 'solid' as const },
      });

      // Previous 6 tile bodies should be removed; 2 new ones added.
      expect(Matter._bodies.length).toBe(bodyCountAfterFirst - 6 + 2);
    });

    it('does not create bodies for empty tiles', () => {
      const { core, Matter } = createSetup();

      core.events.emitSync('physics/tilemap:set', {
        tileSize: TILE_SIZE,
        layers: [[0, 0], [0, 0]],
        tileShapes: { 1: 'solid' as const },
      });

      expect(Matter._bodies.length).toBe(0);
    });
  });

  describe('movement', () => {
    it('moves entity and syncs body position via physics/move', () => {
      const { core, em, Matter } = createSetup();
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
      expect(Matter.Body.setPosition).toHaveBeenCalled();
    });

    it('blocks X movement against a solid tile', () => {
      const { core, em } = createSetup();
      core.events.emitSync('physics/tilemap:set', TILEMAP);

      // Place entity just to the left of a solid tile at col=2 (x=32)
      const entity = em.create({ id: 'blocker', position: { x: 14, y: 24 } });
      core.events.emitSync('physics/body:add', {
        entityId: entity.id,
        shape: { type: 'rect', width: 16, height: 16 },
        layer: CollisionLayer.BODY,
      });

      // Moving right by 10 should be blocked by solid tile at col=2 (x=32)
      const { output } = core.events.emitSync('physics/move', {
        entityId: entity.id, dx: 10, dy: 0,
      }) as { output: PhysicsMoveOutput };

      expect(output.blockedX).toBe(true);
    });

    it('blocks Y movement against a solid floor', () => {
      const { core, em } = createSetup();
      core.events.emitSync('physics/tilemap:set', TILEMAP);

      // Row 3 = solid floor at y=48
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
      expect(output.y).toBe(32); // floor at y=48, entity bottom snaps: 48 - 16 = 32
    });
  });

  describe('impulse', () => {
    it('calls Matter.Body.applyForce for physics/impulse', () => {
      const { core, em, Matter } = createSetup();
      const entity = em.create({ id: 'impulse-target' });

      core.events.emitSync('physics/body:add', {
        entityId: entity.id,
        shape: { type: 'rect', width: 16, height: 16 },
        layer: CollisionLayer.BODY,
      });

      core.events.emitSync('physics/impulse', {
        entityId: entity.id,
        forceX: 10,
        forceY: -5,
      });

      expect(Matter.Body.applyForce).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        { x: 10, y: -5 },
      );
    });

    it('silently ignores physics/impulse for unknown entity', () => {
      const { core, Matter } = createSetup();

      expect(() => {
        core.events.emitSync('physics/impulse', {
          entityId: 'nonexistent',
          forceX: 1,
          forceY: 1,
        });
      }).not.toThrow();

      expect(Matter.Body.applyForce).not.toHaveBeenCalled();
    });
  });

  describe('entity position sync after physics step', () => {
    it('updates entity.position from body position after core/update', () => {
      const { core, em, Matter } = createSetup();
      const entity = em.create({ id: 'sync', position: { x: 0, y: 0 } });

      // Register as a non-BODY (dynamic) collider so sync runs.
      core.events.emitSync('physics/body:add', {
        entityId: entity.id,
        shape: { type: 'rect', width: 16, height: 16 },
        layer: CollisionLayer.HURTBOX,
      });

      // Simulate Matter engine moving the body.
      // The body was created at (8, 8) for a rect (cx, cy = halfWidth offset).
      // Override Matter.Engine.update to move the body.
      Matter.Engine.update.mockImplementation(() => {
        const body = Matter._bodies.find(b => b.label === entity.id);
        if (body) {
          body.position.x = 28;
          body.position.y = 38;
        }
      });

      core.events.emitSync('core/update', { dt: 16, elapsed: 16 });

      // entity.position should now reflect (28 - 0 - 8, 38 - 0 - 8) = (20, 30)
      expect(entity.position.x).toBe(20);
      expect(entity.position.y).toBe(30);
    });
  });

  describe('query', () => {
    it('returns entities whose bodies are in the query region', () => {
      const { core, em } = createSetup();
      const e1 = em.create({ id: 'q1', position: { x: 0, y: 0 } });
      const e2 = em.create({ id: 'q2', position: { x: 100, y: 100 } });

      core.events.emitSync('physics/body:add', {
        entityId: e1.id,
        shape: { type: 'rect', width: 16, height: 16 },
        layer: CollisionLayer.BODY,
      });
      core.events.emitSync('physics/body:add', {
        entityId: e2.id,
        shape: { type: 'rect', width: 16, height: 16 },
        layer: CollisionLayer.BODY,
      });

      const { output } = core.events.emitSync('physics/query', {
        shape: { type: 'rect', width: 20, height: 20 },
        position: { x: 0, y: 0 },
        layerMask: CollisionLayer.BODY,
      }) as { output: PhysicsQueryOutput };

      // e1 body is at (8, 8) (centre of rect), within the query bounds
      expect(output.entities).toContain(e1.id);
      expect(output.entities).not.toContain(e2.id);
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
    it('returns hit: false when no bodies are in the path', () => {
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
    it('cleans up all listeners and bodies on destroy', () => {
      const { core, em, adapter } = createSetup();
      const entity = em.create({ id: 'cleanup' });

      core.events.emitSync('physics/body:add', {
        entityId: entity.id,
        shape: { type: 'rect', width: 16, height: 16 },
        layer: CollisionLayer.BODY,
      });

      adapter.destroy(core);

      // After destroy, physics/move should be a no-op (listeners removed).
      expect(() => {
        core.events.emitSync('physics/move', { entityId: entity.id, dx: 1, dy: 1 });
      }).not.toThrow();
    });
  });
});
