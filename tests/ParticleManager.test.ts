import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { ParticleManager } from '../src/plugins/ParticleManager.js';
import type { ParticleDisplay, ParticleLayer } from '../src/plugins/ParticleManager.js';
import type { ParticleConfig, ParticleEmitOutput, ParticleCompleteParams } from '../src/types/particle.js';
import type { Core } from '../src/core/Core.js';

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

function createDisplayStub(): ParticleDisplay {
  return {
    x: 0,
    y: 0,
    alpha: 1,
    scale: { x: 1, y: 1 },
    rotation: 0,
    tint: 0xffffff,
  };
}

function createLayerStub(): ParticleLayer & { added: ParticleDisplay[]; removed: ParticleDisplay[] } {
  const added: ParticleDisplay[] = [];
  const removed: ParticleDisplay[] = [];
  return {
    added,
    removed,
    addChild(d) { added.push(d); },
    removeChild(d) {
      const i = removed.indexOf(d);
      if (i < 0) removed.push(d);
    },
  };
}

function createCoreStub(layer?: ParticleLayer) {
  const events = new EventBus();
  const fxLayer = layer ?? createLayerStub();

  events.on('test', 'renderer/layer', (_p: { name: string }, output: { layer: ParticleLayer }) => {
    if (_p.name === 'fx') output.layer = fxLayer;
  });

  return {
    core: { events } as unknown as Core,
    fxLayer,
  };
}

function makeConfig(overrides: Partial<ParticleConfig> = {}): ParticleConfig {
  return {
    x: 0,
    y: 0,
    speed: 100,
    lifetime: 1000,
    ...overrides,
  };
}

function makeParticleManager(layer?: ParticleLayer) {
  const { core, fxLayer } = createCoreStub(layer);
  const pm = new ParticleManager({ createDisplay: createDisplayStub });
  pm.init(core);
  return { pm, core, fxLayer: fxLayer as ReturnType<typeof createLayerStub> };
}

// Helper: emit `core/update` events
function tick(core: Core, dt: number, times = 1): void {
  for (let i = 0; i < times; i++) {
    core.events.emitSync('core/update', { dt, tick: i });
  }
}

// ---------------------------------------------------------------------------
// Constructor / init
// ---------------------------------------------------------------------------

