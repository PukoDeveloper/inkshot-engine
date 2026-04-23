import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { EntityManager } from '../src/plugins/entity/EntityManager.js';
import { PathfindingManager } from '../src/plugins/world/PathfindingManager.js';
import type { PathfindingFindOutput } from '../src/types/pathfinding.js';
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

/** Build EntityManager + PathfindingManager on a shared EventBus. */
function createSetup(options?: ConstructorParameters<typeof PathfindingManager>[0]) {
  const { core } = createCoreStub();
  const em = new EntityManager();
  const pf = new PathfindingManager(options);
  em.init(core);
  pf.init(core);
  return { core, events: core.events, em, pf };
}

// ---------------------------------------------------------------------------
// Tilemap helpers
// ---------------------------------------------------------------------------

/**
 * A simple 5×5 test map (16 px tiles):
 *
 * row 0:  . . . . .
 * row 1:  . . . . .
 * row 2:  . . X . .   (X = solid at [2][2])
 * row 3:  X X X X X   (solid row — floor)
 * row 4:  . . . . .   (below floor — unreachable from above)
 *
 * "." = tileId 0 (passable), "X" = tileId 1 (solid)
 */
const TILE_SIZE = 16;
const TILEMAP_5X5 = {
  tileSize: TILE_SIZE,
  layers: [
    [0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0],
    [0, 0, 1, 0, 0],
    [1, 1, 1, 1, 1],
    [0, 0, 0, 0, 0],
  ],
  tileShapes: { 1: 'solid' as const },
};

function loadTilemap(
  events: ReturnType<typeof createCoreStub>['core']['events'],
  map = TILEMAP_5X5,
) {
  events.emitSync('physics/tilemap:set', map);
}

