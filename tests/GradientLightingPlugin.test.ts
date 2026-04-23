import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { GradientLightingPlugin } from '../src/plugins/world/GradientLightingPlugin.js';
import type { Core } from '../src/core/Core.js';
import type {
  GradientLightAddOutput,
  GradientLightGetOutput,
  GradientLightStateOutput,
} from '../src/types/gradient-lighting.js';

vi.mock('pixi.js', async () => {
  class Graphics {
    clear() { return this; }
    rect() { return this; }
    circle() { return this; }
    arc() { return this; }
    moveTo() { return this; }
    lineTo() { return this; }
    closePath() { return this; }
    fill() { return this; }
    stroke() { return this; }
    destroy() {}
  }
  return { Graphics, BlendMode: { MULTIPLY: 'multiply' } };
});

function createCoreStub() {
  const events = new EventBus();
  const lightLayer = {
    blendMode: '',
    children: [] as unknown[],
    addChild: (c: unknown) => { (lightLayer.children as unknown[]).push(c); },
  };
  events.on('test', 'renderer/layer:create', (
    _p: { name: string; zIndex: number },
    output: { layer: unknown },
  ) => { output.layer = lightLayer; });
  events.on('test', 'camera/state', (
    _p: Record<string, never>,
    output: Record<string, unknown>,
  ) => {
    output.x = 0; output.y = 0; output.zoom = 1;
    output.viewportWidth = 800; output.viewportHeight = 600;
  });
  return { core: { events } as unknown as Core, lightLayer };
}