describe('ParticleManager — init', () => {
  it('registers without errors', () => {
    expect(() => makeParticleManager()).not.toThrow();
  });

  it('starts with zero emitters and zero particles', () => {
    const { pm } = makeParticleManager();
    expect(pm.emitterCount).toBe(0);
    expect(pm.particleCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// emit() — burst mode
// ---------------------------------------------------------------------------

describe('ParticleManager — burst emit', () => {
  let pm: ParticleManager;
  let core: Core;
  let fxLayer: ReturnType<typeof createLayerStub>;

  beforeEach(() => {
    ({ pm, core, fxLayer } = makeParticleManager());
  });

  it('spawns exactly burstCount particles immediately', () => {
    pm.emit(makeConfig({ burst: true, burstCount: 5 }));
    expect(pm.particleCount).toBe(5);
    expect(fxLayer.added.length).toBe(5);
  });

  it('defaults burstCount to 10', () => {
    pm.emit(makeConfig({ burst: true }));
    expect(pm.particleCount).toBe(10);
  });

  it('sets the emitter inactive immediately after burst', () => {
    const id = pm.emit(makeConfig({ burst: true, burstCount: 3 }));
    // Emitter is still in the map (particles are alive).
    expect(pm.emitterCount).toBe(1);
    // But further ticks should not add more particles (only advance existing).
    const before = pm.particleCount;
    tick(core, 0); // zero-length tick, no deaths
    expect(pm.particleCount).toBe(before);
  });

  it('removes emitter when all burst particles expire', () => {
    pm.emit(makeConfig({ burst: true, burstCount: 3, lifetime: 100 }));
    tick(core, 200); // advance past lifetime
    expect(pm.emitterCount).toBe(0);
    expect(pm.particleCount).toBe(0);
  });

  it('emits particle/complete after all burst particles expire', () => {
    const handler = vi.fn();
    core.events.on('test', 'particle/complete', handler);

    pm.emit(makeConfig({ burst: true, burstCount: 2, lifetime: 50 }));
    tick(core, 100);

    expect(handler).toHaveBeenCalledOnce();
    const params = handler.mock.calls[0][0] as ParticleCompleteParams;
    expect(typeof params.id).toBe('string');
  });

  it('particle/complete carries the correct emitter ID', () => {
    const handler = vi.fn();
    core.events.on('test', 'particle/complete', handler);

    const id = pm.emit(makeConfig({ burst: true, burstCount: 1, lifetime: 10 }), 'my-burst');
    expect(id).toBe('my-burst');
    tick(core, 50);

    const params = handler.mock.calls[0][0] as ParticleCompleteParams;
    expect(params.id).toBe('my-burst');
  });
});

// ---------------------------------------------------------------------------
// emit() — continuous mode
// ---------------------------------------------------------------------------

describe('ParticleManager — continuous emit', () => {
  let pm: ParticleManager;
  let core: Core;

  beforeEach(() => {
    ({ pm, core } = makeParticleManager());
  });

  it('spawns particles over time according to rate', () => {
    pm.emit(makeConfig({ rate: 100, lifetime: 9999 })); // 100 particles/s = 1 per 10 ms
    tick(core, 50); // 50 ms → should spawn ~5 particles
    expect(pm.particleCount).toBeGreaterThanOrEqual(4);
    expect(pm.particleCount).toBeLessThanOrEqual(6);
  });

  it('stops emitting new particles after duration elapses', () => {
    pm.emit(makeConfig({ rate: 10, lifetime: 9999, duration: 100 }));
    tick(core, 200); // emitter stops after 100 ms
    // Emitter should still exist (particles alive) but no new ones.
    const countAt200 = pm.particleCount;
    tick(core, 50);
    // Some particles may have died, but none new were added.
    expect(pm.particleCount).toBeLessThanOrEqual(countAt200);
  });

  it('does NOT emit particle/complete for continuous emitters', () => {
    const handler = vi.fn();
    core.events.on('test', 'particle/complete', handler);

    pm.emit(makeConfig({ rate: 100, lifetime: 50, duration: 60 }));
    tick(core, 500); // run well past everything

    expect(handler).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// stop()
// ---------------------------------------------------------------------------

describe('ParticleManager — stop()', () => {
  it('prevents new particles while existing ones continue', () => {
    const { pm, core } = makeParticleManager();
    const id = pm.emit(makeConfig({ rate: 100, lifetime: 9999 }));
    tick(core, 50); // spawn some
    const before = pm.particleCount;

    pm.stop(id);
    tick(core, 50); // would have spawned more, but emitter is stopped
    // Count must not exceed what was there before stop.
    expect(pm.particleCount).toBeLessThanOrEqual(before);
  });

  it('does nothing for an unknown ID', () => {
    const { pm } = makeParticleManager();
    expect(() => pm.stop('nonexistent')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// clear()
// ---------------------------------------------------------------------------

describe('ParticleManager — clear()', () => {
  it('immediately removes a specific emitter and its particles', () => {
    const { pm, core, fxLayer } = makeParticleManager();
    const id = pm.emit(makeConfig({ burst: true, burstCount: 5, lifetime: 9999 }));

    pm.clear(id);

    expect(pm.emitterCount).toBe(0);
    expect(pm.particleCount).toBe(0);
    expect(fxLayer.removed.length).toBe(5);
  });

  it('clears all emitters when no ID is supplied', () => {
    const { pm } = makeParticleManager();
    pm.emit(makeConfig({ burst: true, burstCount: 3, lifetime: 9999 }));
    pm.emit(makeConfig({ burst: true, burstCount: 4, lifetime: 9999 }));

    pm.clear();

    expect(pm.emitterCount).toBe(0);
    expect(pm.particleCount).toBe(0);
  });

  it('does NOT emit particle/complete on forced clear', () => {
    const { pm, core } = makeParticleManager();
    const handler = vi.fn();
    core.events.on('test', 'particle/complete', handler);

    const id = pm.emit(makeConfig({ burst: true, burstCount: 3, lifetime: 9999 }));
    pm.clear(id);

    expect(handler).not.toHaveBeenCalled();
  });

  it('is a no-op for an unknown ID', () => {
    const { pm } = makeParticleManager();
    expect(() => pm.clear('ghost')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// EventBus API
// ---------------------------------------------------------------------------

describe('ParticleManager — EventBus API', () => {
  it('particle/emit returns the emitter ID', () => {
    const { pm, core } = makeParticleManager();
    const { output } = core.events.emitSync('particle/emit', { config: makeConfig({ burst: true, burstCount: 2 }) }) as { output: ParticleEmitOutput };
    expect(typeof output.id).toBe('string');
    expect(output.id.length).toBeGreaterThan(0);
  });

  it('particle/emit respects a supplied ID', () => {
    const { pm, core } = makeParticleManager();
    const { output } = core.events.emitSync('particle/emit', { id: 'boom', config: makeConfig({ burst: true }) }) as { output: ParticleEmitOutput };
    expect(output.id).toBe('boom');
    expect(pm.emitterCount).toBe(1);
  });

  it('particle/stop stops the emitter', () => {
    const { pm, core } = makeParticleManager();
    const id = pm.emit(makeConfig({ rate: 200, lifetime: 9999 }));
    tick(core, 20);
    const before = pm.particleCount;

    core.events.emitSync('particle/stop', { id });
    tick(core, 50);
    expect(pm.particleCount).toBeLessThanOrEqual(before);
  });

  it('particle/clear removes all when no ID', () => {
    const { pm, core } = makeParticleManager();
    pm.emit(makeConfig({ burst: true, burstCount: 5, lifetime: 9999 }));
    core.events.emitSync('particle/clear', {});
    expect(pm.particleCount).toBe(0);
  });

  it('particle/clear removes a specific emitter', () => {
    const { pm, core } = makeParticleManager();
    const id = pm.emit(makeConfig({ burst: true, burstCount: 3, lifetime: 9999 }));
    pm.emit(makeConfig({ burst: true, burstCount: 4, lifetime: 9999 }));

    core.events.emitSync('particle/clear', { id });
    // 3 cleared, 4 remain
    expect(pm.particleCount).toBe(4);
    expect(pm.emitterCount).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Particle physics & visual interpolation
// ---------------------------------------------------------------------------

describe('ParticleManager — particle physics', () => {
  it('particles move in the expected direction', () => {
    const { pm, core, fxLayer } = makeParticleManager();
    // Angle 0° = right (positive x)
    pm.emit(makeConfig({ burst: true, burstCount: 1, speed: 1000, angle: 0, spread: 0, lifetime: 9999 }));

    const display = fxLayer.added[0]!;
    const x0 = display.x;
    tick(core, 100); // 0.1 s → should move ~100 px right

    expect(display.x).toBeGreaterThan(x0 + 50);
  });

  it('gravity accelerates particles downward', () => {
    const { pm, core, fxLayer } = makeParticleManager();
    // Launch upward (angle 270°) and apply gravity
    pm.emit(makeConfig({
      burst: true, burstCount: 1,
      speed: 0, angle: 270, spread: 0,
      gravity: 1000, // strong gravity
      lifetime: 9999,
    }));

    const display = fxLayer.added[0]!;
    tick(core, 100); // 0.1 s
    // vy increases downward over time
    expect(display.y).toBeGreaterThan(0);
  });

  it('wind accelerates particles rightward', () => {
    const { pm, core, fxLayer } = makeParticleManager();
    pm.emit(makeConfig({
      burst: true, burstCount: 1,
      speed: 0, angle: 0, spread: 0,
      wind: 1000,
      lifetime: 9999,
    }));

    const display = fxLayer.added[0]!;
    tick(core, 100);
    expect(display.x).toBeGreaterThan(0);
  });

  it('alpha interpolates from startAlpha to endAlpha over lifetime', () => {
    const { pm, core, fxLayer } = makeParticleManager();
    pm.emit(makeConfig({
      burst: true, burstCount: 1,
      speed: 0,
      lifetime: 1000,
      startAlpha: 1,
      endAlpha: 0,
    }));

    const display = fxLayer.added[0]!;
    expect(display.alpha).toBeCloseTo(1);

    tick(core, 500); // 50% of lifetime
    expect(display.alpha).toBeCloseTo(0.5, 1);

    tick(core, 499); // just before end
    expect(display.alpha).toBeLessThan(0.1);
  });

  it('scale interpolates from startScale to endScale over lifetime', () => {
    const { pm, core, fxLayer } = makeParticleManager();
    pm.emit(makeConfig({
      burst: true, burstCount: 1,
      speed: 0,
      lifetime: 1000,
      startScale: 2,
      endScale: 0,
    }));

    const display = fxLayer.added[0]!;
    expect(display.scale.x).toBeCloseTo(2);

    tick(core, 500);
    expect(display.scale.x).toBeCloseTo(1, 1);
  });

  it('tint interpolates from startColor to endColor', () => {
    const { pm, core, fxLayer } = makeParticleManager();
    pm.emit(makeConfig({
      burst: true, burstCount: 1,
      speed: 0,
      lifetime: 1000,
      startColor: 0xff0000, // red
      endColor: 0x0000ff,   // blue
    }));

    const display = fxLayer.added[0]!;
    expect(display.tint).toBe(0xff0000);

    tick(core, 500); // mid-way should be close to purple
    const r = (display.tint >> 16) & 0xff;
    const b = display.tint & 0xff;
    expect(r).toBeCloseTo(128, -1);
    expect(b).toBeCloseTo(128, -1);
  });
});

// ---------------------------------------------------------------------------
// Lifecycle / destroy
// ---------------------------------------------------------------------------

describe('ParticleManager — destroy()', () => {
  it('clears all emitters on destroy', () => {
    const { pm } = makeParticleManager();
    pm.emit(makeConfig({ burst: true, burstCount: 5, lifetime: 9999 }));
    pm.destroy();
    expect(pm.emitterCount).toBe(0);
    expect(pm.particleCount).toBe(0);
  });

  it('unregisters all event listeners on destroy', () => {
    const { pm, core } = makeParticleManager();
    pm.destroy();
    // After destroy, particle/emit should be ignored.
    const output: ParticleEmitOutput = { id: '' };
    core.events.emitSync('particle/emit', { config: makeConfig({ burst: true }) }, output);
    expect(pm.emitterCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ObjectPool reuse
// ---------------------------------------------------------------------------

describe('ParticleManager — ObjectPool reuse', () => {
  it('reuses display objects within a continuous emitter', () => {
    const created: ParticleDisplay[] = [];
    const createDisplay = () => {
      const d = createDisplayStub();
      created.push(d);
      return d;
    };

    const layer = createLayerStub();
    const { core } = createCoreStub(layer);
    const pm = new ParticleManager({ createDisplay, poolSize: 20 });
    pm.init(core);

    // rate = 100/s → 1 particle every 10 ms; lifetime = 10 ms
    // After one 50 ms tick: 5 particles are spawned AND all die (age 50 ≥ lifetime 10).
    // They are released back to the pool.
    pm.emit(makeConfig({ rate: 100, lifetime: 10, duration: 9999 }));

    tick(core, 50); // 5 created, 5 released to pool
    const firstBatchCount = created.length;
    expect(firstBatchCount).toBeGreaterThan(0);

    // Second tick: new particles are acquired from the pool — no new allocations.
    tick(core, 50);
    expect(created.length).toBe(firstBatchCount);
  });
});
