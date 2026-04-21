import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { MinimapPlugin } from '../src/plugins/MinimapPlugin.js';
import { FogOfWarPlugin } from '../src/plugins/FogOfWarPlugin.js';
import type { Core } from '../src/core/Core.js';
import type {
  MinimapConfig,
  MinimapConfigOutput,
  MinimapIconAddOutput,
  MinimapIconsOutput,
} from '../src/types/minimap.js';
import type { FogConfig } from '../src/types/fog.js';

vi.mock('pixi.js', async () => {
  class Graphics {
    readonly calls: string[] = [];
    clear() { return this; }
    rect() { this.calls.push('rect'); return this; }
    circle() { this.calls.push('circle'); return this; }
    fill() { return this; }
    stroke() { return this; }
    destroy() {}
  }
  return { Graphics };
});

function createCoreStub() {
  const events = new EventBus();
  const uiLayer = { children: [] as unknown[], addChild(c: unknown) { this.children.push(c); } };
  events.on('test', 'renderer/layer', (_p: { name: string }, output: { layer: unknown }) => { if (_p.name === 'ui') output.layer = uiLayer; });
  return { core: { events } as unknown as Core, uiLayer };
}

function createCoreStubWithFog() {
  const events = new EventBus();
  const uiLayer = { children: [] as unknown[], addChild(c: unknown) { this.children.push(c); } };
  const fogLayer = { children: [] as unknown[], addChild(c: unknown) { this.children.push(c); } };
  events.on('test', 'renderer/layer', (_p: { name: string }, output: { layer: unknown }) => { if (_p.name === 'ui') output.layer = uiLayer; });
  events.on('test', 'renderer/layer:create', (_p: { name: string; zIndex: number }, output: { layer: unknown }) => { output.layer = fogLayer; });
  return { core: { events } as unknown as Core, uiLayer, fogLayer };
}

function makeConfig(overrides: Partial<MinimapConfig> = {}): MinimapConfig {
  return { x: 10, y: 10, width: 200, height: 150, worldWidth: 3200, worldHeight: 2400, ...overrides };
}

function makeFogConfig(overrides: Partial<FogConfig> = {}): FogConfig {
  return { mapWidth: 10, mapHeight: 8, tileWidth: 16, tileHeight: 16, ...overrides };
}

