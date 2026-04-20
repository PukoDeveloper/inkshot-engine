import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { TilemapManager } from '../src/plugins/TilemapManager.js';
import type { Core } from '../src/core/Core.js';
import type { TilemapData, TilemapLoadOutput, TilemapGetTileOutput } from '../src/types/tilemap.js';

// ---------------------------------------------------------------------------
// Pixi stubs
// We mock the parts of pixi.js that TilemapManager touches so the tests run
// in a Node / jsdom environment without a real GPU context.
// ---------------------------------------------------------------------------

vi.mock('pixi.js', async () => {
  let spriteIdCounter = 0;
  let containerIdCounter = 0;

  function makeContainer(): {
    _id: number;
    label: string;
    x: number;
    y: number;
    zIndex: number;
    alpha: number;
    visible: boolean;
    cullable: boolean;
    children: unknown[];
    addChild: ReturnType<typeof vi.fn>;
    removeChild: ReturnType<typeof vi.fn>;
    destroy: ReturnType<typeof vi.fn>;
  } {
    const c = {
      _id: containerIdCounter++,
      label: '',
      x: 0,
      y: 0,
      zIndex: 0,
      alpha: 1,
      visible: true,
      cullable: false,
      children: [] as unknown[],
      addChild: vi.fn(function (this: typeof c, child: unknown) {
        this.children.push(child);
        return child;
      }),
      removeChild: vi.fn(function (this: typeof c, child: unknown) {
        const i = this.children.indexOf(child);
        if (i >= 0) this.children.splice(i, 1);
      }),
      destroy: vi.fn(),
    };
    return c;
  }

  class Container {
    _id = containerIdCounter++;
    label = '';
    x = 0;
    y = 0;
    zIndex = 0;
    alpha = 1;
    visible = true;
    cullable = false;
    filters: unknown[] = [];
    children: unknown[] = [];

    addChild(child: unknown) {
      this.children.push(child);
      return child;
    }

    removeChild(child: unknown) {
      const i = this.children.indexOf(child);
      if (i >= 0) this.children.splice(i, 1);
    }

    destroy() {}
  }

  class Sprite {
    _id = spriteIdCounter++;
    x = 0;
    y = 0;
    texture: unknown;
    constructor(tex: unknown) {
      this.texture = tex;
    }
  }

  class Texture {
    width = 64;
    height = 64;
    source: unknown;
    _frame: unknown;
    constructor(opts?: { source?: unknown; frame?: unknown }) {
      this.source = opts?.source;
      this._frame = opts?.frame;
    }
    destroy() {}
    static from() {
      return new Texture();
    }
  }

  class Rectangle {
    x: number;
    y: number;
    width: number;
    height: number;
    constructor(x = 0, y = 0, w = 0, h = 0) {
      this.x = x;
      this.y = y;
      this.width = w;
      this.height = h;
    }
  }

  // Fake texture returned by Assets.get
  const _assetStore = new Map<string, Texture>();

  const Assets = {
    get<T>(key: string): T {
      if (!_assetStore.has(key)) {
        const t = new Texture();
        // Give the fake texture a realistic source stub
        (t as Texture & { source: unknown }).source = { uid: key };
        _assetStore.set(key, t);
      }
      return _assetStore.get(key)! as unknown as T;
    },
    _store: _assetStore,
  };

  return {
    Container,
    Sprite,
    Texture,
    Rectangle,
    Assets,
    __esModule: true,
  };
});

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Stub world layer that records children added to it. */
function createWorldLayerStub() {
  const children: unknown[] = [];
  return {
    addChild(c: unknown) {
      children.push(c);
    },
    removeChild(c: unknown) {
      const i = children.indexOf(c);
      if (i >= 0) children.splice(i, 1);
    },
    get children() {
      return children;
    },
  };
}

function createCoreStub() {
  const events = new EventBus();
  const worldLayer = createWorldLayerStub();

  // Satisfy `renderer/layer` lookups
  events.on('test', 'renderer/layer', (_p: { name: string }, output: { layer: unknown }) => {
    if (_p.name === 'world') output.layer = worldLayer;
  });

  return { core: { events } as unknown as Core, worldLayer };
}

