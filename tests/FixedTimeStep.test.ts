import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';

/**
 * Tests for the fixed time-step game loop implemented in Core.
 *
 * Since Core depends on Pixi.js Application (DOM, WebGL), we test the
 * loop logic by simulating what Core._onTick does: feed delta into the
 * EventBus and verify that core/update fires a deterministic number of
 * times and core/render fires with the correct alpha.
 */
describe('Fixed time-step loop (Core-level)', () => {
  const FIXED_STEP_MS = 1000 / 60; // ~16.667 ms
  const MAX_UPDATES = 5;

  let bus: EventBus;
  let accumulator: number;
  let tick: number;

  /** Simulates the logic in Core._onTick. */
  function simulateTick(frameDeltaMs: number) {
    bus.emitSync('core/tick', { delta: frameDeltaMs / FIXED_STEP_MS, elapsed: frameDeltaMs });

    accumulator += frameDeltaMs;
    let updates = 0;
    while (accumulator >= FIXED_STEP_MS && updates < MAX_UPDATES) {
      bus.emitSync('core/update', { dt: FIXED_STEP_MS, tick });
      accumulator -= FIXED_STEP_MS;
      tick += 1;
      updates += 1;
    }
    if (updates >= MAX_UPDATES) {
      accumulator = 0;
    }
    const alpha = accumulator / FIXED_STEP_MS;
    bus.emitSync('core/render', { alpha, delta: frameDeltaMs });
  }

  beforeEach(() => {
    bus = new EventBus();
    accumulator = 0;
    tick = 0;
  });

  it('fires core/update exactly once for a single fixed-step frame', () => {
    let updateCount = 0;
    bus.on('test', 'core/update', () => updateCount++);
    simulateTick(FIXED_STEP_MS);
    expect(updateCount).toBe(1);
  });

  it('fires core/update twice when frame delta is 2x fixed step', () => {
    let updateCount = 0;
    bus.on('test', 'core/update', () => updateCount++);
    simulateTick(FIXED_STEP_MS * 2);
    expect(updateCount).toBe(2);
  });

  it('does not fire core/update for a very short frame', () => {
    let updateCount = 0;
    bus.on('test', 'core/update', () => updateCount++);
    simulateTick(5); // 5 ms < 16.67 ms
    expect(updateCount).toBe(0);
  });

  it('accumulates leftover time across frames', () => {
    let updateCount = 0;
    bus.on('test', 'core/update', () => updateCount++);

    // Two short frames that individually aren't enough for an update
    simulateTick(10);
    expect(updateCount).toBe(0);

    simulateTick(10); // total = 20 ms > 16.67 ms → 1 update
    expect(updateCount).toBe(1);
  });

  it('caps updates per frame to MAX_UPDATES to prevent spiral of death', () => {
    let updateCount = 0;
    bus.on('test', 'core/update', () => updateCount++);

    // Simulate a huge spike (e.g. tab was backgrounded)
    simulateTick(FIXED_STEP_MS * 100);
    expect(updateCount).toBe(MAX_UPDATES);
  });

  it('provides alpha ∈ [0, 1) on core/render', () => {
    let receivedAlpha = -1;
    bus.on('test', 'core/render', (p: { alpha: number }) => {
      receivedAlpha = p.alpha;
    });

    // Frame of 20 ms → 1 update (16.67 ms consumed), leftover ~3.33 ms
    simulateTick(20);
    expect(receivedAlpha).toBeGreaterThanOrEqual(0);
    expect(receivedAlpha).toBeLessThan(1);
    expect(receivedAlpha).toBeCloseTo((20 - FIXED_STEP_MS) / FIXED_STEP_MS);
  });

  it('provides alpha = 0 when frame exactly matches fixed step', () => {
    let receivedAlpha = -1;
    bus.on('test', 'core/render', (p: { alpha: number }) => {
      receivedAlpha = p.alpha;
    });

    simulateTick(FIXED_STEP_MS);
    expect(receivedAlpha).toBeCloseTo(0);
  });

  it('provides monotonically increasing tick counter in core/update', () => {
    const ticks: number[] = [];
    bus.on('test', 'core/update', (p: { tick: number }) => {
      ticks.push(p.tick);
    });

    simulateTick(FIXED_STEP_MS * 3 + 1);
    expect(ticks).toEqual([0, 1, 2]);
  });
});