describe('MinimapPlugin', () => {
  let core: Core;
  let plugin: MinimapPlugin;

  beforeEach(() => {
    ({ core } = createCoreStub());
    plugin = new MinimapPlugin();
    plugin.init(core);
  });

  describe('minimap/init', () => {
    it('sets the config', () => {
      core.events.emitSync('minimap/init', { config: makeConfig() });
      const { output } = core.events.emitSync<object, MinimapConfigOutput>('minimap/config', {});
      expect(output.config).not.toBeNull();
      expect(output.config!.worldWidth).toBe(3200);
    });

    it('config is null before init', () => {
      const { output } = core.events.emitSync<object, MinimapConfigOutput>('minimap/config', {});
      expect(output.config).toBeNull();
    });
  });

  describe('minimap/icon:add', () => {
    it('adds an icon and returns a generated id', () => {
      const { output } = core.events.emitSync<object, MinimapIconAddOutput>('minimap/icon:add', { x: 100, y: 200 });
      expect(output.id).toMatch(/^icon_\d+$/);
    });

    it('respects caller-supplied id', () => {
      const { output } = core.events.emitSync<object, MinimapIconAddOutput>('minimap/icon:add', { id: 'player', x: 0, y: 0, color: 0x00ff00, radius: 4 });
      expect(output.id).toBe('player');
    });

    it('defaults color to white and radius to 3', () => {
      const { output: addOut } = core.events.emitSync<object, MinimapIconAddOutput>('minimap/icon:add', { x: 0, y: 0 });
      const icon = plugin.getIcons().find((i) => i.id === addOut.id)!;
      expect(icon.color).toBe(0xffffff);
      expect(icon.radius).toBe(3);
    });
  });

  describe('minimap/icon:remove', () => {
    it('removes an existing icon', () => {
      core.events.emitSync('minimap/icon:add', { id: 'r', x: 0, y: 0 });
      core.events.emitSync('minimap/icon:remove', { id: 'r' });
      expect(plugin.getIcons().find((i) => i.id === 'r')).toBeUndefined();
    });

    it('is a no-op for unknown ids', () => {
      expect(() => core.events.emitSync('minimap/icon:remove', { id: 'ghost' })).not.toThrow();
    });
  });

  describe('minimap/icon:update', () => {
    it('updates icon fields', () => {
      core.events.emitSync('minimap/icon:add', { id: 'u', x: 0, y: 0 });
      core.events.emitSync('minimap/icon:update', { id: 'u', x: 500, y: 300, color: 0xff0000, radius: 6 });
      const icon = plugin.getIcons().find((i) => i.id === 'u')!;
      expect(icon.x).toBe(500);
      expect(icon.y).toBe(300);
      expect(icon.color).toBe(0xff0000);
      expect(icon.radius).toBe(6);
    });

    it('is a no-op for unknown ids', () => {
      expect(() => core.events.emitSync('minimap/icon:update', { id: 'ghost', x: 10 })).not.toThrow();
    });
  });

  describe('minimap/icons', () => {
    it('returns all icons', () => {
      core.events.emitSync('minimap/icon:add', { id: 'a', x: 0, y: 0 });
      core.events.emitSync('minimap/icon:add', { id: 'b', x: 10, y: 10 });
      const { output } = core.events.emitSync<object, MinimapIconsOutput>('minimap/icons', {});
      expect(output.icons).toHaveLength(2);
    });

    it('returns copies (not live references)', () => {
      core.events.emitSync('minimap/icon:add', { id: 'cp', x: 5, y: 5 });
      const { output } = core.events.emitSync<object, MinimapIconsOutput>('minimap/icons', {});
      output.icons[0]!.x = 9999;
      const icon = plugin.getIcons().find((i) => i.id === 'cp')!;
      expect(icon.x).toBe(5);
    });
  });

  describe('direct accessors', () => {
    it('getConfig returns null before init', () => {
      expect(plugin.getConfig()).toBeNull();
    });

    it('getConfig returns a copy after init', () => {
      core.events.emitSync('minimap/init', { config: makeConfig({ worldWidth: 1024 }) });
      const cfg = plugin.getConfig()!;
      expect(cfg.worldWidth).toBe(1024);
      cfg.worldWidth = 0;
      expect(plugin.getConfig()!.worldWidth).toBe(1024);
    });
  });

  describe('destroy', () => {
    it('removes icons and event listeners', () => {
      core.events.emitSync('minimap/icon:add', { id: 'del', x: 0, y: 0 });
      plugin.destroy(core);
      const { output } = core.events.emitSync<object, Partial<MinimapIconsOutput>>('minimap/icons', {});
      expect(output.icons).toBeUndefined();
    });
  });

  describe('fog-of-war integration', () => {
    let fogCore: Core;
    let fogPlugin: FogOfWarPlugin;
    let minimapPlugin: MinimapPlugin;

    beforeEach(() => {
      ({ core: fogCore } = createCoreStubWithFog());

      // Register FogOfWarPlugin first so its events are available.
      fogPlugin = new FogOfWarPlugin();
      fogPlugin.init(fogCore);

      minimapPlugin = new MinimapPlugin();
      minimapPlugin.init(fogCore);

      // Initialise the fog grid (10×8 tiles, 16 px each → world 160×128).
      fogCore.events.emitSync('fog/init', { config: makeFogConfig() });

      // Initialise the minimap covering the same world area.
      fogCore.events.emitSync('minimap/init', {
        config: makeConfig({ worldWidth: 160, worldHeight: 128 }),
      });
    });

    it('does not throw when FogOfWarPlugin is not registered', () => {
      // Fresh core without fog plugin — minimap should still render.
      const { core: plainCore } = createCoreStub();
      const plain = new MinimapPlugin();
      plain.init(plainCore);
      plainCore.events.emitSync('minimap/init', { config: makeConfig() });
      expect(() => plainCore.events.emitSync('renderer/pre-render', {})).not.toThrow();
    });

    it('hides icons whose tile is unexplored', () => {
      // Place an icon at world (8, 8) → tile (0, 0) which starts unexplored.
      fogCore.events.emitSync('minimap/icon:add', { id: 'hidden', x: 8, y: 8 });

      const circleCalls: string[] = [];
      // Intercept circle calls on the Graphics instance.
      const gfx = (minimapPlugin as unknown as { _gfx: { circle: () => { fill: () => void }; calls: string[] } })._gfx;
      const origCircle = gfx!.circle.bind(gfx);
      gfx!.circle = (...args: unknown[]) => {
        circleCalls.push('circle');
        return origCircle(...args as Parameters<typeof origCircle>);
      };

      fogCore.events.emitSync('renderer/pre-render', {});
      // No circle should have been drawn because the tile is unexplored.
      expect(circleCalls.length).toBe(0);
    });

    it('shows icons whose tile is explored', () => {
      // Reveal tile (0, 0) as explored.
      fogCore.events.emitSync('fog/reveal', { col: 0, row: 0, width: 1, height: 1, state: 'explored' });

      // Place an icon inside that tile.
      fogCore.events.emitSync('minimap/icon:add', { id: 'shown', x: 8, y: 8 });

      const circleCalls: string[] = [];
      const gfx = (minimapPlugin as unknown as { _gfx: { circle: () => { fill: () => void } } })._gfx;
      const origCircle = gfx!.circle.bind(gfx);
      gfx!.circle = (...args: unknown[]) => {
        circleCalls.push('circle');
        return origCircle(...args as Parameters<typeof origCircle>);
      };

      fogCore.events.emitSync('renderer/pre-render', {});
      expect(circleCalls.length).toBe(1);
    });

    it('shows icons whose tile is visible', () => {
      // fog/update at (8, 8) with radius 0 → tile (0, 0) becomes visible.
      fogCore.events.emitSync('fog/update', { x: 8, y: 8, radius: 0 });

      fogCore.events.emitSync('minimap/icon:add', { id: 'visible', x: 8, y: 8 });

      const circleCalls: string[] = [];
      const gfx = (minimapPlugin as unknown as { _gfx: { circle: () => { fill: () => void } } })._gfx;
      const origCircle = gfx!.circle.bind(gfx);
      gfx!.circle = (...args: unknown[]) => {
        circleCalls.push('circle');
        return origCircle(...args as Parameters<typeof origCircle>);
      };

      fogCore.events.emitSync('renderer/pre-render', {});
      expect(circleCalls.length).toBe(1);
    });

    it('draws fog tile overlay rects for explored and visible tiles', () => {
      // Reveal a 2×2 region and make one tile visible.
      fogCore.events.emitSync('fog/reveal', { col: 0, row: 0, width: 2, height: 2, state: 'explored' });
      fogCore.events.emitSync('fog/update', { x: 8, y: 8, radius: 0 });

      const rectCalls: string[] = [];
      const gfx = (minimapPlugin as unknown as { _gfx: { rect: () => { fill: () => void; stroke: () => void } } })._gfx;
      const origRect = gfx!.rect.bind(gfx);
      gfx!.rect = (...args: unknown[]) => {
        rectCalls.push('rect');
        return origRect(...args as Parameters<typeof origRect>);
      };

      fogCore.events.emitSync('renderer/pre-render', {});

      // At minimum: 1 background rect + ≥1 explored/visible tile rects.
      expect(rectCalls.length).toBeGreaterThan(1);
    });
  });
});