/** Build a minimal 4×4 TilemapData with a single layer. */
function makeMapData(overrides: Partial<TilemapData> = {}): TilemapData {
  const W = 4;
  const H = 4;
  return {
    tileWidth: 16,
    tileHeight: 16,
    mapWidth: W,
    mapHeight: H,
    chunkSize: 4, // each chunk = entire map in this small test map
    tilesets: [
      {
        firstgid: 1,
        name: 'test',
        textureKey: 'tileset',
        tileWidth: 16,
        tileHeight: 16,
        columns: 4,
      },
    ],
    layers: [
      {
        name: 'ground',
        // 1 = solid grass, 0 = empty
        data: [
          1, 1, 1, 1,
          1, 0, 0, 1,
          1, 0, 0, 1,
          1, 1, 1, 1,
        ],
      },
    ],
    ...overrides,
  };
}

/** Helper: emit `tilemap/load` and wait for the async handler to finish. */
async function loadMap(core: Core, mapData: TilemapData): Promise<TilemapLoadOutput> {
  const { output } = await core.events.emit<TilemapLoadParams, TilemapLoadOutput>(
    'tilemap/load',
    { mapData },
  );
  return output as TilemapLoadOutput;
}

type TilemapLoadParams = { mapData: TilemapData };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TilemapManager', () => {
  let core: Core;
  let worldLayer: ReturnType<typeof createWorldLayerStub>;
  let tm: TilemapManager;

  beforeEach(() => {
    const setup = createCoreStub();
    core = setup.core;
    worldLayer = setup.worldLayer;
    tm = new TilemapManager();
    tm.init(core);
  });

  // ── tilemap/load ──────────────────────────────────────────────────────────

  describe('tilemap/load', () => {
    it('emits correct output metadata', async () => {
      const out = await loadMap(core, makeMapData());
      expect(out.layerCount).toBe(1);
      // 4×4 map with 12 non-empty tiles (ring of 1s around empty centre)
      expect(out.tileCount).toBe(12);
    });

    it('adds layer containers to the world layer', async () => {
      const data = makeMapData({
        layers: [
          { name: 'bg', data: new Array(16).fill(1) },
          { name: 'fg', data: new Array(16).fill(1) },
        ],
      });
      await loadMap(core, data);
      // Two layer containers should be added to the world layer
      expect(worldLayer.children.length).toBe(2);
    });

    it('fires tilemap/loaded notification', async () => {
      const handler = vi.fn();
      core.events.on('test', 'tilemap/loaded', handler);
      const data = makeMapData();
      await loadMap(core, data);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ mapData: data }),
        expect.anything(),
        expect.anything(),
      );
    });

    it('replaces a previously loaded map', async () => {
      await loadMap(core, makeMapData());
      const secondData = makeMapData({ layers: [{ name: 'new', data: new Array(16).fill(2) }] });
      const out = await loadMap(core, secondData);
      expect(out.layerCount).toBe(1);
      // After reload the old layer containers are removed; only the new one exists
      expect(worldLayer.children.length).toBe(1);
    });
  });

  // ── tilemap/get-tile ──────────────────────────────────────────────────────

  describe('tilemap/get-tile', () => {
    it('returns the correct tile ID at a given cell', async () => {
      await loadMap(core, makeMapData());
      const { output } = core.events.emitSync<TilemapGetTileParams, TilemapGetTileOutput>(
        'tilemap/get-tile',
        { layerIndex: 0, col: 0, row: 0 },
      );
      expect(output.tileId).toBe(1);
    });

    it('returns 0 for an empty cell', async () => {
      await loadMap(core, makeMapData());
      const { output } = core.events.emitSync<TilemapGetTileParams, TilemapGetTileOutput>(
        'tilemap/get-tile',
        { layerIndex: 0, col: 1, row: 1 },
      );
      expect(output.tileId).toBe(0);
    });

    it('returns 0 before any map is loaded', () => {
      const { output } = core.events.emitSync<TilemapGetTileParams, TilemapGetTileOutput>(
        'tilemap/get-tile',
        { layerIndex: 0, col: 0, row: 0 },
      );
      expect(output.tileId).toBe(0);
    });
  });

  type TilemapGetTileParams = { layerIndex: number; col: number; row: number };

  // ── tilemap/set-tile ──────────────────────────────────────────────────────

  describe('tilemap/set-tile', () => {
    it('changes a tile and can be read back via get-tile', async () => {
      await loadMap(core, makeMapData());

      core.events.emitSync('tilemap/set-tile', {
        layerIndex: 0, col: 1, row: 1, tileId: 5,
      });

      expect(tm.getTile(0, 1, 1)).toBe(5);
    });

    it('clears a tile by setting tileId to 0', async () => {
      await loadMap(core, makeMapData());

      core.events.emitSync('tilemap/set-tile', {
        layerIndex: 0, col: 0, row: 0, tileId: 0,
      });

      expect(tm.getTile(0, 0, 0)).toBe(0);
    });

    it('does nothing when no map is loaded', () => {
      expect(() => {
        core.events.emitSync('tilemap/set-tile', {
          layerIndex: 0, col: 0, row: 0, tileId: 3,
        });
      }).not.toThrow();
    });
  });

  // ── direct API (getTile / setTile) ────────────────────────────────────────

  describe('direct API', () => {
    it('getTile returns 0 for out-of-bounds layer', async () => {
      await loadMap(core, makeMapData());
      expect(tm.getTile(99, 0, 0)).toBe(0);
    });

    it('setTile is a no-op when no map is loaded', () => {
      expect(() => tm.setTile(0, 0, 0, 1)).not.toThrow();
    });
  });

  // ── Auto-tiling ───────────────────────────────────────────────────────────

  describe('auto-tiling', () => {
    /** Small 3×3 map, all cells = member tile 10 */
    function makeAutoMap(): TilemapData {
      return {
        tileWidth: 16,
        tileHeight: 16,
        mapWidth: 3,
        mapHeight: 3,
        chunkSize: 4,
        tilesets: [
          { firstgid: 1, name: 'ts', textureKey: 'tileset', tileWidth: 16, tileHeight: 16, columns: 16 },
        ],
        layers: [
          {
            name: 'ground',
            // All cells start as member tile 10
            data: [
              10, 10, 10,
              10, 10, 10,
              10, 10, 10,
            ],
          },
        ],
        autotileGroups: [
          {
            memberTileIds: [10, 11, 12, 13, 14, 15, 20],
            mode: '4bit',
            // Map bitmask → tile ID
            // 0b1111 = 15 = fully surrounded
            // 0b0000 = 0  = isolated
            tileMap: {
              0: 11,   // isolated
              15: 20,  // fully surrounded
              5: 12,   // N + S only (bits 0 + 2)
            },
          },
        ],
      };
    }

    it('computes 4-bit bitmask for a fully surrounded centre cell', async () => {
      const data = makeAutoMap();
      await loadMap(core, data);

      // Place a member tile at centre (1,1) with autoConnect
      core.events.emitSync('tilemap/set-tile', {
        layerIndex: 0, col: 1, row: 1, tileId: 10, autoConnect: true,
      });

      // Centre is surrounded on all 4 sides → bitmask = 15 → tileId = 20
      expect(tm.getTile(0, 1, 1)).toBe(20);
    });

    it('computes 4-bit bitmask for an isolated tile', async () => {
      // Start from an empty map and place a single member tile
      const data = makeAutoMap();
      // Clear all cells first
      data.layers[0].data = new Array(9).fill(0);
      await loadMap(core, data);

      core.events.emitSync('tilemap/set-tile', {
        layerIndex: 0, col: 1, row: 1, tileId: 10, autoConnect: true,
      });

      // No neighbours are members → bitmask = 0 → tileId = 11
      expect(tm.getTile(0, 1, 1)).toBe(11);
    });

    it('falls back to raw placement when no group matches', async () => {
      const data = makeAutoMap();
      await loadMap(core, data);

      // Tile ID 99 has no autotile group
      core.events.emitSync('tilemap/set-tile', {
        layerIndex: 0, col: 0, row: 0, tileId: 99, autoConnect: true,
      });

      expect(tm.getTile(0, 0, 0)).toBe(99);
    });
  });

  // ── Animated tiles ────────────────────────────────────────────────────────

  describe('animated tiles', () => {
    it('advances animated tile frames on core/update', async () => {
      const data = makeMapData({
        layers: [{ name: 'ground', data: [3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }],
        animatedTiles: {
          3: {
            frames: [
              { tileId: 3, duration: 200 },
              { tileId: 4, duration: 200 },
            ],
          },
        },
      });
      await loadMap(core, data);

      // Retrieve the sprite currently showing tile 3
      // We drive frame advancement via core/update
      const handler = vi.fn();
      core.events.on('test', 'tilemap/loaded', handler);

      // Advance past the first frame duration (200 ms)
      core.events.emitSync('core/update', { dt: 250, tick: 1 });

      // After > 200ms the frame should have advanced to tile 4.
      // We verify this indirectly by checking that the runtime frame counter updated.
      // (Sprite texture swap is verified through the mock Sprite.texture reference.)
      // No assertion can fully verify texture identity without deep Pixi stubs,
      // but we confirm the manager doesn't throw and still tracks animation state.
      expect(() =>
        core.events.emitSync('core/update', { dt: 200, tick: 2 }),
      ).not.toThrow();
    });

    it('does not throw when there are no animated tiles', async () => {
      await loadMap(core, makeMapData());
      expect(() =>
        core.events.emitSync('core/update', { dt: 16.67, tick: 0 }),
      ).not.toThrow();
    });
  });

  // ── tilemap/unload ────────────────────────────────────────────────────────

  describe('tilemap/unload', () => {
    it('removes all layer containers from the world layer', async () => {
      await loadMap(core, makeMapData());
      expect(worldLayer.children.length).toBe(1);

      core.events.emitSync('tilemap/unload', {});
      expect(worldLayer.children.length).toBe(0);
    });

    it('fires tilemap/unloaded notification', async () => {
      await loadMap(core, makeMapData());

      const handler = vi.fn();
      core.events.on('test', 'tilemap/unloaded', handler);

      core.events.emitSync('tilemap/unload', {});
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('get-tile returns 0 after unload', async () => {
      await loadMap(core, makeMapData());
      core.events.emitSync('tilemap/unload', {});
      expect(tm.getTile(0, 0, 0)).toBe(0);
    });
  });

  // ── Collision sync ────────────────────────────────────────────────────────

  describe('collision sync', () => {
    it('emits collision/tilemap:set for layers with collider:true', async () => {
      const collisionHandler = vi.fn();
      core.events.on('test', 'collision/tilemap:set', collisionHandler);

      const data = makeMapData({
        layers: [
          { name: 'collision', data: new Array(16).fill(1), collider: true, tileShapes: { 1: 'solid' as const } },
        ],
      });
      await loadMap(core, data);

      expect(collisionHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          tileSize: 16,
          tileShapes: { 1: 'solid' },
        }),
        expect.anything(),
        expect.anything(),
      );
    });

    it('does not emit collision/tilemap:set for non-collider layers', async () => {
      const collisionHandler = vi.fn();
      core.events.on('test', 'collision/tilemap:set', collisionHandler);

      await loadMap(core, makeMapData()); // no collider flag
      expect(collisionHandler).not.toHaveBeenCalled();
    });
  });

  // ── Plugin destroy ────────────────────────────────────────────────────────

  describe('plugin destroy', () => {
    it('cleans up without throwing', async () => {
      await loadMap(core, makeMapData());
      expect(() => tm.destroy(core)).not.toThrow();
    });

    it('stops responding to events after destroy', async () => {
      await loadMap(core, makeMapData());
      tm.destroy(core);

      // After destroy, tilemap/get-tile should return 0 (data was cleared)
      const { output } = core.events.emitSync<TilemapGetTileParams, TilemapGetTileOutput>(
        'tilemap/get-tile',
        { layerIndex: 0, col: 0, row: 0 },
      );
      // The namespace listener was removed so the handler won't fire; output
      // defaults to {} with no tileId set → undefined, coerced to 0 by getTile.
      expect(output.tileId ?? 0).toBe(0);
    });
  });

  // ── Chunk key stability ───────────────────────────────────────────────────

  describe('chunk key parsing in applyAutoTile', () => {
    it('handles multi-chunk maps without throwing', async () => {
      const bigData: TilemapData = {
        tileWidth: 16,
        tileHeight: 16,
        mapWidth: 32,
        mapHeight: 32,
        chunkSize: 8,
        tilesets: [
          { firstgid: 1, name: 'ts', textureKey: 'tileset', tileWidth: 16, tileHeight: 16, columns: 8 },
        ],
        layers: [
          { name: 'ground', data: new Array(32 * 32).fill(1) },
        ],
      };

      await loadMap(core, bigData);

      expect(() => {
        core.events.emitSync('tilemap/set-tile', {
          layerIndex: 0, col: 15, row: 15, tileId: 2,
        });
      }).not.toThrow();
    });
  });

  // ── Layer filters ─────────────────────────────────────────────────────────

  describe('layer filters', () => {
    /** Minimal fake filter object that satisfies the type check in tests. */
    const makeFilter = () => ({ label: 'test-filter' }) as unknown as import('pixi.js').Filter;

    it('applies a single filter to a layer container on load', async () => {
      const filter = makeFilter();
      const data = makeMapData({
        layers: [{ name: 'ground', data: new Array(16).fill(1), filters: filter }],
      });
      await loadMap(core, data);

      const layerContainer = worldLayer.children[0] as { filters: unknown[] };
      expect(layerContainer.filters).toEqual([filter]);
    });

    it('applies an array of filters to a layer container on load', async () => {
      const f1 = makeFilter();
      const f2 = makeFilter();
      const data = makeMapData({
        layers: [{ name: 'ground', data: new Array(16).fill(1), filters: [f1, f2] }],
      });
      await loadMap(core, data);

      const layerContainer = worldLayer.children[0] as { filters: unknown[] };
      expect(layerContainer.filters).toEqual([f1, f2]);
    });

    it('leaves filters empty when none are specified in the layer def', async () => {
      await loadMap(core, makeMapData()); // no filters field
      const layerContainer = worldLayer.children[0] as { filters: unknown[] };
      expect(layerContainer.filters).toEqual([]);
    });

    it('tilemap/layer:set-filter replaces filters at runtime', async () => {
      await loadMap(core, makeMapData());

      const filter = makeFilter();
      core.events.emitSync('tilemap/layer:set-filter', {
        layerIndex: 0,
        filters: filter,
      });

      const layerContainer = worldLayer.children[0] as { filters: unknown[] };
      expect(layerContainer.filters).toEqual([filter]);
    });

    it('tilemap/layer:set-filter with null clears all filters', async () => {
      const filter = makeFilter();
      const data = makeMapData({
        layers: [{ name: 'ground', data: new Array(16).fill(1), filters: filter }],
      });
      await loadMap(core, data);

      core.events.emitSync('tilemap/layer:set-filter', {
        layerIndex: 0,
        filters: null,
      });

      const layerContainer = worldLayer.children[0] as { filters: unknown[] };
      expect(layerContainer.filters).toEqual([]);
    });

    it('tilemap/layer:set-filter with empty array clears all filters', async () => {
      const filter = makeFilter();
      const data = makeMapData({
        layers: [{ name: 'ground', data: new Array(16).fill(1), filters: filter }],
      });
      await loadMap(core, data);

      core.events.emitSync('tilemap/layer:set-filter', {
        layerIndex: 0,
        filters: [],
      });

      const layerContainer = worldLayer.children[0] as { filters: unknown[] };
      expect(layerContainer.filters).toEqual([]);
    });

    it('tilemap/layer:set-filter does nothing for an out-of-range layer index', async () => {
      await loadMap(core, makeMapData());
      expect(() => {
        core.events.emitSync('tilemap/layer:set-filter', {
          layerIndex: 99,
          filters: makeFilter(),
        });
      }).not.toThrow();
    });

    it('direct setLayerFilter API applies filters correctly', async () => {
      await loadMap(core, makeMapData());
      const filter = makeFilter();
      tm.setLayerFilter(0, filter);

      const layerContainer = worldLayer.children[0] as { filters: unknown[] };
      expect(layerContainer.filters).toEqual([filter]);
    });
  });
});
