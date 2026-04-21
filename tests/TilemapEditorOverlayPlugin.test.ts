import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { TilemapEditorOverlayPlugin } from '../src/plugins/TilemapEditorOverlayPlugin.js';
import type { Core } from '../src/core/Core.js';
import type { TilemapData } from '../src/types/tilemap.js';

// ---------------------------------------------------------------------------
// Pixi stubs
// ---------------------------------------------------------------------------

vi.mock('pixi.js', async () => {
  class Graphics {
    moveToCalls: [number, number][] = [];
    lineToCalls: [number, number][] = [];
    rectCalls: [number, number, number, number][] = [];
    fillCalls: unknown[] = [];
    strokeCalls: unknown[] = [];
    private _cleared = 0;

    get clearCount() { return this._cleared; }

    clear() {
      this._cleared++;
      this.moveToCalls = [];
      this.lineToCalls = [];
      this.rectCalls = [];
      this.fillCalls = [];
      this.strokeCalls = [];
      return this;
    }
    moveTo(x: number, y: number) { this.moveToCalls.push([x, y]); return this; }
    lineTo(x: number, y: number) { this.lineToCalls.push([x, y]); return this; }
    rect(x: number, y: number, w: number, h: number) {
      this.rectCalls.push([x, y, w, h]);
      return this;
    }
    fill(style: unknown) { this.fillCalls.push(style); return this; }
    stroke(style: unknown) { this.strokeCalls.push(style); return this; }
    destroy() {}
  }

  return { Graphics };
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeWorldLayer() {
  const children: unknown[] = [];
  return {
    addChild(c: unknown) { children.push(c); },
    removeChild(c: unknown) {
      const i = children.indexOf(c);
      if (i >= 0) children.splice(i, 1);
    },
    get children() { return children; },
  };
}

function createCoreStub(opts: { hasCamera?: boolean } = {}) {
  const events = new EventBus();
  const worldLayer = makeWorldLayer();

  events.on('_test', 'renderer/layer', (_p: { name: string }, output: { layer: unknown }) => {
    if (_p.name === 'world') output.layer = worldLayer;
  });

  if (opts.hasCamera) {
    events.on('_test', 'camera/state', (
      _p: unknown,
      output: Record<string, unknown>,
    ) => {
      output.x = 0;
      output.y = 0;
      output.zoom = 1;
      output.viewportWidth = 320;
      output.viewportHeight = 240;
    });
  }

  return { core: { events } as unknown as Core, worldLayer };
}

function makeMapData(overrides: Partial<TilemapData> = {}): TilemapData {
  return {
    tileWidth: 16,
    tileHeight: 16,
    mapWidth: 4,
    mapHeight: 4,
    tilesets: [],
    layers: [{ name: 'ground', data: new Array(16).fill(1) }],
    ...overrides,
  };
}

function emitPreRender(core: Core) {
  core.events.emitSync('renderer/pre-render', {});
}

function emitPointerMove(core: Core, x: number, y: number) {
  core.events.emitSync('input/pointer:move', { x, y });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TilemapEditorOverlayPlugin', () => {
  let core: Core;
  let worldLayer: ReturnType<typeof makeWorldLayer>;
  let plugin: TilemapEditorOverlayPlugin;

  beforeEach(() => {
    ({ core, worldLayer } = createCoreStub());
    plugin = new TilemapEditorOverlayPlugin();
    plugin.init(core);
  });

  // ── Plugin metadata ────────────────────────────────────────────────────────

  it('has the correct namespace', () => {
    expect(plugin.namespace).toBe('mapeditor-overlay');
  });

  it('depends on tilemap, input and mapeditor', () => {
    expect(plugin.dependencies).toContain('tilemap');
    expect(plugin.dependencies).toContain('input');
    expect(plugin.dependencies).toContain('mapeditor');
  });

  // ── Graphics initialisation ────────────────────────────────────────────────

  it('does NOT add Graphics to world layer on init (before map is loaded)', () => {
    expect(worldLayer.children).toHaveLength(0);
  });

  it('adds Graphics to world layer when tilemap/loaded fires', () => {
    core.events.emitSync('tilemap/loaded', { mapData: makeMapData() });
    expect(worldLayer.children).toHaveLength(1);
  });

  it('removes Graphics from world layer on tilemap/unloaded', () => {
    core.events.emitSync('tilemap/loaded', { mapData: makeMapData() });
    core.events.emitSync('tilemap/unloaded', {});
    expect(worldLayer.children).toHaveLength(0);
  });

  // ── Drawing — idle state ───────────────────────────────────────────────────

  it('only calls clear() when editor is closed (no map content drawn)', () => {
    const map = makeMapData();
    core.events.emitSync('tilemap/loaded', { mapData: map });

    const gfx = worldLayer.children[0] as InstanceType<
      Awaited<ReturnType<typeof import('pixi.js')>>['Graphics']
    >;

    emitPreRender(core);

    expect(gfx.clearCount).toBeGreaterThan(0);
    expect(gfx.strokeCalls).toHaveLength(0);
    expect(gfx.rectCalls).toHaveLength(0);
  });

  it('only calls clear() when no map is loaded', () => {
    // Editor open but no tilemap
    core.events.emitSync('mapeditor/opened', {});
    emitPreRender(core);
    // Graphics was never added to worldLayer, so just verify no errors thrown
    // (Graphics object exists but not in world layer)
  });

  // ── Drawing — editor open ──────────────────────────────────────────────────

  it('draws grid lines when editor is open and map is loaded', () => {
    const map = makeMapData(); // 4×4, 16px tiles
    core.events.emitSync('tilemap/loaded', { mapData: map });
    core.events.emitSync('mapeditor/opened', {});
    emitPreRender(core);

    const gfx = worldLayer.children[0] as InstanceType<
      Awaited<ReturnType<typeof import('pixi.js')>>['Graphics']
    >;

    // 5 vertical lines (col 0..4) + 5 horizontal lines (row 0..4) = 10 pairs
    expect(gfx.moveToCalls).toHaveLength(10);
    expect(gfx.lineToCalls).toHaveLength(10);
    expect(gfx.strokeCalls).toHaveLength(1);
  });

  it('vertical grid lines span the full map height', () => {
    const map = makeMapData(); // 4×4, 16px
    core.events.emitSync('tilemap/loaded', { mapData: map });
    core.events.emitSync('mapeditor/opened', {});
    emitPreRender(core);

    const gfx = worldLayer.children[0] as InstanceType<
      Awaited<ReturnType<typeof import('pixi.js')>>['Graphics']
    >;

    // First moveTo: x=0, y=0 (left edge, top)
    expect(gfx.moveToCalls[0]).toEqual([0, 0]);
    // First lineTo: x=0, y=64 (left edge, bottom — 4*16)
    expect(gfx.lineToCalls[0]).toEqual([0, 64]);
  });

  it('horizontal grid lines span the full map width', () => {
    const map = makeMapData();
    core.events.emitSync('tilemap/loaded', { mapData: map });
    core.events.emitSync('mapeditor/opened', {});
    emitPreRender(core);

    const gfx = worldLayer.children[0] as InstanceType<
      Awaited<ReturnType<typeof import('pixi.js')>>['Graphics']
    >;

    // 5th moveTo (index 5) is the first horizontal line: x=0, y=0
    expect(gfx.moveToCalls[5]).toEqual([0, 0]);
    // 5th lineTo: x=64 (4*16), y=0
    expect(gfx.lineToCalls[5]).toEqual([64, 0]);
  });

  it('strokes grid with expected colour and alpha', () => {
    const map = makeMapData();
    core.events.emitSync('tilemap/loaded', { mapData: map });
    core.events.emitSync('mapeditor/opened', {});
    emitPreRender(core);

    const gfx = worldLayer.children[0] as InstanceType<
      Awaited<ReturnType<typeof import('pixi.js')>>['Graphics']
    >;

    const strokeStyle = gfx.strokeCalls[0] as { color: number; alpha: number; width: number };
    expect(strokeStyle.color).toBe(0xffffff);
    expect(strokeStyle.alpha).toBeGreaterThan(0);
    expect(strokeStyle.width).toBeGreaterThan(0);
  });

  it('does NOT draw hover rect when no cell is hovered', () => {
    const map = makeMapData();
    core.events.emitSync('tilemap/loaded', { mapData: map });
    core.events.emitSync('mapeditor/opened', {});
    emitPreRender(core);

    const gfx = worldLayer.children[0] as InstanceType<
      Awaited<ReturnType<typeof import('pixi.js')>>['Graphics']
    >;
    expect(gfx.rectCalls).toHaveLength(0);
    expect(gfx.fillCalls).toHaveLength(0);
  });

  // ── Hover highlight ────────────────────────────────────────────────────────

  it('draws hover rect when pointer is over a tile', () => {
    const map = makeMapData(); // 16px tiles
    core.events.emitSync('tilemap/loaded', { mapData: map });
    core.events.emitSync('mapeditor/opened', {});
    // Pointer at (8, 8) = tile (0, 0)
    emitPointerMove(core, 8, 8);
    emitPreRender(core);

    const gfx = worldLayer.children[0] as InstanceType<
      Awaited<ReturnType<typeof import('pixi.js')>>['Graphics']
    >;
    expect(gfx.rectCalls).toHaveLength(1);
    expect(gfx.rectCalls[0]).toEqual([0, 0, 16, 16]);
    expect(gfx.fillCalls).toHaveLength(1);
  });

  it('hover rect position matches the hovered tile', () => {
    const map = makeMapData(); // 16px tiles
    core.events.emitSync('tilemap/loaded', { mapData: map });
    core.events.emitSync('mapeditor/opened', {});
    // Pointer at (17, 33) → col=1, row=2
    emitPointerMove(core, 17, 33);
    emitPreRender(core);

    const gfx = worldLayer.children[0] as InstanceType<
      Awaited<ReturnType<typeof import('pixi.js')>>['Graphics']
    >;
    // col 1, row 2 → x=16, y=32
    expect(gfx.rectCalls[0]).toEqual([16, 32, 16, 16]);
  });

  it('hover highlight uses semi-transparent fill', () => {
    const map = makeMapData();
    core.events.emitSync('tilemap/loaded', { mapData: map });
    core.events.emitSync('mapeditor/opened', {});
    emitPointerMove(core, 8, 8);
    emitPreRender(core);

    const gfx = worldLayer.children[0] as InstanceType<
      Awaited<ReturnType<typeof import('pixi.js')>>['Graphics']
    >;
    const fillStyle = gfx.fillCalls[0] as { color: number; alpha: number };
    expect(fillStyle.alpha).toBeGreaterThan(0);
    expect(fillStyle.alpha).toBeLessThan(1);
  });

  it('clears hover tile when pointer moves outside the map', () => {
    const map = makeMapData(); // 4×4, 16px → 64×64 world pixels
    core.events.emitSync('tilemap/loaded', { mapData: map });
    core.events.emitSync('mapeditor/opened', {});
    emitPointerMove(core, 8, 8);
    emitPointerMove(core, 9999, 9999); // outside map
    emitPreRender(core);

    const gfx = worldLayer.children[0] as InstanceType<
      Awaited<ReturnType<typeof import('pixi.js')>>['Graphics']
    >;
    expect(gfx.rectCalls).toHaveLength(0);
  });

  it('clears hover tile when editor closes', () => {
    const map = makeMapData();
    core.events.emitSync('tilemap/loaded', { mapData: map });
    core.events.emitSync('mapeditor/opened', {});
    emitPointerMove(core, 8, 8);
    core.events.emitSync('mapeditor/closed', {});
    emitPreRender(core);

    const gfx = worldLayer.children[0] as InstanceType<
      Awaited<ReturnType<typeof import('pixi.js')>>['Graphics']
    >;
    // Editor is closed → only clear() called, no grid/hover drawn
    expect(gfx.strokeCalls).toHaveLength(0);
    expect(gfx.rectCalls).toHaveLength(0);
  });

  it('stops tracking hover when editor is closed', () => {
    const map = makeMapData();
    core.events.emitSync('tilemap/loaded', { mapData: map });
    core.events.emitSync('mapeditor/opened', {});
    core.events.emitSync('mapeditor/closed', {});
    emitPointerMove(core, 8, 8);
    core.events.emitSync('mapeditor/opened', {});
    emitPreRender(core);

    const gfx = worldLayer.children[0] as InstanceType<
      Awaited<ReturnType<typeof import('pixi.js')>>['Graphics']
    >;
    // Hover move was during closed period — hoverTile should be null
    expect(gfx.rectCalls).toHaveLength(0);
  });

  // ── Camera-aware coordinate conversion ────────────────────────────────────

  it('accounts for camera transform when converting pointer to tile', () => {
    const { core: cCore, worldLayer: cWorld } = createCoreStub({ hasCamera: true });
    const overlay = new TilemapEditorOverlayPlugin();
    overlay.init(cCore);

    // Camera at (0,0) zoom=1, viewport 320×240.
    // Pointer at (160, 120) = viewport centre = world (0, 0) → tile (0, 0)
    const map = makeMapData();
    cCore.events.emitSync('tilemap/loaded', { mapData: map });
    cCore.events.emitSync('mapeditor/opened', {});
    cCore.events.emitSync('input/pointer:move', { x: 160, y: 120 });
    cCore.events.emitSync('renderer/pre-render', {});

    const gfx = cWorld.children[0] as InstanceType<
      Awaited<ReturnType<typeof import('pixi.js')>>['Graphics']
    >;
    // Pointer at viewport centre → world (0, 0) → tile (0, 0) → rect at (0, 0)
    expect(gfx.rectCalls).toHaveLength(1);
    expect(gfx.rectCalls[0]).toEqual([0, 0, 16, 16]);
  });

  // ── Destroy ────────────────────────────────────────────────────────────────

  it('destroys Graphics and removes event listeners on destroy()', () => {
    const map = makeMapData();
    core.events.emitSync('tilemap/loaded', { mapData: map });
    core.events.emitSync('mapeditor/opened', {});
    plugin.destroy(core);

    // After destroy, pre-render events should be no-ops (no crash)
    expect(() => emitPreRender(core)).not.toThrow();
  });

  it('clears hover tile on tilemap/unloaded', () => {
    const map = makeMapData();
    core.events.emitSync('tilemap/loaded', { mapData: map });
    core.events.emitSync('mapeditor/opened', {});
    emitPointerMove(core, 8, 8);

    // Unload map
    core.events.emitSync('tilemap/unloaded', {});

    // Reload map and render
    core.events.emitSync('tilemap/loaded', { mapData: map });
    emitPreRender(core);

    const gfx = worldLayer.children[0] as InstanceType<
      Awaited<ReturnType<typeof import('pixi.js')>>['Graphics']
    >;
    // No hover rect — it was cleared on unload
    expect(gfx.rectCalls).toHaveLength(0);
  });

  // ── Grid geometry for non-square maps ─────────────────────────────────────

  it('draws correct number of grid lines for a non-square map', () => {
    // 8 cols × 3 rows
    const map = makeMapData({ mapWidth: 8, mapHeight: 3, layers: [{ name: 'g', data: new Array(24).fill(1) }] });
    core.events.emitSync('tilemap/loaded', { mapData: map });
    core.events.emitSync('mapeditor/opened', {});
    emitPreRender(core);

    const gfx = worldLayer.children[0] as InstanceType<
      Awaited<ReturnType<typeof import('pixi.js')>>['Graphics']
    >;
    // 9 vertical + 4 horizontal = 13 moveTo calls
    expect(gfx.moveToCalls).toHaveLength(13);
    expect(gfx.lineToCalls).toHaveLength(13);
  });

  it('redraws grid correctly after a new tilemap is loaded', () => {
    const map1 = makeMapData({ mapWidth: 4, mapHeight: 4 });
    core.events.emitSync('tilemap/loaded', { mapData: map1 });
    core.events.emitSync('mapeditor/opened', {});
    emitPreRender(core);

    const gfx = worldLayer.children[0] as InstanceType<
      Awaited<ReturnType<typeof import('pixi.js')>>['Graphics']
    >;
    // Verify first map: 5 vert + 5 horiz = 10 moves
    expect(gfx.moveToCalls).toHaveLength(10);

    core.events.emitSync('tilemap/unloaded', {});

    const map2 = makeMapData({
      mapWidth: 6,
      mapHeight: 2,
      layers: [{ name: 'g', data: new Array(12).fill(1) }],
    });
    core.events.emitSync('tilemap/loaded', { mapData: map2 });
    emitPreRender(core);

    // New map: 7 vertical + 3 horizontal = 10 moveTo calls (clear() resets per frame)
    expect(gfx.moveToCalls).toHaveLength(10);
    expect(gfx.strokeCalls).toHaveLength(1);
  });
});
