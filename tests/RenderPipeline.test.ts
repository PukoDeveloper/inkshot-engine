import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { RenderPipeline } from '../src/rendering/RenderPipeline.js';

// Minimal Core stub with just what RenderPipeline needs.
function createCoreStub() {
  const events = new EventBus();
  return {
    events,
    app: { stage: { sortableChildren: true } },
  } as unknown as import('../src/core/Core.js').Core;
}

describe('RenderPipeline', () => {
  let core: ReturnType<typeof createCoreStub>;
  let pipeline: RenderPipeline;

  beforeEach(() => {
    core = createCoreStub();
    pipeline = new RenderPipeline(core);
  });

  it('dispatches pre-render, animate, post-process in order on core/render', () => {
    const order: string[] = [];

    core.events.on('test', 'renderer/pre-render', () => order.push('pre-render'));
    core.events.on('test', 'renderer/animate', () => order.push('animate'));
    core.events.on('test', 'renderer/post-process', () => order.push('post-process'));

    core.events.emitSync('core/render', { alpha: 0.5, delta: 16 });

    expect(order).toEqual(['pre-render', 'animate', 'post-process']);
  });

  it('passes alpha and delta to each sub-phase', () => {
    const received: Array<{ alpha: number; delta: number }> = [];

    core.events.on('test', 'renderer/pre-render', (p: { alpha: number; delta: number }) => received.push({ ...p }));
    core.events.on('test', 'renderer/animate', (p: { alpha: number; delta: number }) => received.push({ ...p }));
    core.events.on('test', 'renderer/post-process', (p: { alpha: number; delta: number }) => received.push({ ...p }));

    core.events.emitSync('core/render', { alpha: 0.75, delta: 8 });

    for (const r of received) {
      expect(r.alpha).toBe(0.75);
      expect(r.delta).toBe(8);
    }
  });

  it('stops dispatching after destroy', () => {
    const handler = vi.fn();
    core.events.on('test', 'renderer/pre-render', handler);

    pipeline.destroy();
    core.events.emitSync('core/render', { alpha: 0, delta: 16 });

    // pre-render should not fire because pipeline no longer relays core/render
    expect(handler).not.toHaveBeenCalled();
  });
});
