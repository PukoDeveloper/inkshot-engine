import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { ParticleManager } from '../src/plugins/ParticleManager.js';
import type { ParticleDisplay, ParticleLayer } from '../src/plugins/ParticleManager.js';
import type {
  ParticleConfig,
  ParticleEmitOutput,
  ParticleCompleteParams,
  ParticleCountOutput,
} from '../src/types/particle.js';
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

  it('fires particle/complete for continuous emitters with duration when all particles expire', () => {
    const handler = vi.fn();
    core.events.on('test', 'particle/complete', handler);

    pm.emit(makeConfig({ rate: 100, lifetime: 50, duration: 60 }));
    tick(core, 500); // duration expires ~60 ms; all particles (lifetime 50 ms) dead well before 500 ms

    expect(handler).toHaveBeenCalledOnce();
    const params = handler.mock.calls[0][0] as ParticleCompleteParams;
    expect(typeof params.id).toBe('string');
  });

  it('does NOT emit particle/complete for manually stopped continuous emitters', () => {
    const handler = vi.fn();
    core.events.on('test', 'particle/complete', handler);

    const id = pm.emit(makeConfig({ rate: 100, lifetime: 50 }));
    tick(core, 30);
    pm.stop(id);
    tick(core, 200); // all particles eventually die, but stop() was manual

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

// ---------------------------------------------------------------------------
// Angular velocity (rotation animation)
// ---------------------------------------------------------------------------

describe('ParticleManager — rotation', () => {
  it('startRotation sets initial display rotation (in radians)', () => {
    const { pm, fxLayer } = makeParticleManager();
    pm.emit(makeConfig({ burst: true, burstCount: 1, speed: 0, startRotation: 90 }));

    const display = fxLayer.added[0]!;
    // 90 deg = π/2 rad ≈ 1.5708
    expect(display.rotation).toBeCloseTo(Math.PI / 2, 4);
  });

  it('angularVelocity rotates particles each tick', () => {
    const { pm, core, fxLayer } = makeParticleManager();
    // 360 deg/s → after 500 ms (0.5 s) the particle rotates π rad
    pm.emit(makeConfig({ burst: true, burstCount: 1, speed: 0, angularVelocity: 360, lifetime: 9999 }));

    const display = fxLayer.added[0]!;
    const r0 = display.rotation;
    tick(core, 500);
    expect(display.rotation - r0).toBeCloseTo(Math.PI, 1);
  });

  it('rotationVariance produces different initial rotations across particles', () => {
    const { pm, fxLayer } = makeParticleManager();
    pm.emit(makeConfig({
      burst: true, burstCount: 20, speed: 0,
      startRotation: 0, rotationVariance: 180,
    }));

    const rotations = fxLayer.added.map((d) => d.rotation);
    const allSame = rotations.every((r) => r === rotations[0]);
    expect(allSame).toBe(false);
  });

  it('angularVelocityVariance produces different spin rates', () => {
    const { pm, core, fxLayer } = makeParticleManager();
    pm.emit(makeConfig({
      burst: true, burstCount: 20, speed: 0,
      angularVelocity: 0, angularVelocityVariance: 180,
      lifetime: 9999,
    }));

    const r0 = fxLayer.added.map((d) => d.rotation);
    tick(core, 500);
    const r1 = fxLayer.added.map((d) => d.rotation);
    const deltas = r1.map((r, i) => Math.abs(r - r0[i]!));
    const allZero = deltas.every((d) => d === 0);
    expect(allZero).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Emitter move / follow
// ---------------------------------------------------------------------------

describe('ParticleManager — move()', () => {
  it('move() updates spawn position for new particles', () => {
    const { pm, core, fxLayer } = makeParticleManager();
    // speed: 0 so particles sit at exactly their spawn position
    const id = pm.emit(makeConfig({ rate: 100, lifetime: 9999, x: 0, y: 0, speed: 0 }));

    tick(core, 50); // spawn some at (0, 0)
    const countBefore = fxLayer.added.length;

    pm.move(id, 500, 300);
    tick(core, 50); // spawn more at (500, 300)

    const newDisplays = fxLayer.added.slice(countBefore);
    const anyAtNewPos = newDisplays.some((d) => d.x === 500 && d.y === 300);
    expect(anyAtNewPos).toBe(true);
  });

  it('move() via particle/move event', () => {
    const { pm, core } = makeParticleManager();
    const id = pm.emit(makeConfig({ rate: 10, lifetime: 9999, x: 0, y: 0 }));
    core.events.emitSync('particle/move', { id, x: 100, y: 200 });
    expect((pm as unknown as { _emitters: Map<string, { config: ParticleConfig }> })
      ._emitters.get(id)?.config.x).toBe(100);
  });

  it('move() is a no-op for an unknown ID', () => {
    const { pm } = makeParticleManager();
    expect(() => pm.move('ghost', 1, 2)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Spawn shapes
// ---------------------------------------------------------------------------

describe('ParticleManager — spawnShape', () => {
  it('point shape (default) spawns all particles at origin', () => {
    const { pm, fxLayer } = makeParticleManager();
    pm.emit(makeConfig({ burst: true, burstCount: 10, speed: 0, x: 50, y: 50 }));
    expect(fxLayer.added.every((d) => d.x === 50 && d.y === 50)).toBe(true);
  });

  it('rect shape spawns particles within the bounding box', () => {
    const { pm, fxLayer } = makeParticleManager();
    pm.emit(makeConfig({
      burst: true, burstCount: 100, speed: 0,
      x: 0, y: 0,
      spawnShape: 'rect', spawnWidth: 200, spawnHeight: 100,
    }));
    for (const d of fxLayer.added) {
      expect(d.x).toBeGreaterThanOrEqual(-100);
      expect(d.x).toBeLessThanOrEqual(100);
      expect(d.y).toBeGreaterThanOrEqual(-50);
      expect(d.y).toBeLessThanOrEqual(50);
    }
  });

  it('rect shape actually spreads particles across the area', () => {
    const { pm, fxLayer } = makeParticleManager();
    pm.emit(makeConfig({
      burst: true, burstCount: 100, speed: 0,
      x: 0, y: 0,
      spawnShape: 'rect', spawnWidth: 200, spawnHeight: 100,
    }));
    const xs = fxLayer.added.map((d) => d.x);
    const allSame = xs.every((x) => x === xs[0]);
    expect(allSame).toBe(false);
  });

  it('circle shape spawns particles within the radius', () => {
    const { pm, fxLayer } = makeParticleManager();
    const r = 80;
    pm.emit(makeConfig({
      burst: true, burstCount: 200, speed: 0,
      x: 0, y: 0,
      spawnShape: 'circle', spawnRadius: r,
    }));
    for (const d of fxLayer.added) {
      const dist = Math.sqrt(d.x * d.x + d.y * d.y);
      expect(dist).toBeLessThanOrEqual(r + 0.001);
    }
  });

  it('circle shape actually spreads particles across the disc', () => {
    const { pm, fxLayer } = makeParticleManager();
    pm.emit(makeConfig({
      burst: true, burstCount: 200, speed: 0,
      x: 0, y: 0,
      spawnShape: 'circle', spawnRadius: 80,
    }));
    const distances = fxLayer.added.map((d) => Math.sqrt(d.x * d.x + d.y * d.y));
    const allZero = distances.every((d) => d < 0.001);
    expect(allZero).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// pause() / resume()
// ---------------------------------------------------------------------------

describe('ParticleManager — pause() / resume()', () => {
  it('paused emitter does not advance particles or spawn new ones', () => {
    const { pm, core, fxLayer } = makeParticleManager();
    pm.emit(makeConfig({ rate: 100, speed: 200, angle: 0, lifetime: 9999 }));
    tick(core, 50); // get some particles spawned and positioned

    const display = fxLayer.added[0]!;
    const xBefore = display.x;
    const countBefore = pm.particleCount;

    pm.pause();
    tick(core, 200);

    // Position must not change while paused.
    expect(display.x).toBe(xBefore);
    // No new particles must have been spawned.
    expect(pm.particleCount).toBe(countBefore);
  });

  it('resume() restarts particle advancement', () => {
    const { pm, core, fxLayer } = makeParticleManager();
    pm.emit(makeConfig({ rate: 100, speed: 200, angle: 0, lifetime: 9999 }));
    tick(core, 50);

    const display = fxLayer.added[0]!;
    pm.pause();
    tick(core, 200);
    const xAfterPause = display.x;

    pm.resume();
    tick(core, 100);

    expect(display.x).toBeGreaterThan(xAfterPause);
  });

  it('pause/resume target a specific emitter by ID', () => {
    const { pm, core } = makeParticleManager();

    // Two continuous emitters, speed=0 so particles don't expire by movement.
    const id1 = pm.emit(makeConfig({ rate: 100, speed: 0, lifetime: 9999 }));
    pm.emit(makeConfig({ rate: 100, speed: 0, lifetime: 9999 }));
    tick(core, 10);
    const beforePause = pm.particleCount;

    // Pause only id1.
    pm.pause(id1);
    tick(core, 50); // emitter2 spawns ~5 more; id1 spawns nothing
    const afterPause = pm.particleCount;

    // Some growth from emitter2 but not as much as two running emitters.
    expect(afterPause).toBeGreaterThan(beforePause);

    // Resume id1 — both emit again, growth accelerates.
    pm.resume(id1);
    tick(core, 50);
    const delta2 = pm.particleCount - afterPause;
    const delta1 = afterPause - beforePause;
    // With two emitters running, rate of growth should at least match (likely exceed) paused period.
    expect(delta2).toBeGreaterThanOrEqual(delta1);
  });

  it('particle/pause and particle/resume events work', () => {
    const { pm, core, fxLayer } = makeParticleManager();
    pm.emit(makeConfig({ rate: 100, speed: 200, angle: 0, lifetime: 9999 }));
    tick(core, 50);
    const display = fxLayer.added[0]!;
    const xBefore = display.x;

    core.events.emitSync('particle/pause', {});
    tick(core, 200);
    expect(display.x).toBe(xBefore);

    core.events.emitSync('particle/resume', {});
    tick(core, 100);
    expect(display.x).toBeGreaterThan(xBefore);
  });

  it('pause() is a no-op for an unknown ID', () => {
    const { pm } = makeParticleManager();
    expect(() => pm.pause('ghost')).not.toThrow();
  });

  it('resume() is a no-op for an unknown ID', () => {
    const { pm } = makeParticleManager();
    expect(() => pm.resume('ghost')).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// particle/count
// ---------------------------------------------------------------------------

describe('ParticleManager — particle/count', () => {
  it('returns correct emitter and particle counts via EventBus', () => {
    const { pm, core } = makeParticleManager();
    pm.emit(makeConfig({ burst: true, burstCount: 5, lifetime: 9999 }));
    pm.emit(makeConfig({ burst: true, burstCount: 3, lifetime: 9999 }));

    const { output } = core.events.emitSync('particle/count', {}) as {
      output: ParticleCountOutput;
    };
    expect(output.emitterCount).toBe(2);
    expect(output.particleCount).toBe(8);
  });

  it('particle/count reflects zero after all are cleared', () => {
    const { pm, core } = makeParticleManager();
    pm.emit(makeConfig({ burst: true, burstCount: 4, lifetime: 9999 }));
    pm.clear();

    const { output } = core.events.emitSync('particle/count', {}) as {
      output: ParticleCountOutput;
    };
    expect(output.emitterCount).toBe(0);
    expect(output.particleCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// particle/update
// ---------------------------------------------------------------------------

describe('ParticleManager — update()', () => {
  it('merges partial config without losing other fields', () => {
    const { pm } = makeParticleManager();
    const id = pm.emit(makeConfig({ rate: 10, lifetime: 1000, speed: 100 }));

    pm.update(id, { rate: 50 });

    const emitters = (pm as unknown as { _emitters: Map<string, { config: ParticleConfig }> })._emitters;
    const cfg = emitters.get(id)!.config;
    expect(cfg.rate).toBe(50);
    expect(cfg.speed).toBe(100); // unchanged
    expect(cfg.lifetime).toBe(1000); // unchanged
  });

  it('particle/update event merges config', () => {
    const { pm, core } = makeParticleManager();
    const id = pm.emit(makeConfig({ rate: 10, lifetime: 1000 }));

    core.events.emitSync('particle/update', { id, config: { rate: 99 } });

    const emitters = (pm as unknown as { _emitters: Map<string, { config: ParticleConfig }> })._emitters;
    expect(emitters.get(id)!.config.rate).toBe(99);
  });

  it('update() is a no-op for an unknown ID', () => {
    const { pm } = makeParticleManager();
    expect(() => pm.update('ghost', { rate: 5 })).not.toThrow();
  });

  it('updated rate affects subsequent spawning', () => {
    const { pm, core } = makeParticleManager();
    const id = pm.emit(makeConfig({ rate: 5, lifetime: 9999 })); // 5/s → 1 per 200 ms
    tick(core, 100);
    const before = pm.particleCount;

    pm.update(id, { rate: 500 }); // 500/s → 1 per 2 ms
    tick(core, 100); // should spawn ~50 more
    expect(pm.particleCount).toBeGreaterThan(before + 10);
  });
});

// ---------------------------------------------------------------------------
// Pre-warm
// ---------------------------------------------------------------------------

describe('ParticleManager — preWarm', () => {
  it('continuous emitter with preWarm has particles immediately after emit()', () => {
    const { pm } = makeParticleManager();
    pm.emit(makeConfig({ rate: 100, lifetime: 9999, preWarm: 200 }));
    // ~20 particles should have been spawned during the 200 ms pre-warm
    expect(pm.particleCount).toBeGreaterThan(5);
  });

  it('preWarm advances particle positions from the origin', () => {
    const { pm, fxLayer } = makeParticleManager();
    // rate=50 → first particle at ~20 ms; preWarm=300 ms gives ~280 ms of travel
    // at 1000 px/s = 1 px/ms → should be well past 50 px
    pm.emit(makeConfig({ rate: 50, lifetime: 9999, speed: 1000, angle: 0, spread: 0, preWarm: 300 }));

    expect(fxLayer.added.some((d) => d.x > 50)).toBe(true);
  });

  it('preWarm = 0 leaves emitter at initial state', () => {
    const { pm } = makeParticleManager();
    pm.emit(makeConfig({ rate: 100, lifetime: 9999, preWarm: 0 }));
    expect(pm.particleCount).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Per-particle gravity / wind variance
// ---------------------------------------------------------------------------

describe('ParticleManager — gravityVariance / windVariance', () => {
  it('gravityVariance produces different vertical accelerations per particle', () => {
    const { pm, core, fxLayer } = makeParticleManager();
    pm.emit(makeConfig({
      burst: true, burstCount: 50, speed: 0,
      gravity: 1000, gravityVariance: 800,
      lifetime: 9999,
    }));

    tick(core, 500);

    const ys = fxLayer.added.map((d) => d.y);
    const allSame = ys.every((y) => Math.abs(y - ys[0]!) < 0.001);
    expect(allSame).toBe(false);
  });

  it('windVariance produces different horizontal accelerations per particle', () => {
    const { pm, core, fxLayer } = makeParticleManager();
    pm.emit(makeConfig({
      burst: true, burstCount: 50, speed: 0,
      wind: 1000, windVariance: 800,
      lifetime: 9999,
    }));

    tick(core, 500);

    const xs = fxLayer.added.map((d) => d.x);
    const allSame = xs.every((x) => Math.abs(x - xs[0]!) < 0.001);
    expect(allSame).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// repeatBurst
// ---------------------------------------------------------------------------

describe('ParticleManager — repeatBurst', () => {
  it('emitter persists after the first burst completes', () => {
    const { pm, core } = makeParticleManager();
    pm.emit(makeConfig({ burst: true, burstCount: 3, lifetime: 50, repeatBurst: true }));
    tick(core, 200); // first burst is dead
    expect(pm.emitterCount).toBe(1);
  });

  it('re-emits particles after the repeat interval', () => {
    const { pm, core } = makeParticleManager();
    pm.emit(makeConfig({
      burst: true, burstCount: 5, lifetime: 50,
      repeatBurst: true, repeatInterval: 100,
    }));
    tick(core, 200); // first burst dies (~50 ms), wait 100 ms, second burst fires
    expect(pm.particleCount).toBeGreaterThan(0);
  });

  it('does NOT fire particle/complete between repeat cycles', () => {
    const { pm, core } = makeParticleManager();
    const handler = vi.fn();
    core.events.on('test', 'particle/complete', handler);

    pm.emit(makeConfig({
      burst: true, burstCount: 3, lifetime: 50,
      repeatBurst: true, repeatInterval: 100,
    }));
    tick(core, 600); // multiple cycles should have occurred

    expect(handler).not.toHaveBeenCalled();
  });

  it('repeat emitter is removed and NOT auto-completed via clear()', () => {
    const { pm, core } = makeParticleManager();
    const handler = vi.fn();
    core.events.on('test', 'particle/complete', handler);

    const id = pm.emit(makeConfig({
      burst: true, burstCount: 3, lifetime: 50,
      repeatBurst: true, repeatInterval: 100,
    }));
    tick(core, 200);
    pm.clear(id);

    expect(pm.emitterCount).toBe(0);
    expect(handler).not.toHaveBeenCalled();
  });
});
