import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { ParallaxPlugin } from '../src/plugins/ParallaxPlugin.js';
import type { Core } from '../src/core/Core.js';
import type {
  ParallaxLayerAddOutput,
  ParallaxLayerGetOutput,
  ParallaxLayersOutput,
} from '../src/types/parallax.js';

vi.mock('pixi.js', async () => {
  class Container {
    x = 0; y = 0; label = ''; zIndex = 0; children: unknown[] = [];
    addChild(c: unknown) { this.children.push(c); return c; }
    removeChild(c: unknown) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); }
    destroy() {}
  }
  return { Container };
});

interface ContainerStub { x: number; y: number; children: ContainerStub[]; addChild(c: unknown): void; removeChild(c: unknown): void; }

function createParentLayerStub(): ContainerStub {
  const children: ContainerStub[] = [];
  return { x: 0, y: 0, children, addChild(c) { children.push(c as ContainerStub); }, removeChild(c) { const i = children.indexOf(c as ContainerStub); if (i >= 0) children.splice(i, 1); } };
}

function createCoreStub(cameraX = 0, cameraY = 0) {
  const events = new EventBus();
  const parentLayer = createParentLayerStub();
  events.on('test', 'renderer/layer', (_p: { name: string }, output: { layer: unknown }) => { output.layer = parentLayer; });
  events.on('test', 'camera/state', (_p: Record<string, never>, output: Record<string, unknown>) => { output.x = cameraX; output.y = cameraY; output.zoom = 1; output.viewportWidth = 800; output.viewportHeight = 600; });
  return { core: { events } as unknown as Core, parentLayer };
}

describe('ParallaxPlugin', () => {
  let core: Core;
  let parentLayer: ContainerStub;
  let plugin: ParallaxPlugin;

  beforeEach(() => {
    ({ core, parentLayer } = createCoreStub());
    plugin = new ParallaxPlugin();
    plugin.init(core);
  });

  describe('parallax/layer:add', () => {
    it('adds a layer and returns a generated id', () => {
      const { output } = core.events.emitSync<object, ParallaxLayerAddOutput>('parallax/layer:add', {});
      expect(output.id).toMatch(/^parallax_\d+$/);
    });

    it('respects caller-supplied id', () => {
      const { output } = core.events.emitSync<object, ParallaxLayerAddOutput>('parallax/layer:add', { id: 'sky', factorX: 0.2 });
      expect(output.id).toBe('sky');
    });

    it('uses factorX as factorY when factorY is omitted', () => {
      core.events.emitSync('parallax/layer:add', { id: 'sym', factorX: 0.3 });
      const { output } = core.events.emitSync<object, ParallaxLayerGetOutput>('parallax/layer:get', { id: 'sym' });
      expect(output.layer!.factorY).toBe(0.3);
    });

    it('adds the container to the parent layer', () => {
      core.events.emitSync('parallax/layer:add', { id: 'bg' });
      expect(parentLayer.children).toHaveLength(1);
    });
  });

  describe('parallax/layer:remove', () => {
    it('removes an existing layer', () => {
      core.events.emitSync('parallax/layer:add', { id: 'r1' });
      core.events.emitSync('parallax/layer:remove', { id: 'r1' });
      const { output } = core.events.emitSync<object, ParallaxLayerGetOutput>('parallax/layer:get', { id: 'r1' });
      expect(output.layer).toBeNull();
    });

    it('is a no-op for unknown ids', () => {
      expect(() => core.events.emitSync('parallax/layer:remove', { id: 'ghost' })).not.toThrow();
    });
  });

  describe('parallax/layer:update', () => {
    it('updates layer properties', () => {
      core.events.emitSync('parallax/layer:add', { id: 'u1', factorX: 0.5 });
      core.events.emitSync('parallax/layer:update', { id: 'u1', factorX: 0.8, factorY: 0.6, originX: 10, originY: 20 });
      const { output } = core.events.emitSync<object, ParallaxLayerGetOutput>('parallax/layer:get', { id: 'u1' });
      expect(output.layer!.factorX).toBe(0.8);
      expect(output.layer!.factorY).toBe(0.6);
      expect(output.layer!.originX).toBe(10);
      expect(output.layer!.originY).toBe(20);
    });
  });

  describe('parallax/layers', () => {
    it('returns all layer definitions', () => {
      core.events.emitSync('parallax/layer:add', { id: 'a', factorX: 0.2 });
      core.events.emitSync('parallax/layer:add', { id: 'b', factorX: 0.5 });
      const { output } = core.events.emitSync<object, ParallaxLayersOutput>('parallax/layers', {});
      expect(output.layers).toHaveLength(2);
      expect(output.layers.map((l) => l.id)).toContain('a');
      expect(output.layers.map((l) => l.id)).toContain('b');
    });
  });

  describe('offset calculation on pre-render', () => {
    it('offsets layer X by -cameraX * factorX', () => {
      const camX = 200;
      const { core: c2, parentLayer: pl2 } = createCoreStub(camX, 0);
      const p2 = new ParallaxPlugin();
      p2.init(c2);
      c2.events.emitSync('parallax/layer:add', { id: 'pl', factorX: 0.5, factorY: 0, originX: 0, originY: 0 });
      c2.events.emitSync('renderer/pre-render', { alpha: 0, delta: 0 });
      const container = pl2.children[0]!;
      expect(container.x).toBe(-camX * 0.5);
    });

    it('uses originX as base offset', () => {
      const { core: c3, parentLayer: pl3 } = createCoreStub(100, 0);
      const p3 = new ParallaxPlugin();
      p3.init(c3);
      c3.events.emitSync('parallax/layer:add', { id: 'origin', factorX: 0.5, factorY: 0, originX: 50, originY: 0 });
      c3.events.emitSync('renderer/pre-render', { alpha: 0, delta: 0 });
      const container = pl3.children[0]!;
      expect(container.x).toBe(0);
    });
  });

  describe('direct accessors', () => {
    it('getContainer returns the layer container', () => {
      core.events.emitSync('parallax/layer:add', { id: 'gc' });
      expect(plugin.getContainer('gc')).not.toBeNull();
    });

    it('getLayers returns a snapshot', () => {
      core.events.emitSync('parallax/layer:add', { id: 'snap', factorX: 0.4 });
      const layers = plugin.getLayers();
      expect(layers).toHaveLength(1);
      expect(layers[0]!.id).toBe('snap');
    });
  });

  describe('destroy', () => {
    it('removes all layers and event listeners', () => {
      core.events.emitSync('parallax/layer:add', { id: 'del1' });
      plugin.destroy(core);
      const { output } = core.events.emitSync<object, Partial<ParallaxLayersOutput>>('parallax/layers', {});
      expect(output.layers).toBeUndefined();
    });
  });
});
