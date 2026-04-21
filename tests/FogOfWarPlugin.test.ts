import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { FogOfWarPlugin } from '../src/plugins/FogOfWarPlugin.js';
import type { Core } from '../src/core/Core.js';
import type {
  FogConfig,
  FogGetTileOutput,
  FogStateOutput,
  FogTileRevealedParams,
} from '../src/types/fog.js';

vi.mock('pixi.js', async () => {
  class Graphics {
    clear() { return this; }
    rect() { return this; }
    circle() { return this; }
    fill() { return this; }
    stroke() { return this; }
    destroy() {}
  }
  return { Graphics };
});

function createCoreStub() {
  const events = new EventBus();
  const fogLayer = { children: [] as unknown[], addChild: (c: unknown) => { (fogLayer.children as unknown[]).push(c); } };
  events.on('test', 'renderer/layer:create', (_p: { name: string; zIndex: number }, output: { layer: unknown }) => { output.layer = fogLayer; });
  return { core: { events } as unknown as Core, fogLayer };
}

function makeConfig(overrides: Partial<FogConfig> = {}): FogConfig {
  return { mapWidth: 10, mapHeight: 8, tileWidth: 16, tileHeight: 16, ...overrides };
}

describe('FogOfWarPlugin', () => {
  let core: Core;
  let plugin: FogOfWarPlugin;

  beforeEach(() => {
    ({ core } = createCoreStub());
    plugin = new FogOfWarPlugin();
    plugin.init(core);
  });

  describe('fog/init', () => {
    it('initialises the grid to all-unexplored', () => {
      core.events.emitSync('fog/init', { config: makeConfig() });
      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 10; col++) {
          const { output } = core.events.emitSync<object, FogGetTileOutput>('fog/get-tile', { col, row });
          expect(output.state).toBe('unexplored');
        }
      }
    });

    it('returns correct state from fog/state', () => {
      core.events.emitSync('fog/init', { config: makeConfig() });
      const { output } = core.events.emitSync<object, FogStateOutput>('fog/state', {});
      expect(output.total).toBe(80);
      expect(output.explored).toBe(0);
      expect(output.visible).toBe(0);
    });
  });

  describe('fog/update', () => {
    it('marks tiles within radius as visible', () => {
      core.events.emitSync('fog/init', { config: makeConfig() });
      core.events.emitSync('fog/update', { x: 32, y: 32, radius: 1 });
      const { output } = core.events.emitSync<object, FogGetTileOutput>('fog/get-tile', { col: 2, row: 2 });
      expect(output.state).toBe('visible');
    });

    it('emits fog/tile:revealed for first-time visible tiles', () => {
      core.events.emitSync('fog/init', { config: makeConfig() });
      const revealed: FogTileRevealedParams[] = [];
      core.events.on('t', 'fog/tile:revealed', (p: FogTileRevealedParams) => revealed.push(p));
      core.events.emitSync('fog/update', { x: 0, y: 0, radius: 1 });
      expect(revealed.length).toBeGreaterThan(0);
    });

    it('does not re-emit fog/tile:revealed for already-explored tiles', () => {
      core.events.emitSync('fog/init', { config: makeConfig() });
      core.events.emitSync('fog/update', { x: 0, y: 0, radius: 1 });
      const revealed: FogTileRevealedParams[] = [];
      core.events.on('t', 'fog/tile:revealed', (p: FogTileRevealedParams) => revealed.push(p));
      core.events.emitSync('fog/update', { x: 0, y: 0, radius: 1 });
      expect(revealed.length).toBe(0);
    });

    it('reverts previously visible tiles to explored on next update', () => {
      core.events.emitSync('fog/init', { config: makeConfig() });
      core.events.emitSync('fog/update', { x: 0, y: 0, radius: 1 });
      core.events.emitSync('fog/update', { x: 144, y: 112, radius: 1 });
      const { output } = core.events.emitSync<object, FogGetTileOutput>('fog/get-tile', { col: 0, row: 0 });
      expect(output.state).toBe('explored');
    });

    it('is a no-op before fog/init', () => {
      expect(() => core.events.emitSync('fog/update', { x: 0, y: 0, radius: 5 })).not.toThrow();
    });
  });

  describe('fog/reveal', () => {
    it('force-reveals a rectangular region', () => {
      core.events.emitSync('fog/init', { config: makeConfig() });
      core.events.emitSync('fog/reveal', { col: 0, row: 0, width: 3, height: 2, state: 'explored' });
      for (let r = 0; r < 2; r++) {
        for (let c = 0; c < 3; c++) {
          const { output } = core.events.emitSync<object, FogGetTileOutput>('fog/get-tile', { col: c, row: r });
          expect(output.state).toBe('explored');
        }
      }
      const { output } = core.events.emitSync<object, FogGetTileOutput>('fog/get-tile', { col: 3, row: 0 });
      expect(output.state).toBe('unexplored');
    });

    it('defaults state to explored', () => {
      core.events.emitSync('fog/init', { config: makeConfig() });
      core.events.emitSync('fog/reveal', { col: 0, row: 0, width: 1, height: 1 });
      const { output } = core.events.emitSync<object, FogGetTileOutput>('fog/get-tile', { col: 0, row: 0 });
      expect(output.state).toBe('explored');
    });

    it('emits fog/tile:revealed for newly revealed tiles', () => {
      core.events.emitSync('fog/init', { config: makeConfig() });
      const revealed: FogTileRevealedParams[] = [];
      core.events.on('t', 'fog/tile:revealed', (p: FogTileRevealedParams) => revealed.push(p));
      core.events.emitSync('fog/reveal', { col: 0, row: 0, width: 2, height: 2 });
      expect(revealed.length).toBe(4);
    });

    it('clips to map boundaries', () => {
      core.events.emitSync('fog/init', { config: makeConfig() });
      expect(() => core.events.emitSync('fog/reveal', { col: 8, row: 6, width: 10, height: 10 })).not.toThrow();
    });
  });

  describe('fog/clear', () => {
    it('resets the entire grid to unexplored', () => {
      core.events.emitSync('fog/init', { config: makeConfig() });
      core.events.emitSync('fog/update', { x: 0, y: 0, radius: 5 });
      core.events.emitSync('fog/clear', {});
      const { output } = core.events.emitSync<object, FogGetTileOutput>('fog/get-tile', { col: 0, row: 0 });
      expect(output.state).toBe('unexplored');
    });
  });

  describe('fog/get-tile', () => {
    it('returns unexplored for out-of-bounds coordinates', () => {
      core.events.emitSync('fog/init', { config: makeConfig() });
      const { output } = core.events.emitSync<object, FogGetTileOutput>('fog/get-tile', { col: -1, row: -1 });
      expect(output.state).toBe('unexplored');
    });

    it('returns unexplored before fog/init', () => {
      const { output } = core.events.emitSync<object, FogGetTileOutput>('fog/get-tile', { col: 0, row: 0 });
      expect(output.state).toBe('unexplored');
    });
  });

  describe('fog/state', () => {
    it('counts explored and visible tiles correctly', () => {
      core.events.emitSync('fog/init', { config: makeConfig() });
      core.events.emitSync('fog/reveal', { col: 0, row: 0, width: 2, height: 2, state: 'explored' });
      core.events.emitSync('fog/update', { x: 128, y: 96, radius: 1 });
      const { output } = core.events.emitSync<object, FogStateOutput>('fog/state', {});
      expect(output.explored).toBeGreaterThan(0);
      expect(output.visible).toBeGreaterThan(0);
      expect(output.explored + output.visible).toBeLessThanOrEqual(output.total);
    });

    it('returns zero stats before fog/init', () => {
      const { output } = core.events.emitSync<object, FogStateOutput>('fog/state', {});
      expect(output.total).toBe(0);
    });
  });

  describe('direct accessors', () => {
    it('getTileState returns unexplored before init', () => {
      expect(plugin.getTileState(0, 0)).toBe('unexplored');
    });

    it('getTileState returns correct state after update', () => {
      core.events.emitSync('fog/init', { config: makeConfig() });
      core.events.emitSync('fog/update', { x: 0, y: 0, radius: 0 });
      expect(plugin.getTileState(0, 0)).toBe('visible');
    });
  });

  describe('destroy', () => {
    it('removes event listeners', () => {
      core.events.emitSync('fog/init', { config: makeConfig() });
      plugin.destroy(core);
      const { output } = core.events.emitSync<object, Partial<FogStateOutput>>('fog/state', {});
      expect(output.total).toBeUndefined();
    });
  });
});