/** World-pixel centre of tile (row, col) in a 16 px grid. */
function tileCenter(row: number, col: number): { x: number; y: number } {
  return { x: col * TILE_SIZE + TILE_SIZE / 2, y: row * TILE_SIZE + TILE_SIZE / 2 };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('PathfindingManager', () => {
  // -------------------------------------------------------------------------
  // No tilemap loaded
  // -------------------------------------------------------------------------

  describe('without tilemap', () => {
    it('returns found=false when no tilemap has been loaded', () => {
      const { events } = createSetup();
      const { output } = events.emitSync<unknown, PathfindingFindOutput>(
        'pathfinding/find',
        { from: { x: 8, y: 8 }, to: { x: 72, y: 8 } },
      );

      expect(output.found).toBe(false);
      expect(output.path).toEqual([]);
      expect(output.cost).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Basic pathfinding
  // -------------------------------------------------------------------------

  describe('basic pathfinding', () => {
    let events: ReturnType<typeof createSetup>['events'];

    beforeEach(() => {
      ({ events } = createSetup());
      loadTilemap(events);
    });

    it('finds a trivial path when start equals goal', () => {
      const { output } = events.emitSync<unknown, PathfindingFindOutput>(
        'pathfinding/find',
        { from: tileCenter(0, 0), to: tileCenter(0, 0) },
      );

      expect(output.found).toBe(true);
      expect(output.path).toHaveLength(1);
      expect(output.cost).toBe(0);
    });

    it('finds a path between two open cells in the same row', () => {
      const { output } = events.emitSync<unknown, PathfindingFindOutput>(
        'pathfinding/find',
        { from: tileCenter(0, 0), to: tileCenter(0, 4) },
      );

      expect(output.found).toBe(true);
      expect(output.path.length).toBeGreaterThan(1);
      // First waypoint near start
      expect(output.path[0].x).toBeCloseTo(tileCenter(0, 0).x, 0);
      // Last waypoint near goal
      const last = output.path[output.path.length - 1];
      expect(last.x).toBeCloseTo(tileCenter(0, 4).x, 0);
    });

    it('routes around the solid tile at [2][2]', () => {
      // From [1][1] to [1][3] — must route around or above the solid at [2][2]
      const { output } = events.emitSync<unknown, PathfindingFindOutput>(
        'pathfinding/find',
        { from: tileCenter(1, 1), to: tileCenter(1, 3) },
      );

      expect(output.found).toBe(true);
      // Ensure the path does not pass through the impassable tile centre
      const solidCenter = tileCenter(2, 2);
      const passesThrough = output.path.some(
        (p) => Math.abs(p.x - solidCenter.x) < 1 && Math.abs(p.y - solidCenter.y) < 1,
      );
      expect(passesThrough).toBe(false);
    });

    it('returns found=false when the destination is a solid tile', () => {
      const { output } = events.emitSync<unknown, PathfindingFindOutput>(
        'pathfinding/find',
        { from: tileCenter(0, 0), to: tileCenter(2, 2) }, // solid
      );

      expect(output.found).toBe(false);
    });

    it('returns found=false when start is out of bounds', () => {
      const { output } = events.emitSync<unknown, PathfindingFindOutput>(
        'pathfinding/find',
        { from: { x: -100, y: -100 }, to: tileCenter(0, 0) },
      );

      expect(output.found).toBe(false);
    });

    it('returns found=false when no path exists (surrounded by walls)', () => {
      // The area below the solid floor row (row 3) is unreachable from row 0.
      const { output } = events.emitSync<unknown, PathfindingFindOutput>(
        'pathfinding/find',
        { from: tileCenter(0, 0), to: tileCenter(4, 4) },
      );

      expect(output.found).toBe(false);
    });

    it('path waypoints are world-pixel tile centres', () => {
      const { output } = events.emitSync<unknown, PathfindingFindOutput>(
        'pathfinding/find',
        { from: tileCenter(0, 0), to: tileCenter(0, 2) },
      );

      expect(output.found).toBe(true);
      for (const pt of output.path) {
        // Each waypoint should be at a tile centre (half-pixel offset from edge)
        const half = TILE_SIZE / 2;
        expect(pt.x % TILE_SIZE).toBeCloseTo(half, 5);
        expect(pt.y % TILE_SIZE).toBeCloseTo(half, 5);
      }
    });

    it('cost is greater than 0 for a multi-tile path', () => {
      const { output } = events.emitSync<unknown, PathfindingFindOutput>(
        'pathfinding/find',
        { from: tileCenter(0, 0), to: tileCenter(0, 3) },
      );

      expect(output.found).toBe(true);
      expect(output.cost).toBeGreaterThan(0);
    });
  });

  // -------------------------------------------------------------------------
  // 4-directional mode
  // -------------------------------------------------------------------------

  describe('4-directional mode', () => {
    it('finds a path using only cardinal moves', () => {
      const { events } = createSetup({ directions: 4 });
      loadTilemap(events);

      const { output } = events.emitSync<unknown, PathfindingFindOutput>(
        'pathfinding/find',
        { from: tileCenter(0, 0), to: tileCenter(0, 3) },
      );

      expect(output.found).toBe(true);
      // All moves should be purely horizontal or vertical (no diagonals)
      for (let i = 1; i < output.path.length; i++) {
        const dx = Math.abs(output.path[i].x - output.path[i - 1].x);
        const dy = Math.abs(output.path[i].y - output.path[i - 1].y);
        // In 4-dir mode, either dx or dy (but not both) should be non-zero
        const isDiagonal = dx > 0 && dy > 0;
        expect(isDiagonal).toBe(false);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Weight overrides — pathfinding/weight:set
  // -------------------------------------------------------------------------

  describe('pathfinding/weight:set', () => {
    it('makes a tileId impassable when cost is Infinity', () => {
      const { events } = createSetup();
      // All tileId 0 cells are open by default; tileId 2 fills the entire middle row
      const map = {
        tileSize: TILE_SIZE,
        layers: [
          [0, 0, 0, 0, 0],
          [2, 2, 2, 2, 2], // tileId 2 full-width wall
          [0, 0, 0, 0, 0],
        ],
        tileShapes: {},
      };
      loadTilemap(events, map);

      // Before weight override: tileId 2 is passable (no shape)
      const before = events.emitSync<unknown, PathfindingFindOutput>(
        'pathfinding/find',
        { from: tileCenter(0, 0), to: tileCenter(2, 4) },
      );
      expect(before.output.found).toBe(true);

      // Set tileId 2 to impassable — now row 1 is a solid wall
      events.emitSync('pathfinding/weight:set', { tileId: 2, cost: Infinity });

      const after = events.emitSync<unknown, PathfindingFindOutput>(
        'pathfinding/find',
        { from: tileCenter(0, 0), to: tileCenter(2, 4) },
      );
      expect(after.output.found).toBe(false);
    });

    it('produces longer but valid path when terrain is costly', () => {
      const { events } = createSetup();
      // 3-row map: row 1 is tileId 2 (will be costly)
      const map = {
        tileSize: TILE_SIZE,
        layers: [
          [0, 0, 0, 0, 0],
          [0, 2, 2, 2, 0],
          [0, 0, 0, 0, 0],
        ],
        tileShapes: {},
      };
      loadTilemap(events, map);

      // Give tileId 2 a very high cost — A* should avoid it
      events.emitSync('pathfinding/weight:set', { tileId: 2, cost: 100 });

      const result = events.emitSync<unknown, PathfindingFindOutput>(
        'pathfinding/find',
        { from: tileCenter(0, 0), to: tileCenter(2, 4) },
      );

      expect(result.output.found).toBe(true);
      // Path avoids the costly row 1 interior — check no waypoint at row1 col 1-3
      const costly = result.output.path.filter((p) => {
        const row = Math.floor(p.y / TILE_SIZE);
        const col = Math.floor(p.x / TILE_SIZE);
        return row === 1 && col >= 1 && col <= 3;
      });
      expect(costly).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Path caching — pathfinding/cache:clear
  // -------------------------------------------------------------------------

  describe('path cache', () => {
    it('returns the same path object on repeated identical calls (cache hit)', () => {
      const { events } = createSetup();
      loadTilemap(events);

      const first = events.emitSync<unknown, PathfindingFindOutput>(
        'pathfinding/find',
        { from: tileCenter(0, 0), to: tileCenter(0, 4) },
      );
      const second = events.emitSync<unknown, PathfindingFindOutput>(
        'pathfinding/find',
        { from: tileCenter(0, 0), to: tileCenter(0, 4) },
      );

      // Cached result is the same reference
      expect(first.output.path).toBe(second.output.path);
    });

    it('clears the cache on tilemap reload', () => {
      const { events } = createSetup();
      loadTilemap(events);

      const first = events.emitSync<unknown, PathfindingFindOutput>(
        'pathfinding/find',
        { from: tileCenter(0, 0), to: tileCenter(0, 4) },
      );

      // Reload tilemap — cache should clear
      loadTilemap(events);

      const second = events.emitSync<unknown, PathfindingFindOutput>(
        'pathfinding/find',
        { from: tileCenter(0, 0), to: tileCenter(0, 4) },
      );

      expect(first.output.path).not.toBe(second.output.path);
    });

    it('clears the cache via pathfinding/cache:clear', () => {
      const { events } = createSetup();
      loadTilemap(events);

      const first = events.emitSync<unknown, PathfindingFindOutput>(
        'pathfinding/find',
        { from: tileCenter(0, 0), to: tileCenter(0, 4) },
      );

      events.emitSync('pathfinding/cache:clear', {});

      const second = events.emitSync<unknown, PathfindingFindOutput>(
        'pathfinding/find',
        { from: tileCenter(0, 0), to: tileCenter(0, 4) },
      );

      expect(first.output.path).not.toBe(second.output.path);
    });

    it('does NOT cache results when includeDynamicObstacles is true', () => {
      const { events } = createSetup();
      loadTilemap(events);

      const first = events.emitSync<unknown, PathfindingFindOutput>(
        'pathfinding/find',
        { from: tileCenter(0, 0), to: tileCenter(0, 4), includeDynamicObstacles: true },
      );
      const second = events.emitSync<unknown, PathfindingFindOutput>(
        'pathfinding/find',
        { from: tileCenter(0, 0), to: tileCenter(0, 4), includeDynamicObstacles: true },
      );

      // Results should not be the same object reference (no caching)
      expect(first.output.path).not.toBe(second.output.path);
    });
  });

  // -------------------------------------------------------------------------
  // Dynamic obstacles
  // -------------------------------------------------------------------------

  describe('dynamic obstacles', () => {
    it('treats entity positions as impassable cells when includeDynamicObstacles=true', () => {
      const { events, em } = createSetup();

      // 1×5 corridor — all passable
      const corridor = {
        tileSize: TILE_SIZE,
        layers: [[0, 0, 0, 0, 0]],
        tileShapes: {},
      };
      loadTilemap(events, corridor);

      // Place an entity that blocks the middle of the corridor
      em.create({ position: tileCenter(0, 2) }); // occupies tile [0][2]

      const { output } = events.emitSync<unknown, PathfindingFindOutput>(
        'pathfinding/find',
        {
          from: tileCenter(0, 0),
          to:   tileCenter(0, 4),
          includeDynamicObstacles: true,
        },
      );

      // The path must exist (corridor has edges) but must not step on [0][2]
      expect(output.found).toBe(false); // 1-row corridor fully blocked by entity at [0,2]
    });

    it('does NOT block entity cells when includeDynamicObstacles is false', () => {
      const { events, em } = createSetup();

      const corridor = {
        tileSize: TILE_SIZE,
        layers: [[0, 0, 0, 0, 0]],
        tileShapes: {},
      };
      loadTilemap(events, corridor);

      em.create({ position: tileCenter(0, 2) });

      const { output } = events.emitSync<unknown, PathfindingFindOutput>(
        'pathfinding/find',
        { from: tileCenter(0, 0), to: tileCenter(0, 4) },
      );

      expect(output.found).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // maxIterations guard
  // -------------------------------------------------------------------------

  describe('maxIterations', () => {
    it('aborts and returns found=false when maxIterations is exceeded', () => {
      const { events } = createSetup();
      // Large open map — many cells to explore
      const bigMap = {
        tileSize: TILE_SIZE,
        layers: Array.from({ length: 10 }, () => Array.from({ length: 10 }, () => 0)),
        tileShapes: {},
      };
      loadTilemap(events, bigMap);

      const { output } = events.emitSync<unknown, PathfindingFindOutput>(
        'pathfinding/find',
        { from: tileCenter(0, 0), to: tileCenter(9, 9), maxIterations: 1 },
      );

      expect(output.found).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Direct accessor
  // -------------------------------------------------------------------------

  describe('getCellCost()', () => {
    it('returns IMPASSABLE for a solid tile', () => {
      const { events, pf } = createSetup();
      loadTilemap(events);

      expect(pf.getCellCost(2, 2)).toBe(PathfindingManager.IMPASSABLE);
    });

    it('returns 1 for a passable tile', () => {
      const { events, pf } = createSetup();
      loadTilemap(events);

      expect(pf.getCellCost(0, 0)).toBe(1);
    });

    it('returns undefined for out-of-bounds coordinates', () => {
      const { events, pf } = createSetup();
      loadTilemap(events);

      expect(pf.getCellCost(99, 99)).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // destroy()
  // -------------------------------------------------------------------------

  describe('destroy()', () => {
    it('stops responding to events after destroy', () => {
      const { core, events, pf } = createSetup();
      loadTilemap(events);

      pf.destroy(core);

      // After destroy, no handler should be registered
      expect(() => {
        events.emitSync('pathfinding/find', { from: { x: 0, y: 0 }, to: { x: 0, y: 0 } });
      }).not.toThrow();
    });

    it('resets getCellCost to undefined after destroy', () => {
      const { core, events, pf } = createSetup();
      loadTilemap(events);

      pf.destroy(core);

      expect(pf.getCellCost(0, 0)).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // pathfinding/grid:set (non-tilemap usage)
  // -------------------------------------------------------------------------

  describe('pathfinding/grid:set', () => {
    const WALL = Infinity;
    const GRID_TILE_SIZE = 32;

    /**
     * 3×3 grid (32 px tiles):
     *   . . .
     *   . X .
     *   . . .
     * Centre cell (1,1) is a wall.
     */
    const RAW_GRID_3X3 = {
      grid: [
        [1,    1,    1   ],
        [1,    WALL, 1   ],
        [1,    1,    1   ],
      ],
      tileSize: GRID_TILE_SIZE,
    };

    function tileCenter32(row: number, col: number): { x: number; y: number } {
      return { x: col * GRID_TILE_SIZE + GRID_TILE_SIZE / 2, y: row * GRID_TILE_SIZE + GRID_TILE_SIZE / 2 };
    }

    it('enables pathfinding without any tilemap data', () => {
      const { events } = createSetup();
      events.emitSync('pathfinding/grid:set', RAW_GRID_3X3);

      const { output } = events.emitSync<unknown, PathfindingFindOutput>(
        'pathfinding/find',
        { from: tileCenter32(0, 0), to: tileCenter32(0, 2) },
      );

      expect(output.found).toBe(true);
      expect(output.path.length).toBeGreaterThan(0);
    });

    it('treats Infinity cells as impassable', () => {
      const { events } = createSetup();
      // 1×3 corridor with a wall in the middle — no path possible.
      events.emitSync('pathfinding/grid:set', {
        grid: [[1, WALL, 1]],
        tileSize: 32,
      });

      const { output } = events.emitSync<unknown, PathfindingFindOutput>(
        'pathfinding/find',
        { from: { x: 16, y: 16 }, to: { x: 80, y: 16 } },
      );

      expect(output.found).toBe(false);
    });

    it('routes around an interior wall', () => {
      const { events } = createSetup();
      events.emitSync('pathfinding/grid:set', RAW_GRID_3X3);

      // From top-left (0,0) to bottom-right (2,2) — must go around (1,1).
      const { output } = events.emitSync<unknown, PathfindingFindOutput>(
        'pathfinding/find',
        { from: tileCenter32(0, 0), to: tileCenter32(2, 2) },
      );

      expect(output.found).toBe(true);
      // The path should not pass through the wall cell centre.
      const wallCenter = tileCenter32(1, 1);
      const passedThroughWall = output.path.some(
        pt => Math.abs(pt.x - wallCenter.x) < 1 && Math.abs(pt.y - wallCenter.y) < 1,
      );
      expect(passedThroughWall).toBe(false);
    });

    it('getCellCost reflects the raw grid values', () => {
      const { events, pf } = createSetup();
      events.emitSync('pathfinding/grid:set', RAW_GRID_3X3);

      expect(pf.getCellCost(0, 0)).toBe(1);
      expect(pf.getCellCost(1, 1)).toBe(Infinity);
    });

    it('clears the path cache on grid:set', () => {
      const { events } = createSetup();
      events.emitSync('pathfinding/grid:set', RAW_GRID_3X3);

      // Prime the cache.
      const { output: first } = events.emitSync<unknown, PathfindingFindOutput>(
        'pathfinding/find',
        { from: tileCenter32(0, 0), to: tileCenter32(0, 2) },
      );
      expect(first.found).toBe(true);

      // Replace the grid with a fully blocked one.
      events.emitSync('pathfinding/grid:set', {
        grid: [[WALL, WALL, WALL]],
        tileSize: GRID_TILE_SIZE,
      });

      // The old cached result should no longer be returned.
      const { output: second } = events.emitSync<unknown, PathfindingFindOutput>(
        'pathfinding/find',
        { from: { x: 16, y: 16 }, to: { x: 80, y: 16 } },
      );
      expect(second.found).toBe(false);
    });

    it('weighted cells are respected (A* prefers cheaper paths)', () => {
      const { events } = createSetup();
      // 1×5 grid: cells 1–3 cost 10 (expensive), direct row is costly.
      events.emitSync('pathfinding/grid:set', {
        grid: [[1, 10, 10, 10, 1]],
        tileSize: 32,
      });

      const { output } = events.emitSync<unknown, PathfindingFindOutput>(
        'pathfinding/find',
        { from: { x: 16, y: 16 }, to: { x: 144, y: 16 } },
      );
      // Should still find a path (just costly).
      expect(output.found).toBe(true);
      expect(output.cost).toBeGreaterThan(1);
    });
  });
});
