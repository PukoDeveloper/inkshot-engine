import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { EntityManager } from '../src/plugins/EntityManager.js';
import { KinematicPhysicsAdapter } from '../src/plugins/KinematicPhysicsAdapter.js';
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
// Test helpers
// ---------------------------------------------------------------------------

function createContainerStub() {
  const children: unknown[] = [];
  return {
    x: 0,
    y: 0,
    label: '',
    parent: null as unknown,
    addChild(c: unknown) {
      children.push(c);
      (c as Record<string, unknown>).parent = this;
    },
    removeChild(c: unknown) {
      const i = children.indexOf(c);
      if (i >= 0) children.splice(i, 1);
      (c as Record<string, unknown>).parent = null;
    },
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

/** Build a full test environment with EntityManager and KinematicPhysicsAdapter. */
function createSetup() {
  const { core } = createCoreStub();
  const em = new EntityManager();
  const cm = new KinematicPhysicsAdapter();
  em.init(core);
  cm.init(core);
  return { core, events: core.events, em, cm };
}

/** Standard 16×16 tile grid:
 *  row 0: [0, 0, 0, 0, 0]
 *  row 1: [0, 0, 0, 0, 0]
 *  row 2: [0, 0, 1, 0, 0]   ← solid tile at (row=2, col=2)
 *  row 3: [1, 1, 1, 1, 1]   ← solid row (floor)
 */
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

describe('KinematicPhysicsAdapter', () => {
  // ─────────────────────────────────────────────────────────────────────────
  // Collider registration
  // ─────────────────────────────────────────────────────────────────────────
  describe('collider registration', () => {
    it('registers a collider via event', () => {
      const { core, em } = createSetup();
      const entity = em.create({ id: 'a' });
      core.events.emitSync('physics/body:add', {
        entityId: entity.id,
        shape: { type: 'rect', width: 16, height: 16 },
        layer: CollisionLayer.BODY,
      });

      // No error — registration is internal. We verify via physics/query.
      const { output } = core.events.emitSync('physics/query', {
        shape: { type: 'rect', width: 1, height: 1 },
        position: { x: 0, y: 0 },
        layerMask: CollisionLayer.BODY,
      }) as { output: PhysicsQueryOutput };
      expect(output.entities).toContain(entity.id);
    });

    it('removes a collider via event', () => {
      const { core, em } = createSetup();
      const entity = em.create({ id: 'b' });
      core.events.emitSync('physics/body:add', {
        entityId: entity.id,
        shape: { type: 'rect', width: 16, height: 16 },
        layer: CollisionLayer.BODY,
      });
      core.events.emitSync('physics/body:remove', { entityId: entity.id });

      const { output } = core.events.emitSync('physics/query', {
        shape: { type: 'rect', width: 1, height: 1 },
        position: { x: 0, y: 0 },
        layerMask: CollisionLayer.BODY,
      }) as { output: PhysicsQueryOutput };
      expect(output.entities).not.toContain(entity.id);
    });

    it('auto-removes collider when entity is destroyed', () => {
      const { core, em } = createSetup();
      const entity = em.create({ id: 'c' });
      core.events.emitSync('physics/body:add', {
        entityId: entity.id,
        shape: { type: 'rect', width: 16, height: 16 },
        layer: CollisionLayer.BODY,
      });

      em.destroyById(entity.id);

      const { output } = core.events.emitSync('physics/query', {
        shape: { type: 'rect', width: 200, height: 200 },
        position: { x: 0, y: 0 },
        layerMask: CollisionLayer.BODY,
      }) as { output: PhysicsQueryOutput };
      expect(output.entities).not.toContain(entity.id);
    });

    it('defaults movementMode to pixel', () => {
      // We cannot inspect internal collider state directly, but grid mode
      // should snap to grid while pixel mode should not.
      const { core, em, events } = createSetup();
      events.emitSync('physics/tilemap:set', TILEMAP);

      const entity = em.create({ id: 'px', position: { x: 5, y: 5 } });
      core.events.emitSync('physics/body:add', {
        entityId: entity.id,
        shape: { type: 'rect', width: 4, height: 4 },
        layer: CollisionLayer.BODY,
        // movementMode omitted → pixel
      });

      const { output } = core.events.emitSync('physics/move', {
        entityId: entity.id, dx: 3, dy: 0,
      }) as { output: PhysicsMoveOutput };
      // In pixel mode the position is 5+3 = 8, not snapped.
      expect(output.x).toBe(8);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Tilemap
  // ─────────────────────────────────────────────────────────────────────────
  describe('tilemap', () => {
    it('registers and replaces a tilemap', () => {
      const { core, em } = createSetup();
      core.events.emitSync('physics/tilemap:set', TILEMAP);

      // Place entity above the solid floor (row 3 starts at y=48)
      // and try to move down into it.
      const entity = em.create({ id: 'e', position: { x: 8, y: 30 } });
      core.events.emitSync('physics/body:add', {
        entityId: entity.id,
        shape: { type: 'rect', width: 16, height: 16 },
        layer: CollisionLayer.BODY,
      });

      const { output } = core.events.emitSync('physics/move', {
        entityId: entity.id, dx: 0, dy: 20,
      }) as { output: PhysicsMoveOutput };

      expect(output.blockedY).toBe(true);
      // Floor is at row 3, y=48. Entity's bottom = posY + 16 = 48 → posY = 32.
      expect(output.y).toBe(32);
    });

    it('replaces a previously registered tilemap', () => {
      const { core, em } = createSetup();
      core.events.emitSync('physics/tilemap:set', TILEMAP);

      // Replace with an empty map (no solid tiles).
      core.events.emitSync('physics/tilemap:set', {
        tileSize: TILE_SIZE,
        layers: [[0, 0], [0, 0]],
        tileShapes: { 1: 'solid' as const },
      });

      const entity = em.create({ id: 'nowall', position: { x: 0, y: 0 } });
      core.events.emitSync('physics/body:add', {
        entityId: entity.id,
        shape: { type: 'rect', width: 8, height: 8 },
        layer: CollisionLayer.BODY,
      });

      const { output } = core.events.emitSync('physics/move', {
        entityId: entity.id, dx: 100, dy: 0,
      }) as { output: PhysicsMoveOutput };
      expect(output.blockedX).toBe(false);
      expect(output.x).toBe(100);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Movement — no collisions
  // ─────────────────────────────────────────────────────────────────────────
  describe('physics/move — free movement', () => {
    it('moves freely when no tiles or other entities block', () => {
      const { core, em } = createSetup();
      const entity = em.create({ id: 'free', position: { x: 0, y: 0 } });
      core.events.emitSync('physics/body:add', {
        entityId: entity.id,
        shape: { type: 'rect', width: 8, height: 8 },
        layer: CollisionLayer.BODY,
      });

      const { output } = core.events.emitSync('physics/move', {
        entityId: entity.id, dx: 10, dy: 15,
      }) as { output: PhysicsMoveOutput };

      expect(output.x).toBe(10);
      expect(output.y).toBe(15);
      expect(output.blockedX).toBe(false);
      expect(output.blockedY).toBe(false);
      expect(entity.position).toEqual({ x: 10, y: 15 });
    });

    it('returns current position unchanged when no BODY collider registered', () => {
      const { core, em } = createSetup();
      const entity = em.create({ id: 'nobody', position: { x: 5, y: 10 } });
      // Only a SENSOR collider — no BODY.
      core.events.emitSync('physics/body:add', {
        entityId: entity.id,
        shape: { type: 'rect', width: 8, height: 8 },
        layer: CollisionLayer.SENSOR,
      });

      const { output } = core.events.emitSync('physics/move', {
        entityId: entity.id, dx: 20, dy: 20,
      }) as { output: PhysicsMoveOutput };

      expect(output.x).toBe(5);
      expect(output.y).toBe(10);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Movement — tile collision
  // ─────────────────────────────────────────────────────────────────────────
  describe('physics/move — tile collision', () => {
    it('blocks moving right into a solid tile', () => {
      const { core, em } = createSetup();
      core.events.emitSync('physics/tilemap:set', TILEMAP);

      // col=2 starts at x=32 (solid in row 2). Entity 8px wide at row 2 (y=32).
      const entity = em.create({ id: 'rwall', position: { x: 20, y: 32 } });
      core.events.emitSync('physics/body:add', {
        entityId: entity.id,
        shape: { type: 'rect', width: 8, height: 8 },
        layer: CollisionLayer.BODY,
      });

      const { output } = core.events.emitSync('physics/move', {
        entityId: entity.id, dx: 20, dy: 0,
      }) as { output: PhysicsMoveOutput };

      expect(output.blockedX).toBe(true);
      // Entity's right edge should be at x=32 (tile left), so entity.x = 32 - 8 = 24
      expect(output.x).toBe(24);
    });

    it('blocks moving left into a solid tile', () => {
      const { core, em } = createSetup();
      core.events.emitSync('physics/tilemap:set', TILEMAP);

      // col=2 (x=32 to x=48) is solid in row 2. Entity 8px wide starts at x=50, row 2 (y=32).
      const entity = em.create({ id: 'lwall', position: { x: 50, y: 32 } });
      core.events.emitSync('physics/body:add', {
        entityId: entity.id,
        shape: { type: 'rect', width: 8, height: 8 },
        layer: CollisionLayer.BODY,
      });

      const { output } = core.events.emitSync('physics/move', {
        entityId: entity.id, dx: -20, dy: 0,
      }) as { output: PhysicsMoveOutput };

      expect(output.blockedX).toBe(true);
      // tile right = col*16+16 = 48; entity left = 48, so entity.x = 48
      expect(output.x).toBe(48);
    });

    it('blocks moving down into a solid tile (floor)', () => {
      const { core, em } = createSetup();
      core.events.emitSync('physics/tilemap:set', TILEMAP);

      // Floor is row 3: y=48 to y=64. Entity 8px tall starts at y=30.
      const entity = em.create({ id: 'floor', position: { x: 8, y: 30 } });
      core.events.emitSync('physics/body:add', {
        entityId: entity.id,
        shape: { type: 'rect', width: 8, height: 8 },
        layer: CollisionLayer.BODY,
      });

      const { output } = core.events.emitSync('physics/move', {
        entityId: entity.id, dx: 0, dy: 30,
      }) as { output: PhysicsMoveOutput };

      expect(output.blockedY).toBe(true);
      // Row 3 top = 48, entity bottom = posY+8 = 48 → posY = 40
      expect(output.y).toBe(40);
    });

    it('blocks moving up into a solid tile (ceiling)', () => {
      const { core, em } = createSetup();
      // Use a map where row 0 is all solid.
      core.events.emitSync('physics/tilemap:set', {
        tileSize: TILE_SIZE,
        layers: [[1, 1, 1, 1, 1], [0, 0, 0, 0, 0]],
        tileShapes: { 1: 'solid' as const },
      });

      // Entity 8px tall starts at y=20, moving up.
      const entity = em.create({ id: 'ceil', position: { x: 8, y: 20 } });
      core.events.emitSync('physics/body:add', {
        entityId: entity.id,
        shape: { type: 'rect', width: 8, height: 8 },
        layer: CollisionLayer.BODY,
      });

      const { output } = core.events.emitSync('physics/move', {
        entityId: entity.id, dx: 0, dy: -25,
      }) as { output: PhysicsMoveOutput };

      expect(output.blockedY).toBe(true);
      // Row 0 bottom = 16; entity top = posY = 16
      expect(output.y).toBe(16);
    });

    it('resolves X and Y independently (no corner-cutting)', () => {
      const { core, em } = createSetup();
      core.events.emitSync('physics/tilemap:set', TILEMAP);

      // Move diagonally toward the floor corner.
      const entity = em.create({ id: 'diag', position: { x: 8, y: 30 } });
      core.events.emitSync('physics/body:add', {
        entityId: entity.id,
        shape: { type: 'rect', width: 8, height: 8 },
        layer: CollisionLayer.BODY,
      });

      const { output } = core.events.emitSync('physics/move', {
        entityId: entity.id, dx: 10, dy: 30,
      }) as { output: PhysicsMoveOutput };

      expect(output.blockedY).toBe(true);
      // X movement in open space should succeed.
      expect(output.x).toBe(18);
      // Y blocked by floor at row 3 (y=48). entity bottom = posY+8 = 48 → posY = 40.
      expect(output.y).toBe(40);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Movement — entity-entity body collision
  // ─────────────────────────────────────────────────────────────────────────
  describe('physics/move — entity body collision', () => {
    it('blocks moving right into another BODY entity', () => {
      const { core, em } = createSetup();

      // Wall entity at x=50, 16px wide
      const wall = em.create({ id: 'wall', position: { x: 50, y: 0 } });
      core.events.emitSync('physics/body:add', {
        entityId: wall.id,
        shape: { type: 'rect', width: 16, height: 16 },
        layer: CollisionLayer.BODY,
      });

      // Player at x=20, 8px wide
      const player = em.create({ id: 'player', position: { x: 20, y: 0 } });
      core.events.emitSync('physics/body:add', {
        entityId: player.id,
        shape: { type: 'rect', width: 8, height: 8 },
        layer: CollisionLayer.BODY,
      });

      const { output } = core.events.emitSync('physics/move', {
        entityId: player.id, dx: 40, dy: 0,
      }) as { output: PhysicsMoveOutput };

      expect(output.blockedX).toBe(true);
      // Player right = wall left = 50 → playerX = 50 - 8 = 42
      expect(output.x).toBe(42);
    });

    it('does not block non-BODY entity colliders', () => {
      const { core, em } = createSetup();

      // Sensor entity — should not block movement
      const sensor = em.create({ id: 'sensor', position: { x: 30, y: 0 } });
      core.events.emitSync('physics/body:add', {
        entityId: sensor.id,
        shape: { type: 'rect', width: 16, height: 16 },
        layer: CollisionLayer.SENSOR,
      });

      const player = em.create({ id: 'mover', position: { x: 0, y: 0 } });
      core.events.emitSync('physics/body:add', {
        entityId: player.id,
        shape: { type: 'rect', width: 8, height: 8 },
        layer: CollisionLayer.BODY,
      });

      const { output } = core.events.emitSync('physics/move', {
        entityId: player.id, dx: 50, dy: 0,
      }) as { output: PhysicsMoveOutput };

      expect(output.blockedX).toBe(false);
      expect(output.x).toBe(50);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Grid mode
  // ─────────────────────────────────────────────────────────────────────────
  describe('physics/move — grid mode', () => {
    it('snaps position to tile grid after a move', () => {
      const { core, em } = createSetup();
      core.events.emitSync('physics/tilemap:set', TILEMAP);

      const entity = em.create({ id: 'grid', position: { x: 0, y: 0 } });
      core.events.emitSync('physics/body:add', {
        entityId: entity.id,
        shape: { type: 'rect', width: 8, height: 8 },
        layer: CollisionLayer.BODY,
        movementMode: 'grid',
      });

      // Move 5 pixels right — grid snap should round to nearest tile (0 or 16).
      const { output } = core.events.emitSync('physics/move', {
        entityId: entity.id, dx: 5, dy: 0,
      }) as { output: PhysicsMoveOutput };

      // 5 rounds to 0 (nearest multiple of 16)
      expect(output.x % TILE_SIZE).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // physics/query
  // ─────────────────────────────────────────────────────────────────────────
  describe('physics/query', () => {
    it('returns entities whose colliders overlap a query rect', () => {
      const { core, em } = createSetup();

      const a = em.create({ id: 'qa', position: { x: 10, y: 10 } });
      const b = em.create({ id: 'qb', position: { x: 100, y: 100 } });

      for (const e of [a, b]) {
        core.events.emitSync('physics/body:add', {
          entityId: e.id,
          shape: { type: 'rect', width: 10, height: 10 },
          layer: CollisionLayer.HURTBOX,
        });
      }

      const { output } = core.events.emitSync('physics/query', {
        shape: { type: 'rect', width: 20, height: 20 },
        position: { x: 0, y: 0 },
        layerMask: CollisionLayer.HURTBOX,
      }) as { output: PhysicsQueryOutput };

      expect(output.entities).toContain(a.id);
      expect(output.entities).not.toContain(b.id);
    });

    it('respects layer mask', () => {
      const { core, em } = createSetup();
      const e = em.create({ id: 'qlayer', position: { x: 0, y: 0 } });
      core.events.emitSync('physics/body:add', {
        entityId: e.id,
        shape: { type: 'rect', width: 10, height: 10 },
        layer: CollisionLayer.HITBOX,
      });

      // Query for HURTBOX — should not find the HITBOX entity.
      const { output } = core.events.emitSync('physics/query', {
        shape: { type: 'rect', width: 50, height: 50 },
        position: { x: 0, y: 0 },
        layerMask: CollisionLayer.HURTBOX,
      }) as { output: PhysicsQueryOutput };

      expect(output.entities).not.toContain(e.id);
    });

    it('excludes the entity specified by excludeEntityId', () => {
      const { core, em } = createSetup();
      const e = em.create({ id: 'qexclude', position: { x: 0, y: 0 } });
      core.events.emitSync('physics/body:add', {
        entityId: e.id,
        shape: { type: 'rect', width: 10, height: 10 },
        layer: CollisionLayer.BODY,
      });

      const { output } = core.events.emitSync('physics/query', {
        shape: { type: 'rect', width: 50, height: 50 },
        position: { x: 0, y: 0 },
        layerMask: CollisionLayer.BODY,
        excludeEntityId: e.id,
      }) as { output: PhysicsQueryOutput };

      expect(output.entities).not.toContain(e.id);
    });

    it('finds entities via a circle query shape', () => {
      const { core, em } = createSetup();
      const near = em.create({ id: 'near', position: { x: 5, y: 5 } });
      const far = em.create({ id: 'far', position: { x: 200, y: 200 } });

      for (const e of [near, far]) {
        core.events.emitSync('physics/body:add', {
          entityId: e.id,
          shape: { type: 'rect', width: 8, height: 8 },
          layer: CollisionLayer.HURTBOX,
        });
      }

      const { output } = core.events.emitSync('physics/query', {
        shape: { type: 'circle', radius: 20 },
        position: { x: 0, y: 0 },
        layerMask: CollisionLayer.HURTBOX,
      }) as { output: PhysicsQueryOutput };

      expect(output.entities).toContain(near.id);
      expect(output.entities).not.toContain(far.id);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // physics/raycast
  // ─────────────────────────────────────────────────────────────────────────
  describe('physics/raycast', () => {
    it('returns hit=false when no entities or tiles in path', () => {
      const { core } = createSetup();

      const { output } = core.events.emitSync('physics/raycast', {
        origin: { x: 0, y: 0 },
        direction: { x: 1, y: 0 },
        maxDistance: 50,
        layerMask: CollisionLayer.HURTBOX,
      }) as { output: PhysicsRaycastOutput };

      expect(output.hit).toBe(false);
    });

    it('hits an entity in the ray path', () => {
      const { core, em } = createSetup();

      const target = em.create({ id: 'rtarget', position: { x: 40, y: 0 } });
      core.events.emitSync('physics/body:add', {
        entityId: target.id,
        shape: { type: 'rect', width: 16, height: 16 },
        layer: CollisionLayer.HURTBOX,
      });

      const { output } = core.events.emitSync('physics/raycast', {
        origin: { x: 0, y: 8 },
        direction: { x: 1, y: 0 },
        layerMask: CollisionLayer.HURTBOX,
      }) as { output: PhysicsRaycastOutput };

      expect(output.hit).toBe(true);
      expect(output.entityId).toBe(target.id);
      expect(output.tileHit).toBe(false);
    });

    it('hits a solid tile when no entity is in the way', () => {
      const { core } = createSetup();
      core.events.emitSync('physics/tilemap:set', TILEMAP);

      // Shoot right along y=4 (row 0) — no solid tiles in row 0.
      // Shoot right along y=36 (row 2) — solid at col=2 (x=32).
      const { output } = core.events.emitSync('physics/raycast', {
        origin: { x: 0, y: 36 },
        direction: { x: 1, y: 0 },
        layerMask: 0, // no entity layers
      }) as { output: PhysicsRaycastOutput };

      expect(output.hit).toBe(true);
      expect(output.tileHit).toBe(true);
      expect(output.entityId).toBeUndefined();
    });

    it('returns hit=false for zero-length direction', () => {
      const { core } = createSetup();

      const { output } = core.events.emitSync('physics/raycast', {
        origin: { x: 0, y: 0 },
        direction: { x: 0, y: 0 },
        layerMask: CollisionLayer.HURTBOX,
      }) as { output: PhysicsRaycastOutput };

      expect(output.hit).toBe(false);
    });

    it('prefers the closer entity over a farther tile', () => {
      const { core, em } = createSetup();
      core.events.emitSync('physics/tilemap:set', TILEMAP);

      // Target entity at x=10 (closer than the tile at x=32)
      const target = em.create({ id: 'closer', position: { x: 10, y: 32 } });
      core.events.emitSync('physics/body:add', {
        entityId: target.id,
        shape: { type: 'rect', width: 8, height: 8 },
        layer: CollisionLayer.HURTBOX,
      });

      const { output } = core.events.emitSync('physics/raycast', {
        origin: { x: 0, y: 34 },
        direction: { x: 1, y: 0 },
        layerMask: CollisionLayer.HURTBOX,
      }) as { output: PhysicsRaycastOutput };

      expect(output.hit).toBe(true);
      expect(output.entityId).toBe(target.id);
      expect(output.tileHit).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Grid utilities
  // ─────────────────────────────────────────────────────────────────────────
  describe('grid utilities', () => {
    it('physics/grid:snap rounds to nearest tile corner', () => {
      const { core } = createSetup();
      core.events.emitSync('physics/tilemap:set', TILEMAP);

      const cases: Array<[number, number, number, number]> = [
        [3, 3, 0, 0],        // round down (3/16 < 0.5 → 0)
        [9, 9, 16, 16],      // round up (9/16 > 0.5 → 16)
        [16, 16, 16, 16],    // already on grid
        [20, 20, 16, 16],    // round down (20/16 = 1.25 → 16)
      ];

      for (const [x, y, ex, ey] of cases) {
        const { output } = core.events.emitSync('physics/grid:snap', { x, y }) as {
          output: PhysicsGridSnapOutput;
        };
        expect(output.x).toBe(ex);
        expect(output.y).toBe(ey);
      }
    });

    it('physics/grid:worldToTile converts pixel coords to tile indices', () => {
      const { core } = createSetup();
      core.events.emitSync('physics/tilemap:set', TILEMAP);

      const { output } = core.events.emitSync('physics/grid:worldToTile', {
        x: 40, y: 20,
      }) as { output: PhysicsWorldToTileOutput };

      expect(output.col).toBe(2); // floor(40/16) = 2
      expect(output.row).toBe(1); // floor(20/16) = 1
    });

    it('physics/grid:tileToWorld converts tile indices to pixel top-left', () => {
      const { core } = createSetup();
      core.events.emitSync('physics/tilemap:set', TILEMAP);

      const { output } = core.events.emitSync('physics/grid:tileToWorld', {
        col: 3, row: 2,
      }) as { output: PhysicsTileToWorldOutput };

      expect(output.x).toBe(48); // 3 * 16
      expect(output.y).toBe(32); // 2 * 16
    });

    it('grid snap is a no-op when no tilemap is set', () => {
      const { core } = createSetup();

      const { output } = core.events.emitSync('physics/grid:snap', { x: 7, y: 9 }) as {
        output: PhysicsGridSnapOutput;
      };
      expect(output.x).toBe(7);
      expect(output.y).toBe(9);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Overlap detection — physics/hit
  // ─────────────────────────────────────────────────────────────────────────
  describe('physics/hit — hitbox vs hurtbox', () => {
    it('emits physics/hit on the first frame of contact', () => {
      const { core, em } = createSetup();

      const attacker = em.create({ id: 'atk', position: { x: 0, y: 0 } });
      const victim = em.create({ id: 'vic', position: { x: 0, y: 0 } });

      core.events.emitSync('physics/body:add', {
        entityId: attacker.id,
        shape: { type: 'rect', width: 16, height: 16 },
        layer: CollisionLayer.HITBOX,
      });
      core.events.emitSync('physics/body:add', {
        entityId: victim.id,
        shape: { type: 'rect', width: 16, height: 16 },
        layer: CollisionLayer.HURTBOX,
      });

      const handler = vi.fn();
      core.events.on('test', 'physics/hit', handler);

      core.events.emitSync('core/update', { dt: 16, tick: 0 });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ attackerId: attacker.id, victimId: victim.id }),
        expect.anything(),
        expect.anything(),
      );
    });

    it('does not re-emit physics/hit on consecutive overlapping frames', () => {
      const { core, em } = createSetup();

      const atk = em.create({ id: 'atk2', position: { x: 0, y: 0 } });
      const vic = em.create({ id: 'vic2', position: { x: 0, y: 0 } });
      core.events.emitSync('physics/body:add', {
        entityId: atk.id, shape: { type: 'rect', width: 16, height: 16 }, layer: CollisionLayer.HITBOX,
      });
      core.events.emitSync('physics/body:add', {
        entityId: vic.id, shape: { type: 'rect', width: 16, height: 16 }, layer: CollisionLayer.HURTBOX,
      });

      const handler = vi.fn();
      core.events.on('test', 'physics/hit', handler);

      core.events.emitSync('core/update', { dt: 16, tick: 0 });
      core.events.emitSync('core/update', { dt: 16, tick: 1 });
      core.events.emitSync('core/update', { dt: 16, tick: 2 });

      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('re-emits physics/hit after separation and re-contact', () => {
      const { core, em } = createSetup();

      const atk = em.create({ id: 'atk3', position: { x: 0, y: 0 } });
      const vic = em.create({ id: 'vic3', position: { x: 0, y: 0 } });
      core.events.emitSync('physics/body:add', {
        entityId: atk.id, shape: { type: 'rect', width: 16, height: 16 }, layer: CollisionLayer.HITBOX,
      });
      core.events.emitSync('physics/body:add', {
        entityId: vic.id, shape: { type: 'rect', width: 16, height: 16 }, layer: CollisionLayer.HURTBOX,
      });

      const handler = vi.fn();
      core.events.on('test', 'physics/hit', handler);

      // First contact
      core.events.emitSync('core/update', { dt: 16, tick: 0 });

      // Separate attacker
      atk.position.x = 100;
      core.events.emitSync('core/update', { dt: 16, tick: 1 });

      // Re-contact
      atk.position.x = 0;
      core.events.emitSync('core/update', { dt: 16, tick: 2 });

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('does not emit self-hits (attacker and victim same entity)', () => {
      const { core, em } = createSetup();

      const e = em.create({ id: 'self', position: { x: 0, y: 0 } });
      core.events.emitSync('physics/body:add', {
        entityId: e.id,
        shape: { type: 'rect', width: 16, height: 16 },
        layer: CollisionLayer.HITBOX | CollisionLayer.HURTBOX,
      });

      const handler = vi.fn();
      core.events.on('test', 'physics/hit', handler);
      core.events.emitSync('core/update', { dt: 16, tick: 0 });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Overlap detection — physics/overlap (sensor)
  // ─────────────────────────────────────────────────────────────────────────
  describe('physics/overlap — sensor', () => {
    it('emits physics/overlap with entered=true when sensors first overlap', () => {
      const { core, em } = createSetup();

      const a = em.create({ id: 'sa', position: { x: 0, y: 0 } });
      const b = em.create({ id: 'sb', position: { x: 0, y: 0 } });
      for (const e of [a, b]) {
        core.events.emitSync('physics/body:add', {
          entityId: e.id, shape: { type: 'circle', radius: 10 }, layer: CollisionLayer.SENSOR,
        });
      }

      const handler = vi.fn();
      core.events.on('test', 'physics/overlap', handler);
      core.events.emitSync('core/update', { dt: 16, tick: 0 });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ entered: true }),
        expect.anything(),
        expect.anything(),
      );
    });

    it('does not re-emit physics/overlap while sensors remain overlapping', () => {
      const { core, em } = createSetup();

      const a = em.create({ id: 'sc', position: { x: 0, y: 0 } });
      const b = em.create({ id: 'sd', position: { x: 0, y: 0 } });
      for (const e of [a, b]) {
        core.events.emitSync('physics/body:add', {
          entityId: e.id, shape: { type: 'circle', radius: 10 }, layer: CollisionLayer.SENSOR,
        });
      }

      const handler = vi.fn();
      core.events.on('test', 'physics/overlap', handler);
      core.events.emitSync('core/update', { dt: 16, tick: 0 });
      core.events.emitSync('core/update', { dt: 16, tick: 1 });

      // entered=true fires once; no entered=false because still overlapping.
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('emits physics/overlap with entered=false when sensors separate', () => {
      const { core, em } = createSetup();

      const a = em.create({ id: 'se', position: { x: 0, y: 0 } });
      const b = em.create({ id: 'sf', position: { x: 0, y: 0 } });
      for (const e of [a, b]) {
        core.events.emitSync('physics/body:add', {
          entityId: e.id, shape: { type: 'circle', radius: 10 }, layer: CollisionLayer.SENSOR,
        });
      }

      const handler = vi.fn();
      core.events.on('test', 'physics/overlap', handler);

      // Overlap
      core.events.emitSync('core/update', { dt: 16, tick: 0 });

      // Separate
      b.position.x = 200;
      core.events.emitSync('core/update', { dt: 16, tick: 1 });

      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ entered: false }),
        expect.anything(),
        expect.anything(),
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Plugin destroy
  // ─────────────────────────────────────────────────────────────────────────
  describe('plugin destroy', () => {
    it('clears all internal state', () => {
      const { core, em, cm } = createSetup();

      const entity = em.create({ id: 'dd' });
      core.events.emitSync('physics/body:add', {
        entityId: entity.id,
        shape: { type: 'rect', width: 8, height: 8 },
        layer: CollisionLayer.BODY,
      });
      core.events.emitSync('physics/tilemap:set', TILEMAP);

      cm.destroy(core);

      // After destroy, the physics/body:add handler is gone — no error.
      expect(() =>
        core.events.emitSync('physics/body:add', {
          entityId: 'ghost',
          shape: { type: 'point' },
          layer: CollisionLayer.SENSOR,
        }),
      ).not.toThrow();

      // physics/move should produce no output (handler removed).
      const { output } = core.events.emitSync('physics/move', {
        entityId: entity.id, dx: 10, dy: 0,
      }) as { output: Partial<PhysicsMoveOutput> };
      expect(output.x).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // top-only tiles
  // ─────────────────────────────────────────────────────────────────────────
  describe('top-only tiles', () => {
    /**
     * Map with a single top-only platform tile at row=2, col=2.
     * (row 2 starts at y=32, tile top = 32)
     */
    const TOP_ONLY_MAP = {
      tileSize: TILE_SIZE,
      layers: [
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
        [0, 0, 2, 0, 0],
        [0, 0, 0, 0, 0],
      ],
      tileShapes: { 2: 'top-only' as const },
    };

    it('blocks entity falling onto the top of a top-only tile', () => {
      const { core, em } = createSetup();
      core.events.emitSync('physics/tilemap:set', TOP_ONLY_MAP);

      // Entity above tile top (y=32), 8px tall, falling down.
      const entity = em.create({ id: 'fall', position: { x: 32, y: 16 } });
      core.events.emitSync('physics/body:add', {
        entityId: entity.id,
        shape: { type: 'rect', width: 8, height: 8 },
        layer: CollisionLayer.BODY,
      });

      const { output } = core.events.emitSync('physics/move', {
        entityId: entity.id, dx: 0, dy: 30,
      }) as { output: PhysicsMoveOutput };

      expect(output.blockedY).toBe(true);
      // Tile top = row 2 * 16 = 32. Entity bottom = posY + 8 = 32 → posY = 24.
      expect(output.y).toBe(24);
    });

    it('does not block entity moving up through a top-only tile', () => {
      const { core, em } = createSetup();
      core.events.emitSync('physics/tilemap:set', TOP_ONLY_MAP);

      // Entity below tile top, jumping upward.
      const entity = em.create({ id: 'jump', position: { x: 32, y: 40 } });
      core.events.emitSync('physics/body:add', {
        entityId: entity.id,
        shape: { type: 'rect', width: 8, height: 8 },
        layer: CollisionLayer.BODY,
      });

      const { output } = core.events.emitSync('physics/move', {
        entityId: entity.id, dx: 0, dy: -30,
      }) as { output: PhysicsMoveOutput };

      expect(output.blockedY).toBe(false);
    });

    it('does not block entity that was already below the tile top when starting to move down', () => {
      const { core, em } = createSetup();
      core.events.emitSync('physics/tilemap:set', TOP_ONLY_MAP);

      // Entity already inside the tile (bottom started below tile top).
      const entity = em.create({ id: 'inside', position: { x: 32, y: 35 } });
      core.events.emitSync('physics/body:add', {
        entityId: entity.id,
        shape: { type: 'rect', width: 8, height: 8 },
        layer: CollisionLayer.BODY,
      });

      const { output } = core.events.emitSync('physics/move', {
        entityId: entity.id, dx: 0, dy: 5,
      }) as { output: PhysicsMoveOutput };

      expect(output.blockedY).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Custom shape resolvers
  // ─────────────────────────────────────────────────────────────────────────
  describe('custom shape resolvers', () => {
    it('invokes a custom resolver for unknown shape strings', () => {
      const resolver = vi.fn().mockReturnValue(null);

      const { core } = createCoreStub();
      const em = new EntityManager();
      const cm = new KinematicPhysicsAdapter({ customShapeResolvers: [resolver] });
      em.init(core);
      cm.init(core);

      core.events.emitSync('physics/tilemap:set', {
        tileSize: TILE_SIZE,
        layers: [[0, 0], [0, 3]],
        tileShapes: { 3: 'my-custom-shape' },
      });

      const entity = em.create({ id: 'custom', position: { x: 0, y: 0 } });
      core.events.emitSync('physics/body:add', {
        entityId: entity.id,
        shape: { type: 'rect', width: 8, height: 8 },
        layer: CollisionLayer.BODY,
      });

      core.events.emitSync('physics/move', {
        entityId: entity.id, dx: 10, dy: 10,
      });

      expect(resolver).toHaveBeenCalledWith(
        'my-custom-shape',
        expect.objectContaining({ tileSize: TILE_SIZE }),
      );
    });

    it('uses the result of a custom resolver that returns blocked=true', () => {
      const { core } = createCoreStub();
      const em = new EntityManager();
      // Custom "ice" shape: solid only on the Y axis when moving down.
      const cm = new KinematicPhysicsAdapter({
        customShapeResolvers: [
          (shape, ctx) => {
            if (shape !== 'ice') return null;
            if (ctx.axis === 'y' && ctx.dy > 0) {
              return { blocked: true, resolved: ctx.tileY - (ctx.entityAABB.bottom - ctx.entityY) };
            }
            return { blocked: false, resolved: ctx.axis === 'x' ? ctx.entityX : ctx.entityY };
          },
        ],
      });
      em.init(core);
      cm.init(core);

      // Ice tile at row=3 (y=48).
      core.events.emitSync('physics/tilemap:set', {
        tileSize: TILE_SIZE,
        layers: [
          [0, 0, 0],
          [0, 0, 0],
          [0, 0, 0],
          [4, 4, 4],
        ],
        tileShapes: { 4: 'ice' },
      });

      const entity = em.create({ id: 'icer', position: { x: 8, y: 24 } });
      core.events.emitSync('physics/body:add', {
        entityId: entity.id,
        shape: { type: 'rect', width: 8, height: 8 },
        layer: CollisionLayer.BODY,
      });

      const { output } = core.events.emitSync('physics/move', {
        entityId: entity.id, dx: 0, dy: 30,
      }) as { output: PhysicsMoveOutput };

      expect(output.blockedY).toBe(true);
      // Ice tile top = 48. Entity bottom = posY + 8 = 48 → posY = 40.
      expect(output.y).toBe(40);
    });

    it('falls back to no-collision when all resolvers return null', () => {
      const { core } = createCoreStub();
      const em = new EntityManager();
      const cm = new KinematicPhysicsAdapter({
        customShapeResolvers: [(_shape, _ctx) => null],
      });
      em.init(core);
      cm.init(core);

      core.events.emitSync('physics/tilemap:set', {
        tileSize: TILE_SIZE,
        layers: [[0, 5], [0, 0]],
        tileShapes: { 5: 'unhandled' },
      });

      const entity = em.create({ id: 'fall2', position: { x: 0, y: 0 } });
      core.events.emitSync('physics/body:add', {
        entityId: entity.id,
        shape: { type: 'rect', width: 8, height: 8 },
        layer: CollisionLayer.BODY,
      });

      const { output } = core.events.emitSync('physics/move', {
        entityId: entity.id, dx: 20, dy: 0,
      }) as { output: PhysicsMoveOutput };

      // No blocking from unhandled shape.
      expect(output.blockedX).toBe(false);
      expect(output.x).toBe(20);
    });
  });

  describe('physics/impulse — ignored by kinematic adapter', () => {
    it('does not throw when physics/impulse is emitted', () => {
      const { core, em } = createSetup();
      const entity = em.create({ id: 'imp' });
      core.events.emitSync('physics/body:add', {
        entityId: entity.id,
        shape: { type: 'rect', width: 16, height: 16 },
        layer: CollisionLayer.BODY,
      });

      expect(() => {
        core.events.emitSync('physics/impulse', { entityId: entity.id, forceX: 10, forceY: 0 });
      }).not.toThrow();
    });
  });
});
