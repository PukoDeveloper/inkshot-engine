import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { LightingPlugin } from '../src/plugins/world/LightingPlugin.js';
import type { Core } from '../src/core/Core.js';
import type {
  LightAddOutput,
  LightGetOutput,
  LightStateOutput,
} from '../src/types/lighting.js';

vi.mock('pixi.js', async () => {
  class Graphics {
    clear() { return this; }
    rect() { return this; }
    circle() { return this; }
    fill() { return this; }
    stroke() { return this; }
    destroy() {}
  }
  return { Graphics, BlendMode: { MULTIPLY: 'multiply' } };
});

function createCoreStub() {
  const events = new EventBus();
  const lightLayer = { blendMode: '', children: [] as unknown[], addChild: (c: unknown) => { (lightLayer.children as unknown[]).push(c); } };
  events.on('test', 'renderer/layer:create', (_p: { name: string; zIndex: number }, output: { layer: unknown }) => { output.layer = lightLayer; });
  events.on('test', 'camera/state', (_p: Record<string, never>, output: Record<string, unknown>) => { output.x = 0; output.y = 0; output.zoom = 1; output.viewportWidth = 800; output.viewportHeight = 600; });
  return { core: { events } as unknown as Core, lightLayer };
}

describe('LightingPlugin', () => {
  let core: Core;
  let plugin: LightingPlugin;

  beforeEach(() => {
    ({ core } = createCoreStub());
    plugin = new LightingPlugin({ ambientColor: 0x000000, ambientIntensity: 0.1 });
    plugin.init(core);
  });

  describe('lighting/light:add', () => {
    it('adds a point light and returns a generated id', () => {
      const { output } = core.events.emitSync<object, LightAddOutput>('lighting/light:add', { x: 100, y: 200, radius: 60, color: 0xffffff, intensity: 1 });
      expect(output.id).toMatch(/^light_\d+$/);
    });

    it('respects a caller-supplied id', () => {
      const { output } = core.events.emitSync<object, LightAddOutput>('lighting/light:add', { id: 'torch1', x: 0, y: 0, radius: 50, color: 0xff8800, intensity: 0.8 });
      expect(output.id).toBe('torch1');
    });

    it('clamps intensity to [0, 1]', () => {
      core.events.emitSync('lighting/light:add', { id: 'l1', x: 0, y: 0, radius: 30, intensity: 2 });
      const { output } = core.events.emitSync<object, LightGetOutput>('lighting/light:get', { id: 'l1' });
      expect(output.light!.intensity).toBe(1);
    });

    it('defaults color to white when omitted', () => {
      const { output: addOut } = core.events.emitSync<object, LightAddOutput>('lighting/light:add', { x: 0, y: 0, radius: 30 });
      const { output } = core.events.emitSync<object, LightGetOutput>('lighting/light:get', { id: addOut.id });
      expect(output.light!.color).toBe(0xffffff);
    });
  });

  describe('lighting/light:remove', () => {
    it('removes an existing light', () => {
      const { output: addOut } = core.events.emitSync<object, LightAddOutput>('lighting/light:add', { x: 0, y: 0, radius: 30 });
      core.events.emitSync('lighting/light:remove', { id: addOut.id });
      const { output } = core.events.emitSync<object, LightGetOutput>('lighting/light:get', { id: addOut.id });
      expect(output.light).toBeNull();
    });

    it('is a no-op for unknown ids', () => {
      expect(() => core.events.emitSync('lighting/light:remove', { id: 'ghost' })).not.toThrow();
    });
  });

  describe('lighting/light:update', () => {
    it('updates individual fields', () => {
      core.events.emitSync('lighting/light:add', { id: 'u1', x: 0, y: 0, radius: 30, intensity: 0.5 });
      core.events.emitSync('lighting/light:update', { id: 'u1', x: 50, y: 60, radius: 100, color: 0x0000ff, intensity: 0.9 });
      const { output } = core.events.emitSync<object, LightGetOutput>('lighting/light:get', { id: 'u1' });
      expect(output.light!.x).toBe(50);
      expect(output.light!.y).toBe(60);
      expect(output.light!.radius).toBe(100);
      expect(output.light!.color).toBe(0x0000ff);
      expect(output.light!.intensity).toBeCloseTo(0.9);
    });

    it('is a no-op for unknown ids', () => {
      expect(() => core.events.emitSync('lighting/light:update', { id: 'ghost', x: 0 })).not.toThrow();
    });
  });

  describe('lighting/ambient:set', () => {
    it('updates ambient color and intensity', () => {
      core.events.emitSync('lighting/ambient:set', { color: 0x112233, intensity: 0.4 });
      expect(plugin.getAmbient().color).toBe(0x112233);
      expect(plugin.getAmbient().intensity).toBeCloseTo(0.4);
    });

    it('clamps intensity to [0, 1]', () => {
      core.events.emitSync('lighting/ambient:set', { intensity: -5 });
      expect(plugin.getAmbient().intensity).toBe(0);
      core.events.emitSync('lighting/ambient:set', { intensity: 10 });
      expect(plugin.getAmbient().intensity).toBe(1);
    });
  });

  describe('lighting/state', () => {
    it('returns all lights and ambient', () => {
      core.events.emitSync('lighting/light:add', { id: 'a', x: 1, y: 2, radius: 10 });
      core.events.emitSync('lighting/light:add', { id: 'b', x: 3, y: 4, radius: 20 });
      const { output } = core.events.emitSync<object, LightStateOutput>('lighting/state', {});
      expect(output.lights).toHaveLength(2);
      expect(output.ambient).toBeDefined();
    });

    it('returns copies (not live references)', () => {
      core.events.emitSync('lighting/light:add', { id: 'c', x: 0, y: 0, radius: 10 });
      const { output } = core.events.emitSync<object, LightStateOutput>('lighting/state', {});
      output.lights[0]!.x = 9999;
      const { output: getOut } = core.events.emitSync<object, LightGetOutput>('lighting/light:get', { id: 'c' });
      expect(getOut.light!.x).toBe(0);
    });
  });

  describe('direct accessors', () => {
    it('getLights returns a snapshot', () => {
      core.events.emitSync('lighting/light:add', { id: 'p1', x: 5, y: 5, radius: 20 });
      const lights = plugin.getLights();
      expect(lights).toHaveLength(1);
      expect(lights[0]!.id).toBe('p1');
    });

    it('getAmbient returns a copy of ambient state', () => {
      const a1 = plugin.getAmbient();
      const a2 = plugin.getAmbient();
      expect(a1).not.toBe(a2);
      expect(a1.intensity).toBe(a2.intensity);
    });
  });

  describe('destroy', () => {
    it('clears lights and removes listeners', () => {
      core.events.emitSync('lighting/light:add', { id: 'd1', x: 0, y: 0, radius: 10 });
      plugin.destroy(core);
      const { output } = core.events.emitSync<object, Partial<LightStateOutput>>('lighting/state', {});
      expect(output.lights).toBeUndefined();
    });
  });
});
