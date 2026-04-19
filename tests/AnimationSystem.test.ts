import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { AnimationSystem } from '../src/rendering/AnimationSystem.js';

// Minimal Container-like stub with transform properties.
function createSpriteStub(x = 0, y = 0) {
  return {
    x,
    y,
    rotation: 0,
    scale: { x: 1, y: 1 },
  } as unknown as import('pixi.js').Container;
}

function createCoreStub() {
  const events = new EventBus();
  return {
    events,
  } as unknown as import('../src/core/Core.js').Core;
}

describe('AnimationSystem', () => {
  let core: ReturnType<typeof createCoreStub>;
  let anim: AnimationSystem;

  beforeEach(() => {
    core = createCoreStub();
    anim = new AnimationSystem();
    anim.init(core);
  });

  it('tracks a display object', () => {
    const sprite = createSpriteStub(10, 20);
    anim.track(sprite);
    expect(anim.isTracked(sprite)).toBe(true);
  });

  it('untracks a display object', () => {
    const sprite = createSpriteStub();
    anim.track(sprite);
    anim.untrack(sprite);
    expect(anim.isTracked(sprite)).toBe(false);
  });

  it('interpolates position between fixed updates', () => {
    const sprite = createSpriteStub(0, 0);
    anim.track(sprite);

    // Simulate: move sprite to (100, 200) then trigger fixed update
    sprite.x = 100;
    sprite.y = 200;
    core.events.emitSync('core/update', { dt: 16.67, tick: 0 });

    // Now render at alpha = 0.5 → should interpolate between (0,0) and (100,200)
    core.events.emitSync('renderer/animate', { alpha: 0.5, delta: 8 });

    expect(sprite.x).toBeCloseTo(50);
    expect(sprite.y).toBeCloseTo(100);
  });

  it('interpolates at alpha=0 (shows previous position)', () => {
    const sprite = createSpriteStub(0, 0);
    anim.track(sprite);

    sprite.x = 100;
    core.events.emitSync('core/update', { dt: 16.67, tick: 0 });

    core.events.emitSync('renderer/animate', { alpha: 0, delta: 0 });
    expect(sprite.x).toBeCloseTo(0);
  });

  it('interpolates at alpha=1 (shows current position)', () => {
    const sprite = createSpriteStub(0, 0);
    anim.track(sprite);

    sprite.x = 100;
    core.events.emitSync('core/update', { dt: 16.67, tick: 0 });

    core.events.emitSync('renderer/animate', { alpha: 1, delta: 16 });
    expect(sprite.x).toBeCloseTo(100);
  });

  it('snap() resets both prev and curr to current transform', () => {
    const sprite = createSpriteStub(0, 0);
    anim.track(sprite);

    // Move and update to establish prev=0, curr=100
    sprite.x = 100;
    core.events.emitSync('core/update', { dt: 16.67, tick: 0 });

    // Teleport and snap
    sprite.x = 500;
    anim.snap(sprite);

    // Render at alpha=0.5 should show 500 (no interpolation glide)
    core.events.emitSync('renderer/animate', { alpha: 0.5, delta: 8 });
    expect(sprite.x).toBeCloseTo(500);
  });

  it('interpolates rotation and scale', () => {
    const sprite = createSpriteStub();
    sprite.rotation = 0;
    sprite.scale.x = 1;
    sprite.scale.y = 1;
    anim.track(sprite);

    sprite.rotation = Math.PI;
    sprite.scale.x = 2;
    sprite.scale.y = 3;
    core.events.emitSync('core/update', { dt: 16.67, tick: 0 });

    core.events.emitSync('renderer/animate', { alpha: 0.5, delta: 8 });

    expect(sprite.rotation).toBeCloseTo(Math.PI / 2);
    expect(sprite.scale.x).toBeCloseTo(1.5);
    expect(sprite.scale.y).toBeCloseTo(2);
  });

  it('destroy clears tracked objects and listeners', () => {
    const sprite = createSpriteStub();
    anim.track(sprite);
    anim.destroy();

    expect(anim.isTracked(sprite)).toBe(false);
  });
});
