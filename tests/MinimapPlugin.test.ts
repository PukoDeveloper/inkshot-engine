import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { MinimapPlugin } from '../src/plugins/MinimapPlugin.js';
import type { Core } from '../src/core/Core.js';
import type {
  MinimapConfig,
  MinimapConfigOutput,
  MinimapIconAddOutput,
  MinimapIconsOutput,
} from '../src/types/minimap.js';

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
  const uiLayer = { children: [] as unknown[], addChild(c: unknown) { this.children.push(c); } };
  events.on('test', 'renderer/layer', (_p: { name: string }, output: { layer: unknown }) => { if (_p.name === 'ui') output.layer = uiLayer; });
  return { core: { events } as unknown as Core, uiLayer };
}

function makeConfig(overrides: Partial<MinimapConfig> = {}): MinimapConfig {
  return { x: 10, y: 10, width: 200, height: 150, worldWidth: 3200, worldHeight: 2400, ...overrides };
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
});