describe('GradientLightingPlugin', () => {
  let core: Core;
  let plugin: GradientLightingPlugin;

  beforeEach(() => {
    ({ core } = createCoreStub());
    plugin = new GradientLightingPlugin({ ambientColor: 0x000000, ambientIntensity: 0.1 });
    plugin.init(core);
  });

  // ── gradient-lighting/light:add ──────────────────────────────────────────

  describe('gradient-lighting/light:add', () => {
    it('adds a point light and returns a generated id', () => {
      const { output } = core.events.emitSync<object, GradientLightAddOutput>(
        'gradient-lighting/light:add',
        { x: 100, y: 200, radius: 60, color: 0xffffff, intensity: 1 },
      );
      expect(output.id).toMatch(/^glight_\d+$/);
    });

    it('respects a caller-supplied id', () => {
      const { output } = core.events.emitSync<object, GradientLightAddOutput>(
        'gradient-lighting/light:add',
        { id: 'torch1', x: 0, y: 0, radius: 50, color: 0xff8800, intensity: 0.8 },
      );
      expect(output.id).toBe('torch1');
    });

    it('clamps intensity to [0, 1]', () => {
      core.events.emitSync('gradient-lighting/light:add', { id: 'l1', x: 0, y: 0, radius: 30, intensity: 2 });
      const { output } = core.events.emitSync<object, GradientLightGetOutput>(
        'gradient-lighting/light:get', { id: 'l1' },
      );
      expect(output.light!.intensity).toBe(1);
    });

    it('defaults color to white when omitted', () => {
      const { output: addOut } = core.events.emitSync<object, GradientLightAddOutput>(
        'gradient-lighting/light:add', { x: 0, y: 0, radius: 30 },
      );
      const { output } = core.events.emitSync<object, GradientLightGetOutput>(
        'gradient-lighting/light:get', { id: addOut.id },
      );
      expect(output.light!.color).toBe(0xffffff);
    });

    it('stores spotlight fields (angle + spread)', () => {
      core.events.emitSync('gradient-lighting/light:add', {
        id: 'spot1', x: 10, y: 10, radius: 80, intensity: 0.7,
        angle: Math.PI / 4, spread: Math.PI / 8,
      });
      const { output } = core.events.emitSync<object, GradientLightGetOutput>(
        'gradient-lighting/light:get', { id: 'spot1' },
      );
      expect(output.light!.angle).toBeCloseTo(Math.PI / 4);
      expect(output.light!.spread).toBeCloseTo(Math.PI / 8);
    });

    it('stores flicker fields', () => {
      core.events.emitSync('gradient-lighting/light:add', {
        id: 'candle', x: 0, y: 0, radius: 40, flicker: true, flickerAmount: 0.2,
      });
      const { output } = core.events.emitSync<object, GradientLightGetOutput>(
        'gradient-lighting/light:get', { id: 'candle' },
      );
      expect(output.light!.flicker).toBe(true);
      expect(output.light!.flickerAmount).toBeCloseTo(0.2);
    });
  });

  // ── gradient-lighting/light:remove ──────────────────────────────────────

  describe('gradient-lighting/light:remove', () => {
    it('removes an existing light', () => {
      const { output: addOut } = core.events.emitSync<object, GradientLightAddOutput>(
        'gradient-lighting/light:add', { x: 0, y: 0, radius: 30 },
      );
      core.events.emitSync('gradient-lighting/light:remove', { id: addOut.id });
      const { output } = core.events.emitSync<object, GradientLightGetOutput>(
        'gradient-lighting/light:get', { id: addOut.id },
      );
      expect(output.light).toBeNull();
    });

    it('is a no-op for unknown ids', () => {
      expect(() =>
        core.events.emitSync('gradient-lighting/light:remove', { id: 'ghost' }),
      ).not.toThrow();
    });
  });

  // ── gradient-lighting/light:update ──────────────────────────────────────

  describe('gradient-lighting/light:update', () => {
    it('updates individual fields', () => {
      core.events.emitSync('gradient-lighting/light:add', {
        id: 'u1', x: 0, y: 0, radius: 30, intensity: 0.5,
      });
      core.events.emitSync('gradient-lighting/light:update', {
        id: 'u1', x: 50, y: 60, radius: 100, color: 0x0000ff, intensity: 0.9,
        angle: 1.0, spread: 0.5, flicker: true, flickerAmount: 0.1,
      });
      const { output } = core.events.emitSync<object, GradientLightGetOutput>(
        'gradient-lighting/light:get', { id: 'u1' },
      );
      expect(output.light!.x).toBe(50);
      expect(output.light!.y).toBe(60);
      expect(output.light!.radius).toBe(100);
      expect(output.light!.color).toBe(0x0000ff);
      expect(output.light!.intensity).toBeCloseTo(0.9);
      expect(output.light!.angle).toBeCloseTo(1.0);
      expect(output.light!.spread).toBeCloseTo(0.5);
      expect(output.light!.flicker).toBe(true);
      expect(output.light!.flickerAmount).toBeCloseTo(0.1);
    });

    it('is a no-op for unknown ids', () => {
      expect(() =>
        core.events.emitSync('gradient-lighting/light:update', { id: 'ghost', x: 0 }),
      ).not.toThrow();
    });
  });

  // ── gradient-lighting/ambient:set ────────────────────────────────────────

  describe('gradient-lighting/ambient:set', () => {
    it('updates ambient color and intensity', () => {
      core.events.emitSync('gradient-lighting/ambient:set', { color: 0x112233, intensity: 0.4 });
      expect(plugin.getAmbient().color).toBe(0x112233);
      expect(plugin.getAmbient().intensity).toBeCloseTo(0.4);
    });

    it('clamps intensity to [0, 1]', () => {
      core.events.emitSync('gradient-lighting/ambient:set', { intensity: -5 });
      expect(plugin.getAmbient().intensity).toBe(0);
      core.events.emitSync('gradient-lighting/ambient:set', { intensity: 10 });
      expect(plugin.getAmbient().intensity).toBe(1);
    });
  });

  // ── gradient-lighting/state ──────────────────────────────────────────────

  describe('gradient-lighting/state', () => {
    it('returns all lights and ambient', () => {
      core.events.emitSync('gradient-lighting/light:add', { id: 'a', x: 1, y: 2, radius: 10 });
      core.events.emitSync('gradient-lighting/light:add', { id: 'b', x: 3, y: 4, radius: 20 });
      const { output } = core.events.emitSync<object, GradientLightStateOutput>(
        'gradient-lighting/state', {},
      );
      expect(output.lights).toHaveLength(2);
      expect(output.ambient).toBeDefined();
    });

    it('returns copies (not live references)', () => {
      core.events.emitSync('gradient-lighting/light:add', { id: 'c', x: 0, y: 0, radius: 10 });
      const { output } = core.events.emitSync<object, GradientLightStateOutput>(
        'gradient-lighting/state', {},
      );
      output.lights[0]!.x = 9999;
      const { output: getOut } = core.events.emitSync<object, GradientLightGetOutput>(
        'gradient-lighting/light:get', { id: 'c' },
      );
      expect(getOut.light!.x).toBe(0);
    });
  });

  // ── direct accessors ─────────────────────────────────────────────────────

  describe('direct accessors', () => {
    it('getLights returns a snapshot', () => {
      core.events.emitSync('gradient-lighting/light:add', { id: 'p1', x: 5, y: 5, radius: 20 });
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

  // ── quality / falloff options ─────────────────────────────────────────────

  describe('constructor options', () => {
    it('accepts quality: low', () => {
      const p = new GradientLightingPlugin({ quality: 'low' });
      expect(p).toBeInstanceOf(GradientLightingPlugin);
    });

    it('accepts quality: high', () => {
      const p = new GradientLightingPlugin({ quality: 'high' });
      expect(p).toBeInstanceOf(GradientLightingPlugin);
    });

    it('accepts falloff: linear', () => {
      const p = new GradientLightingPlugin({ falloff: 'linear' });
      expect(p).toBeInstanceOf(GradientLightingPlugin);
    });

    it('accepts falloff: cubic', () => {
      const p = new GradientLightingPlugin({ falloff: 'cubic' });
      expect(p).toBeInstanceOf(GradientLightingPlugin);
    });
  });

  // ── destroy ───────────────────────────────────────────────────────────────

  describe('destroy', () => {
    it('clears lights and removes listeners', () => {
      core.events.emitSync('gradient-lighting/light:add', { id: 'd1', x: 0, y: 0, radius: 10 });
      plugin.destroy(core);
      const { output } = core.events.emitSync<object, Partial<GradientLightStateOutput>>(
        'gradient-lighting/state', {},
      );
      expect(output.lights).toBeUndefined();
    });
  });

  // ── rendering smoke test ─────────────────────────────────────────────────

  describe('rendering', () => {
    it('renders without throwing for a point light', () => {
      core.events.emitSync('gradient-lighting/light:add', {
        id: 'r1', x: 100, y: 100, radius: 80, intensity: 0.8,
      });
      expect(() =>
        core.events.emitSync('renderer/pre-render', {}),
      ).not.toThrow();
    });

    it('renders without throwing for a spotlight', () => {
      core.events.emitSync('gradient-lighting/light:add', {
        id: 'r2', x: 200, y: 150, radius: 120, intensity: 0.7,
        angle: Math.PI / 3, spread: Math.PI / 8,
      });
      expect(() =>
        core.events.emitSync('renderer/pre-render', {}),
      ).not.toThrow();
    });

    it('renders without throwing for a flickering light', () => {
      core.events.emitSync('gradient-lighting/light:add', {
        id: 'r3', x: 50, y: 50, radius: 60, intensity: 0.9,
        flicker: true, flickerAmount: 0.15,
      });
      expect(() =>
        core.events.emitSync('renderer/pre-render', {}),
      ).not.toThrow();
    });
  });
});
