import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { PostFxPipeline } from '../src/rendering/PostFxPipeline.js';
import { ShaderPass } from '../src/rendering/ShaderPass.js';

// Minimal stubs
function createStageStub() {
  return { filters: [] as unknown[], label: 'stage' };
}

function createCoreStub(stage: ReturnType<typeof createStageStub>) {
  const events = new EventBus();
  return {
    events,
    app: { stage },
  } as unknown as import('../src/core/Core.js').Core;
}

function createFilterStub(name = 'stub') {
  return { type: 'filter', name } as unknown as import('pixi.js').Filter;
}

describe('PostFxPipeline', () => {
  let stage: ReturnType<typeof createStageStub>;
  let core: ReturnType<typeof createCoreStub>;
  let postFx: PostFxPipeline;

  beforeEach(() => {
    stage = createStageStub();
    core = createCoreStub(stage);
    postFx = new PostFxPipeline(core);
  });

  // -------------------------------------------------------------------------
  // addPass / removePass
  // -------------------------------------------------------------------------

  it('adds a pass to the screen (stage) by default', () => {
    const pass = new ShaderPass({ name: 'blur', order: 0, filter: createFilterStub() });
    postFx.addPass(pass);

    expect(stage.filters).toHaveLength(1);
    expect(postFx.getPass('blur')).toBe(pass);
  });

  it('throws on duplicate pass name for the same target', () => {
    postFx.addPass(new ShaderPass({ name: 'a', order: 0, filter: createFilterStub() }));
    expect(() =>
      postFx.addPass(new ShaderPass({ name: 'a', order: 1, filter: createFilterStub() })),
    ).toThrow(/already exists/);
  });

  it('removes a pass', () => {
    postFx.addPass(new ShaderPass({ name: 'x', order: 0, filter: createFilterStub() }));
    postFx.removePass('x');
    expect(stage.filters).toHaveLength(0);
    expect(postFx.getPass('x')).toBeUndefined();
  });

  it('sorts passes by order', () => {
    const fA = createFilterStub('a');
    const fB = createFilterStub('b');
    const fC = createFilterStub('c');

    postFx.addPass(new ShaderPass({ name: 'c', order: 30, filter: fC }));
    postFx.addPass(new ShaderPass({ name: 'a', order: 10, filter: fA }));
    postFx.addPass(new ShaderPass({ name: 'b', order: 20, filter: fB }));

    expect(stage.filters).toEqual([fA, fB, fC]);
  });

  // -------------------------------------------------------------------------
  // togglePass
  // -------------------------------------------------------------------------

  it('disables a pass so its filter is not applied', () => {
    postFx.addPass(new ShaderPass({ name: 't', order: 0, filter: createFilterStub() }));
    postFx.togglePass('t', false);
    expect(stage.filters).toHaveLength(0);
  });

  it('re-enables a pass', () => {
    const pass = new ShaderPass({ name: 't', order: 0, filter: createFilterStub() });
    postFx.addPass(pass);
    postFx.togglePass('t', false);
    postFx.togglePass('t', true);
    expect(stage.filters).toHaveLength(1);
  });

  // -------------------------------------------------------------------------
  // Per-layer targeting via EventBus layer lookup
  // -------------------------------------------------------------------------

  it('adds a pass to a named layer via EventBus layer lookup', () => {
    const layerContainer = { filters: [] as unknown[] };

    // Register a fake layer handler so PostFx can resolve "world".
    core.events.on('test', 'renderer/layer', (_p: { name: string }, output: { layer: unknown }) => {
      if (_p.name === 'world') output.layer = layerContainer;
    });

    const pass = new ShaderPass({ name: 'crt', order: 0, filter: createFilterStub() });
    postFx.addPass(pass, 'world');

    expect(layerContainer.filters).toHaveLength(1);
    expect(stage.filters).toHaveLength(0); // screen untouched
  });

  // -------------------------------------------------------------------------
  // Uniform update on post-process
  // -------------------------------------------------------------------------

  it('calls pass.update(alpha) during renderer/post-process', () => {
    const pass = new ShaderPass({ name: 'u', order: 0, filter: createFilterStub() });
    pass.update = vi.fn();
    postFx.addPass(pass);

    core.events.emitSync('renderer/post-process', { alpha: 0.42, delta: 16 });

    expect(pass.update).toHaveBeenCalledWith(0.42);
  });

  // -------------------------------------------------------------------------
  // EventBus API
  // -------------------------------------------------------------------------

  it('adds a pass via renderer/shader:add event', () => {
    core.events.emitSync('renderer/shader:add', {
      pass: { name: 'ev', order: 0, filter: createFilterStub() },
    });
    expect(postFx.getPass('ev')).toBeDefined();
  });

  it('removes a pass via renderer/shader:remove event', () => {
    postFx.addPass(new ShaderPass({ name: 'rm', order: 0, filter: createFilterStub() }));
    core.events.emitSync('renderer/shader:remove', { name: 'rm' });
    expect(postFx.getPass('rm')).toBeUndefined();
  });

  it('toggles a pass via renderer/shader:toggle event', () => {
    postFx.addPass(new ShaderPass({ name: 'tg', order: 0, filter: createFilterStub() }));
    core.events.emitSync('renderer/shader:toggle', { name: 'tg', enabled: false });
    expect(stage.filters).toHaveLength(0);
  });

  // -------------------------------------------------------------------------
  // destroy
  // -------------------------------------------------------------------------

  it('clears internal state on destroy', () => {
    postFx.addPass(new ShaderPass({ name: 'd', order: 0, filter: createFilterStub() }));
    postFx.destroy();
    expect(postFx.getPass('d')).toBeUndefined();
  });
});
