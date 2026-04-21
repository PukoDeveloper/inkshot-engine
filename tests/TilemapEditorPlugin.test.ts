import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { TilemapManager } from '../src/plugins/TilemapManager.js';
import { TilemapEditorPlugin } from '../src/plugins/TilemapEditorPlugin.js';
import type { Core } from '../src/core/Core.js';
import type { TilemapData, TilemapLoadOutput } from '../src/types/tilemap.js';
import type {
  MapEditorStateOutput,
  MapEditorExportOutput,
} from '../src/types/mapeditor.js';

// ---------------------------------------------------------------------------
// Pixi stubs (reused from TilemapManager.test.ts pattern)
// ---------------------------------------------------------------------------

vi.mock('pixi.js', async () => {
  let _idCounter = 0;

  class Container {
    _id = _idCounter++;
    label = '';
    x = 0;
    y = 0;
    zIndex = 0;
    alpha = 1;
    visible = true;
    cullable = false;
    filters: unknown[] = [];
    children: unknown[] = [];

    addChild(child: unknown) { this.children.push(child); return child; }
    removeChild(child: unknown) {
      const i = this.children.indexOf(child);
      if (i >= 0) this.children.splice(i, 1);
    }
    destroy() {}
  }

  class Sprite {
    _id = _idCounter++;
    x = 0;
    y = 0;
    texture: unknown;
    constructor(tex: unknown) { this.texture = tex; }
  }

  class Texture {
    width = 64;
    height = 64;
    source: unknown;
    constructor(opts?: { source?: unknown; frame?: unknown }) {
      this.source = opts?.source;
    }
    destroy() {}
    static from() { return new Texture(); }
  }

  class Rectangle {
    constructor(
      public x = 0,
      public y = 0,
      public width = 0,
      public height = 0,
    ) {}
  }

  const _assetStore = new Map<string, Texture>();
  const Assets = {
    get<T>(key: string): T {
      if (!_assetStore.has(key)) {
        const t = new Texture();
        (t as Texture & { source: unknown }).source = { uid: key };
        _assetStore.set(key, t);
      }
      return _assetStore.get(key)! as unknown as T;
    },
  };

  return { Container, Sprite, Texture, Rectangle, Assets, __esModule: true };
});

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function createWorldLayerStub() {
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

/** Build a core stub wired with both TilemapManager and TilemapEditorPlugin. */
function createCoreStub() {
  const events = new EventBus();
  const worldLayer = createWorldLayerStub();

  events.on('_setup', 'renderer/layer', (_p: { name: string }, output: { layer: unknown }) => {
    if (_p.name === 'world') output.layer = worldLayer;
  });

  const core = { events } as unknown as Core;

  const tm = new TilemapManager();
  tm.init(core);

  const editor = new TilemapEditorPlugin();
  editor.init(core);

  return { core, tm, editor };
}

/** Minimal 4×4 map. */
function makeMapData(overrides: Partial<TilemapData> = {}): TilemapData {
  const W = 4;
  const H = 4;
  return {
    tileWidth: 16,
    tileHeight: 16,
    mapWidth: W,
    mapHeight: H,
    chunkSize: 4,
    tilesets: [{
      firstgid: 1,
      name: 'test',
      textureKey: 'tileset',
      tileWidth: 16,
      tileHeight: 16,
      columns: 4,
    }],
    layers: [{ name: 'ground', data: new Array(W * H).fill(1) }],
    ...overrides,
  };
}

async function loadMap(core: Core, mapData: TilemapData): Promise<TilemapLoadOutput> {
  const { output } = await core.events.emit<{ mapData: TilemapData }, TilemapLoadOutput>(
    'tilemap/load',
    { mapData },
  );
  return output as TilemapLoadOutput;
}

function getState(core: Core): MapEditorStateOutput {
  const { output } = core.events.emitSync<unknown, MapEditorStateOutput>(
    'mapeditor/state', {},
  );
  return output as MapEditorStateOutput;
}

function getTile(core: Core, layerIndex: number, col: number, row: number): number {
  const { output } = core.events.emitSync<
    { layerIndex: number; col: number; row: number },
    { tileId: number }
  >('tilemap/get-tile', { layerIndex, col, row });
  return output?.tileId ?? 0;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TilemapEditorPlugin', () => {
  let core: Core;

  beforeEach(() => {
    ({ core } = createCoreStub());
  });

  // ── open / close ──────────────────────────────────────────────────────────

  describe('open / close', () => {
    it('starts closed', () => {
      expect(getState(core).open).toBe(false);
    });

    it('opens via mapeditor/open event', () => {
      core.events.emitSync('mapeditor/open', {});
      expect(getState(core).open).toBe(true);
    });

    it('closes via mapeditor/close event', () => {
      core.events.emitSync('mapeditor/open', {});
      core.events.emitSync('mapeditor/close', {});
      expect(getState(core).open).toBe(false);
    });

    it('emits mapeditor/opened notification', () => {
      const handler = vi.fn();
      core.events.on('_test', 'mapeditor/opened', handler);
      core.events.emitSync('mapeditor/open', {});
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('emits mapeditor/closed notification', () => {
      core.events.emitSync('mapeditor/open', {});
      const handler = vi.fn();
      core.events.on('_test', 'mapeditor/closed', handler);
      core.events.emitSync('mapeditor/close', {});
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('does not emit opened if already open', () => {
      const handler = vi.fn();
      core.events.on('_test', 'mapeditor/opened', handler);
      core.events.emitSync('mapeditor/open', {});
      core.events.emitSync('mapeditor/open', {});
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('does not emit closed if already closed', () => {
      const handler = vi.fn();
      core.events.on('_test', 'mapeditor/closed', handler);
      core.events.emitSync('mapeditor/close', {});
      expect(handler).toHaveBeenCalledTimes(0);
    });
  });

  // ── tool selection ────────────────────────────────────────────────────────

  describe('tool selection', () => {
    it('defaults to paint tool', () => {
      expect(getState(core).tool).toBe('paint');
    });

    it('updates tool via mapeditor/tool:set', () => {
      core.events.emitSync('mapeditor/tool:set', { tool: 'erase' });
      expect(getState(core).tool).toBe('erase');
    });

    it('supports all tool values', () => {
      for (const tool of ['paint', 'erase', 'fill', 'rect-fill', 'rect-select'] as const) {
        core.events.emitSync('mapeditor/tool:set', { tool });
        expect(getState(core).tool).toBe(tool);
      }
    });
  });

  // ── tile / layer selection ────────────────────────────────────────────────

  describe('tile and layer selection', () => {
    it('defaults selectedTileId to 1', () => {
      expect(getState(core).selectedTileId).toBe(1);
    });

    it('updates selectedTileId via mapeditor/tile:select', () => {
      core.events.emitSync('mapeditor/tile:select', { tileId: 7 });
      expect(getState(core).selectedTileId).toBe(7);
    });

    it('updates activeLayerIndex via mapeditor/layer:select', () => {
      core.events.emitSync('mapeditor/layer:select', { layerIndex: 2 });
      expect(getState(core).activeLayerIndex).toBe(2);
    });
  });

  // ── paint tool ────────────────────────────────────────────────────────────

  describe('paint tool', () => {
    it('places the selected tile on pointer-down', async () => {
      await loadMap(core, makeMapData({ layers: [{ name: 'g', data: new Array(16).fill(0) }] }));
      core.events.emitSync('mapeditor/open', {});
      core.events.emitSync('mapeditor/tile:select', { tileId: 3 });

      // pointer at pixel (8, 8) → tile (0, 0) with tileWidth/Height=16
      core.events.emitSync('input/pointer:down', { x: 8, y: 8, button: 0 });
      core.events.emitSync('input/pointer:up', { x: 8, y: 8, button: 0 });

      expect(getTile(core, 0, 0, 0)).toBe(3);
    });

    it('paints along a drag path', async () => {
      await loadMap(core, makeMapData({ layers: [{ name: 'g', data: new Array(16).fill(0) }] }));
      core.events.emitSync('mapeditor/open', {});
      core.events.emitSync('mapeditor/tile:select', { tileId: 5 });

      core.events.emitSync('input/pointer:down', { x: 8, y: 8, button: 0 });
      core.events.emitSync('input/pointer:move', { x: 24, y: 8, dx: 16, dy: 0 });
      core.events.emitSync('input/pointer:move', { x: 40, y: 8, dx: 16, dy: 0 });
      core.events.emitSync('input/pointer:up', { x: 40, y: 8, button: 0 });

      // col 0, 1, 2 on row 0 should be painted
      expect(getTile(core, 0, 0, 0)).toBe(5);
      expect(getTile(core, 0, 1, 0)).toBe(5);
      expect(getTile(core, 0, 2, 0)).toBe(5);
    });

    it('does not paint when editor is closed', async () => {
      await loadMap(core, makeMapData({ layers: [{ name: 'g', data: new Array(16).fill(0) }] }));

      core.events.emitSync('input/pointer:down', { x: 8, y: 8, button: 0 });
      core.events.emitSync('input/pointer:up', { x: 8, y: 8, button: 0 });

      expect(getTile(core, 0, 0, 0)).toBe(0);
    });

    it('does not react to non-primary button', async () => {
      await loadMap(core, makeMapData({ layers: [{ name: 'g', data: new Array(16).fill(0) }] }));
      core.events.emitSync('mapeditor/open', {});
      core.events.emitSync('mapeditor/tile:select', { tileId: 3 });

      core.events.emitSync('input/pointer:down', { x: 8, y: 8, button: 2 });
      core.events.emitSync('input/pointer:up', { x: 8, y: 8, button: 2 });

      expect(getTile(core, 0, 0, 0)).toBe(0);
    });

    it('does not re-paint the same cell in the same stroke', async () => {
      const mapData = makeMapData({ layers: [{ name: 'g', data: new Array(16).fill(1) }] });
      await loadMap(core, mapData);
      core.events.emitSync('mapeditor/open', {});
      core.events.emitSync('mapeditor/tile:select', { tileId: 2 });

      const tilesChangedHandler = vi.fn();
      core.events.on('_test', 'mapeditor/tiles:changed', tilesChangedHandler);

      // Move over the same tile twice in one stroke
      core.events.emitSync('input/pointer:down', { x: 8, y: 8, button: 0 });
      core.events.emitSync('input/pointer:move', { x: 8, y: 8, dx: 0, dy: 0 });
      core.events.emitSync('input/pointer:up', { x: 8, y: 8, button: 0 });

      // Only one edit in the committed command
      expect(tilesChangedHandler).toHaveBeenCalledTimes(1);
      const edits = tilesChangedHandler.mock.calls[0][0].edits;
      expect(edits).toHaveLength(1);
    });
  });

  // ── erase tool ────────────────────────────────────────────────────────────

  describe('erase tool', () => {
    it('clears tiles to 0', async () => {
      await loadMap(core, makeMapData());
      core.events.emitSync('mapeditor/open', {});
      core.events.emitSync('mapeditor/tool:set', { tool: 'erase' });

      core.events.emitSync('input/pointer:down', { x: 8, y: 8, button: 0 });
      core.events.emitSync('input/pointer:up', { x: 8, y: 8, button: 0 });

      expect(getTile(core, 0, 0, 0)).toBe(0);
    });
  });

  // ── flood fill tool ───────────────────────────────────────────────────────

  describe('fill tool', () => {
    it('flood-fills a connected region', async () => {
      // 4×4 map: all cells = 1
      await loadMap(core, makeMapData());
      core.events.emitSync('mapeditor/open', {});
      core.events.emitSync('mapeditor/tool:set', { tool: 'fill' });
      core.events.emitSync('mapeditor/tile:select', { tileId: 9 });

      core.events.emitSync('input/pointer:down', { x: 8, y: 8, button: 0 });
      core.events.emitSync('input/pointer:up', { x: 8, y: 8, button: 0 });

      // All 16 cells should now be 9
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          expect(getTile(core, 0, c, r)).toBe(9);
        }
      }
    });

    it('does not fill if target tile equals fill tile', async () => {
      await loadMap(core, makeMapData());
      core.events.emitSync('mapeditor/open', {});
      core.events.emitSync('mapeditor/tool:set', { tool: 'fill' });
      core.events.emitSync('mapeditor/tile:select', { tileId: 1 }); // same as existing

      const handler = vi.fn();
      core.events.on('_test', 'mapeditor/tiles:changed', handler);

      core.events.emitSync('input/pointer:down', { x: 8, y: 8, button: 0 });
      core.events.emitSync('input/pointer:up', { x: 8, y: 8, button: 0 });

      expect(handler).not.toHaveBeenCalled();
    });

    it('only fills the contiguous region of matching tiles', async () => {
      // 4×4 map with two separate regions:
      // top two rows = tile 1, bottom two rows = tile 2
      const data = [
        1, 1, 1, 1,
        1, 1, 1, 1,
        2, 2, 2, 2,
        2, 2, 2, 2,
      ];
      await loadMap(core, makeMapData({ layers: [{ name: 'g', data }] }));
      core.events.emitSync('mapeditor/open', {});
      core.events.emitSync('mapeditor/tool:set', { tool: 'fill' });
      core.events.emitSync('mapeditor/tile:select', { tileId: 5 });

      // Fill from top-left (row=0) → should only affect top half
      core.events.emitSync('input/pointer:down', { x: 8, y: 8, button: 0 });
      core.events.emitSync('input/pointer:up', { x: 8, y: 8, button: 0 });

      for (let c = 0; c < 4; c++) {
        expect(getTile(core, 0, c, 0)).toBe(5);
        expect(getTile(core, 0, c, 1)).toBe(5);
        expect(getTile(core, 0, c, 2)).toBe(2); // untouched
        expect(getTile(core, 0, c, 3)).toBe(2); // untouched
      }
    });
  });

  // ── rect-fill tool ────────────────────────────────────────────────────────

  describe('rect-fill tool', () => {
    it('fills the dragged rectangle', async () => {
      await loadMap(core, makeMapData({ layers: [{ name: 'g', data: new Array(16).fill(0) }] }));
      core.events.emitSync('mapeditor/open', {});
      core.events.emitSync('mapeditor/tool:set', { tool: 'rect-fill' });
      core.events.emitSync('mapeditor/tile:select', { tileId: 4 });

      // drag from tile (0,0) to tile (1,1) → 2×2 rect
      core.events.emitSync('input/pointer:down', { x: 8, y: 8, button: 0 });
      core.events.emitSync('input/pointer:up', { x: 24, y: 24, button: 0 });

      expect(getTile(core, 0, 0, 0)).toBe(4);
      expect(getTile(core, 0, 1, 0)).toBe(4);
      expect(getTile(core, 0, 0, 1)).toBe(4);
      expect(getTile(core, 0, 1, 1)).toBe(4);
      // outside rect untouched
      expect(getTile(core, 0, 2, 0)).toBe(0);
      expect(getTile(core, 0, 0, 2)).toBe(0);
    });

    it('works with reversed drag direction (drag right-to-left)', async () => {
      await loadMap(core, makeMapData({ layers: [{ name: 'g', data: new Array(16).fill(0) }] }));
      core.events.emitSync('mapeditor/open', {});
      core.events.emitSync('mapeditor/tool:set', { tool: 'rect-fill' });
      core.events.emitSync('mapeditor/tile:select', { tileId: 7 });

      core.events.emitSync('input/pointer:down', { x: 24, y: 24, button: 0 });
      core.events.emitSync('input/pointer:up', { x: 8, y: 8, button: 0 });

      expect(getTile(core, 0, 0, 0)).toBe(7);
      expect(getTile(core, 0, 1, 1)).toBe(7);
    });
  });

  // ── rect-select / clipboard ───────────────────────────────────────────────

  describe('rect-select + clipboard', () => {
    it('copies a region and pastes it elsewhere', async () => {
      const data = [
        9, 9, 0, 0,
        9, 9, 0, 0,
        0, 0, 0, 0,
        0, 0, 0, 0,
      ];
      const { editor } = createCoreStub();
      const { core: c2 } = createCoreStub();

      // Need a fresh core for this test
      const events2 = new EventBus();
      const worldLayer2 = createWorldLayerStub();
      events2.on('_s', 'renderer/layer', (_p: { name: string }, o: { layer: unknown }) => {
        if (_p.name === 'world') o.layer = worldLayer2;
      });
      const core2 = { events: events2 } as unknown as Core;
      const tm2 = new TilemapManager();
      tm2.init(core2);
      const ed2 = new TilemapEditorPlugin();
      ed2.init(core2);

      await core2.events.emit<{ mapData: TilemapData }, TilemapLoadOutput>(
        'tilemap/load', { mapData: makeMapData({ layers: [{ name: 'g', data }] }) },
      );

      core2.events.emitSync('mapeditor/open', {});
      core2.events.emitSync('mapeditor/tool:set', { tool: 'rect-select' });

      // Select 2×2 region at top-left (tiles 0,0→1,1)
      core2.events.emitSync('input/pointer:down', { x: 8, y: 8, button: 0 });
      core2.events.emitSync('input/pointer:up', { x: 24, y: 24, button: 0 });

      // Paste at (2, 2)
      ed2.pasteAt(2, 2);

      expect(getTile(core2, 0, 2, 2)).toBe(9);
      expect(getTile(core2, 0, 3, 2)).toBe(9);
      expect(getTile(core2, 0, 2, 3)).toBe(9);
      expect(getTile(core2, 0, 3, 3)).toBe(9);

      void editor;
      void c2;
    });
  });

  // ── undo / redo ───────────────────────────────────────────────────────────

  describe('undo / redo', () => {
    it('canUndo is false before any edit', async () => {
      await loadMap(core, makeMapData());
      expect(getState(core).canUndo).toBe(false);
    });

    it('canUndo is true after a paint stroke', async () => {
      await loadMap(core, makeMapData({ layers: [{ name: 'g', data: new Array(16).fill(0) }] }));
      core.events.emitSync('mapeditor/open', {});
      core.events.emitSync('mapeditor/tile:select', { tileId: 3 });

      core.events.emitSync('input/pointer:down', { x: 8, y: 8, button: 0 });
      core.events.emitSync('input/pointer:up', { x: 8, y: 8, button: 0 });

      expect(getState(core).canUndo).toBe(true);
    });

    it('undo reverts the painted tile', async () => {
      await loadMap(core, makeMapData({ layers: [{ name: 'g', data: new Array(16).fill(0) }] }));
      core.events.emitSync('mapeditor/open', {});
      core.events.emitSync('mapeditor/tile:select', { tileId: 3 });

      core.events.emitSync('input/pointer:down', { x: 8, y: 8, button: 0 });
      core.events.emitSync('input/pointer:up', { x: 8, y: 8, button: 0 });

      expect(getTile(core, 0, 0, 0)).toBe(3);

      core.events.emitSync('mapeditor/undo', {});

      expect(getTile(core, 0, 0, 0)).toBe(0);
      expect(getState(core).canUndo).toBe(false);
    });

    it('redo re-applies the undone edit', async () => {
      await loadMap(core, makeMapData({ layers: [{ name: 'g', data: new Array(16).fill(0) }] }));
      core.events.emitSync('mapeditor/open', {});
      core.events.emitSync('mapeditor/tile:select', { tileId: 3 });

      core.events.emitSync('input/pointer:down', { x: 8, y: 8, button: 0 });
      core.events.emitSync('input/pointer:up', { x: 8, y: 8, button: 0 });

      core.events.emitSync('mapeditor/undo', {});
      expect(getTile(core, 0, 0, 0)).toBe(0);

      core.events.emitSync('mapeditor/redo', {});
      expect(getTile(core, 0, 0, 0)).toBe(3);
      expect(getState(core).canRedo).toBe(false);
    });

    it('redo stack is cleared after a new edit', async () => {
      await loadMap(core, makeMapData({ layers: [{ name: 'g', data: new Array(16).fill(0) }] }));
      core.events.emitSync('mapeditor/open', {});
      core.events.emitSync('mapeditor/tile:select', { tileId: 3 });

      core.events.emitSync('input/pointer:down', { x: 8, y: 8, button: 0 });
      core.events.emitSync('input/pointer:up', { x: 8, y: 8, button: 0 });

      core.events.emitSync('mapeditor/undo', {});
      expect(getState(core).canRedo).toBe(true);

      // New edit — should clear redo stack
      core.events.emitSync('mapeditor/tile:select', { tileId: 5 });
      core.events.emitSync('input/pointer:down', { x: 8, y: 8, button: 0 });
      core.events.emitSync('input/pointer:up', { x: 8, y: 8, button: 0 });

      expect(getState(core).canRedo).toBe(false);
    });

    it('undo reverts a rect-fill as a single command', async () => {
      await loadMap(core, makeMapData({ layers: [{ name: 'g', data: new Array(16).fill(0) }] }));
      core.events.emitSync('mapeditor/open', {});
      core.events.emitSync('mapeditor/tool:set', { tool: 'rect-fill' });
      core.events.emitSync('mapeditor/tile:select', { tileId: 4 });

      core.events.emitSync('input/pointer:down', { x: 8, y: 8, button: 0 });
      core.events.emitSync('input/pointer:up', { x: 24, y: 24, button: 0 });

      // 4 tiles should be filled
      expect(getTile(core, 0, 0, 0)).toBe(4);
      expect(getTile(core, 0, 1, 1)).toBe(4);

      core.events.emitSync('mapeditor/undo', {});

      // All 4 tiles reverted in one undo
      expect(getTile(core, 0, 0, 0)).toBe(0);
      expect(getTile(core, 0, 1, 1)).toBe(0);
      expect(getState(core).canUndo).toBe(false);
    });

    it('undo reverts a flood-fill as a single command', async () => {
      await loadMap(core, makeMapData());
      core.events.emitSync('mapeditor/open', {});
      core.events.emitSync('mapeditor/tool:set', { tool: 'fill' });
      core.events.emitSync('mapeditor/tile:select', { tileId: 9 });

      core.events.emitSync('input/pointer:down', { x: 8, y: 8, button: 0 });
      core.events.emitSync('input/pointer:up', { x: 8, y: 8, button: 0 });

      core.events.emitSync('mapeditor/undo', {});

      // All 16 cells should be back to 1
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          expect(getTile(core, 0, c, r)).toBe(1);
        }
      }
    });

    it('undo / redo emits mapeditor/tiles:changed', async () => {
      await loadMap(core, makeMapData({ layers: [{ name: 'g', data: new Array(16).fill(0) }] }));
      core.events.emitSync('mapeditor/open', {});
      core.events.emitSync('mapeditor/tile:select', { tileId: 3 });

      core.events.emitSync('input/pointer:down', { x: 8, y: 8, button: 0 });
      core.events.emitSync('input/pointer:up', { x: 8, y: 8, button: 0 });

      const handler = vi.fn();
      core.events.on('_test', 'mapeditor/tiles:changed', handler);

      core.events.emitSync('mapeditor/undo', {});
      expect(handler).toHaveBeenCalledTimes(1);

      core.events.emitSync('mapeditor/redo', {});
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('undo clears history when a new map is loaded', async () => {
      await loadMap(core, makeMapData({ layers: [{ name: 'g', data: new Array(16).fill(0) }] }));
      core.events.emitSync('mapeditor/open', {});
      core.events.emitSync('mapeditor/tile:select', { tileId: 3 });

      core.events.emitSync('input/pointer:down', { x: 8, y: 8, button: 0 });
      core.events.emitSync('input/pointer:up', { x: 8, y: 8, button: 0 });

      expect(getState(core).canUndo).toBe(true);

      // Load a new map — should clear undo/redo
      await loadMap(core, makeMapData());
      expect(getState(core).canUndo).toBe(false);
      expect(getState(core).canRedo).toBe(false);
    });
  });

  // ── export ────────────────────────────────────────────────────────────────

  describe('export', () => {
    it('returns a deep clone of the current map data', async () => {
      const mapData = makeMapData();
      await loadMap(core, mapData);

      const { output } = core.events.emitSync<unknown, MapEditorExportOutput>(
        'mapeditor/export', {},
      );

      expect(output.mapData).toBeDefined();
      expect(output.mapData.tileWidth).toBe(16);
      expect(output.mapData.layers[0]?.data).toHaveLength(16);

      // Verify it is a deep clone (modifying exported data does not affect live map)
      output.mapData.layers[0]!.data[0] = 999;
      expect(getTile(core, 0, 0, 0)).toBe(1); // original untouched
    });

    it('exported layer arrays are independent copies', async () => {
      await loadMap(core, makeMapData());
      const { output } = core.events.emitSync<unknown, MapEditorExportOutput>(
        'mapeditor/export', {},
      );
      const exportedData = output.mapData.layers[0]!.data;
      exportedData[0] = 42;
      expect(getTile(core, 0, 0, 0)).toBe(1);
    });
  });

  // ── out-of-bounds clicks ──────────────────────────────────────────────────

  describe('out-of-bounds pointer events', () => {
    it('ignores pointer-down outside map bounds', async () => {
      await loadMap(core, makeMapData());
      core.events.emitSync('mapeditor/open', {});
      core.events.emitSync('mapeditor/tile:select', { tileId: 7 });

      // Map is 4×4 tiles × 16px = 64×64 pixels; click at 100,100 is outside
      core.events.emitSync('input/pointer:down', { x: 100, y: 100, button: 0 });
      core.events.emitSync('input/pointer:up', { x: 100, y: 100, button: 0 });

      // No tile should be modified
      for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 4; c++) {
          expect(getTile(core, 0, c, r)).toBe(1);
        }
      }
    });
  });

  // ── direct API ────────────────────────────────────────────────────────────

  describe('direct API', () => {
    it('open() / close() work without events', async () => {
      const { editor } = createCoreStub();
      expect(editor['_open']).toBe(false);
      editor.open();
      expect(editor['_open']).toBe(true);
      editor.close();
      expect(editor['_open']).toBe(false);
    });

    it('setTool() works without events', () => {
      const { editor } = createCoreStub();
      editor.setTool('fill');
      expect(editor['_tool']).toBe('fill');
    });

    it('selectTile() works without events', () => {
      const { editor } = createCoreStub();
      editor.selectTile(12);
      expect(editor['_selectedTileId']).toBe(12);
    });

    it('exportMapData() returns null when no map loaded', () => {
      const { editor } = createCoreStub();
      expect(editor.exportMapData()).toBeNull();
    });
  });

  // ── destroy ───────────────────────────────────────────────────────────────

  describe('destroy', () => {
    it('removes all event listeners on destroy', async () => {
      const { core: c, editor } = createCoreStub();
      await loadMap(c, makeMapData());
      editor.destroy(c);

      // After destroy, open event should not be handled
      c.events.emitSync('mapeditor/open', {});
      const { output } = c.events.emitSync<unknown, MapEditorStateOutput>('mapeditor/state', {});
      // state listener also removed, output will have default (falsy) values
      expect((output as MapEditorStateOutput).open).toBeFalsy();
    });
  });
});
