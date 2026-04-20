import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { Tween, TweenManager, Easing } from '../src/plugins/TweenManager.js';
import type { Core } from '../src/core/Core.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createCoreStub() {
  const events = new EventBus();
  return { events } as unknown as Core;
}

function makeObj(vals: Record<string, number> = {}) {
  return { x: 0, y: 0, alpha: 1, ...vals };
}

// ---------------------------------------------------------------------------
// Easing
// ---------------------------------------------------------------------------

describe('Easing', () => {
  it('linear returns t', () => {
    expect(Easing['linear']!(0)).toBe(0);
    expect(Easing['linear']!(0.5)).toBe(0.5);
    expect(Easing['linear']!(1)).toBe(1);
  });

  it('easeInQuad is 0 at 0 and 1 at 1', () => {
    expect(Easing['easeInQuad']!(0)).toBe(0);
    expect(Easing['easeInQuad']!(1)).toBe(1);
    expect(Easing['easeInQuad']!(0.5)).toBeCloseTo(0.25);
  });

  it('easeOutQuad is 0 at 0 and 1 at 1', () => {
    expect(Easing['easeOutQuad']!(0)).toBe(0);
    expect(Easing['easeOutQuad']!(1)).toBe(1);
  });

  it('easeOutBounce starts at 0 and ends at 1', () => {
    expect(Easing['easeOutBounce']!(0)).toBeCloseTo(0);
    expect(Easing['easeOutBounce']!(1)).toBeCloseTo(1);
  });
});

// ---------------------------------------------------------------------------
// Tween — basic interpolation
// ---------------------------------------------------------------------------

describe('Tween — basic interpolation', () => {
  it('animates a single numeric property with linear easing', () => {
    const obj = makeObj({ x: 0 });
    const tween = new Tween(obj, { x: 100 }, { duration: 100 });

    tween.advance(50);
    expect(obj.x).toBeCloseTo(50);
  });

  it('animates multiple properties simultaneously', () => {
    const obj = makeObj({ x: 0, y: 0 });
    const tween = new Tween(obj, { x: 100, y: 200 }, { duration: 100 });

    tween.advance(50);
    expect(obj.x).toBeCloseTo(50);
    expect(obj.y).toBeCloseTo(100);
  });

  it('snaps to exact final values on completion', () => {
    const obj = makeObj({ x: 0 });
    const tween = new Tween(obj, { x: 100 }, { duration: 100 });

    const done = tween.advance(200); // advance past duration
    expect(done).toBe(true);
    expect(obj.x).toBe(100);
    expect(tween.isCompleted).toBe(true);
  });

  it('returns false while still running', () => {
    const obj = makeObj();
    const tween = new Tween(obj, { x: 100 }, { duration: 100 });
    expect(tween.advance(50)).toBe(false);
  });

  it('handles duration = 0 (instant snap)', () => {
    const obj = makeObj({ x: 0 });
    const tween = new Tween(obj, { x: 42 }, { duration: 0 });

    const done = tween.advance(0);
    expect(done).toBe(true);
    expect(obj.x).toBe(42);
  });

  it('captures from-values at start time, not construction time', () => {
    const obj = makeObj({ x: 0 });
    const tween = new Tween(obj, { x: 100 }, { duration: 100, delay: 50 });

    // Move object before tween starts
    obj.x = 30;

    tween.advance(60); // past delay (50 ms), 10 ms into animation
    // from = 30 (value at start), to = 100, progress = 10/100 = 0.1
    expect(obj.x).toBeCloseTo(30 + (100 - 30) * 0.1);
  });

  it('applies easing correctly', () => {
    const obj = makeObj({ x: 0 });
    const tween = new Tween(obj, { x: 100 }, { duration: 100, ease: Easing['easeInQuad'] });

    tween.advance(50); // t = 0.5, easeInQuad(0.5) = 0.25
    expect(obj.x).toBeCloseTo(25);
  });
});

// ---------------------------------------------------------------------------
// Tween — delay
// ---------------------------------------------------------------------------

describe('Tween — delay', () => {
  it('does not animate during the delay period', () => {
    const obj = makeObj({ x: 0 });
    const tween = new Tween(obj, { x: 100 }, { duration: 100, delay: 50 });

    tween.advance(30);
    expect(obj.x).toBe(0);
    expect(tween.isCompleted).toBe(false);
  });

  it('starts animating after the delay', () => {
    const obj = makeObj({ x: 0 });
    const tween = new Tween(obj, { x: 100 }, { duration: 100, delay: 50 });

    tween.advance(50); // delay done, 0 ms of animation
    tween.advance(50); // 50 ms of animation
    expect(obj.x).toBeCloseTo(50);
  });

  it('carries over excess time past the delay boundary', () => {
    const obj = makeObj({ x: 0 });
    // delay=50, duration=100
    const tween = new Tween(obj, { x: 100 }, { duration: 100, delay: 50 });

    // Advance 70ms: 50 ms delay consumed, 20 ms of animation
    tween.advance(70);
    expect(obj.x).toBeCloseTo(20);
  });
});

// ---------------------------------------------------------------------------
// Tween — pause / resume / kill
// ---------------------------------------------------------------------------

describe('Tween — pause / resume / kill', () => {
  it('pause stops advancement', () => {
    const obj = makeObj({ x: 0 });
    const tween = new Tween(obj, { x: 100 }, { duration: 100 });

    tween.advance(30);
    tween.pause();
    tween.advance(40); // should have no effect
    expect(obj.x).toBeCloseTo(30);
    expect(tween.isPaused).toBe(true);
  });

  it('resume continues from paused position', () => {
    const obj = makeObj({ x: 0 });
    const tween = new Tween(obj, { x: 100 }, { duration: 100 });

    tween.advance(30);
    tween.pause();
    tween.advance(40);
    tween.resume();
    tween.advance(20);
    expect(obj.x).toBeCloseTo(50);
    expect(tween.isPaused).toBe(false);
  });

  it('kill stops the tween and leaves properties unchanged', () => {
    const obj = makeObj({ x: 0 });
    const tween = new Tween(obj, { x: 100 }, { duration: 100 });

    tween.advance(30);
    tween.kill();
    tween.advance(70);
    expect(obj.x).toBeCloseTo(30);
    expect(tween.isKilled).toBe(true);
    expect(tween.advance(10)).toBe(true); // killed → returns true
  });
});

// ---------------------------------------------------------------------------
// Tween — callbacks
// ---------------------------------------------------------------------------

describe('Tween — callbacks', () => {
  it('calls onStart once when animation begins', () => {
    const obj = makeObj();
    const onStart = vi.fn();
    const tween = new Tween(obj, { x: 100 }, { duration: 100, onStart });

    tween.advance(10);
    tween.advance(10);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('calls onStart after delay', () => {
    const obj = makeObj();
    const onStart = vi.fn();
    const tween = new Tween(obj, { x: 100 }, { duration: 100, delay: 50, onStart });

    tween.advance(30); // still in delay
    expect(onStart).not.toHaveBeenCalled();

    tween.advance(30); // past delay
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('calls onUpdate every tick while animating', () => {
    const obj = makeObj();
    const onUpdate = vi.fn();
    const tween = new Tween(obj, { x: 100 }, { duration: 100, onUpdate });

    tween.advance(25);
    tween.advance(25);
    expect(onUpdate).toHaveBeenCalledTimes(2);
  });

  it('calls onComplete when finished', () => {
    const obj = makeObj();
    const onComplete = vi.fn();
    const tween = new Tween(obj, { x: 100 }, { duration: 100, onComplete });

    tween.advance(100);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('does not call onComplete for looping tweens', () => {
    const obj = makeObj();
    const onComplete = vi.fn();
    const tween = new Tween(obj, { x: 100 }, { duration: 100, loop: true, onComplete });

    tween.advance(300); // multiple cycles
    expect(onComplete).not.toHaveBeenCalled();
    expect(tween.isCompleted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tween — loop
// ---------------------------------------------------------------------------

describe('Tween — loop', () => {
  it('restarts from original from-values when looping', () => {
    const obj = makeObj({ x: 0 });
    const tween = new Tween(obj, { x: 100 }, { duration: 100, loop: true });

    const done = tween.advance(100); // end of cycle 1
    expect(done).toBe(false);
    expect(obj.x).toBeCloseTo(0); // snapped back

    tween.advance(50); // 50% through cycle 2
    expect(obj.x).toBeCloseTo(50);
  });

  it('is never completed while looping', () => {
    const obj = makeObj();
    const tween = new Tween(obj, { x: 100 }, { duration: 100, loop: true });
    tween.advance(1000);
    expect(tween.isCompleted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Tween — yoyo
// ---------------------------------------------------------------------------

describe('Tween — yoyo', () => {
  it('reverses direction after forward pass', () => {
    const obj = makeObj({ x: 0 });
    const tween = new Tween(obj, { x: 100 }, { duration: 100, yoyo: true });

    tween.advance(100); // end of forward pass; switches to backward
    // At this point the backward pass begins (elapsed = 0 for backward)
    tween.advance(50); // 50% through backward: value should be ~50
    expect(obj.x).toBeCloseTo(50);
  });

  it('ends at from-values when yoyo without loop completes', () => {
    const obj = makeObj({ x: 0 });
    const tween = new Tween(obj, { x: 100 }, { duration: 100, yoyo: true });

    tween.advance(200); // complete both passes
    expect(obj.x).toBeCloseTo(0);
    expect(tween.isCompleted).toBe(true);
  });

  it('ping-pongs indefinitely with yoyo + loop', () => {
    const obj = makeObj({ x: 0 });
    const tween = new Tween(obj, { x: 100 }, { duration: 100, loop: true, yoyo: true });

    tween.advance(100); // end of forward pass
    tween.advance(50);  // halfway through backward
    expect(obj.x).toBeCloseTo(50);
    expect(tween.isCompleted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TweenManager — plugin lifecycle
// ---------------------------------------------------------------------------

describe('TweenManager', () => {
  let core: Core;
  let manager: TweenManager;

  beforeEach(() => {
    core = createCoreStub();
    manager = new TweenManager();
    manager.init(core);
  });

  it('drives tweens via core/tick', () => {
    const obj = makeObj({ x: 0 });
    const tween = new Tween(obj, { x: 100 }, { duration: 100 });
    manager.add(tween);

    core.events.emitSync('core/tick', { delta: 1, elapsed: 50 });
    expect(obj.x).toBeCloseTo(50);
  });

  it('removes completed tweens automatically', () => {
    const obj = makeObj({ x: 0 });
    const tween = new Tween(obj, { x: 100 }, { duration: 100 });
    manager.add(tween);

    core.events.emitSync('core/tick', { delta: 1, elapsed: 200 });
    // Second tick should not advance a completed tween
    obj.x = 0;
    core.events.emitSync('core/tick', { delta: 1, elapsed: 50 });
    expect(obj.x).toBe(0); // not advanced again
  });

  it('killAll stops all active tweens', () => {
    const obj1 = makeObj({ x: 0 });
    const obj2 = makeObj({ y: 0 });
    manager.add(new Tween(obj1, { x: 100 }, { duration: 100 }));
    manager.add(new Tween(obj2, { y: 100 }, { duration: 100 }));
    manager.killAll();

    core.events.emitSync('core/tick', { delta: 1, elapsed: 50 });
    expect(obj1.x).toBe(0);
    expect(obj2.y).toBe(0);
  });

  it('killTarget stops tweens on a specific object', () => {
    const obj1 = makeObj({ x: 0 });
    const obj2 = makeObj({ y: 0 });
    manager.add(new Tween(obj1, { x: 100 }, { duration: 100 }));
    manager.add(new Tween(obj2, { y: 100 }, { duration: 100 }));
    manager.killTarget(obj1);

    core.events.emitSync('core/tick', { delta: 1, elapsed: 50 });
    expect(obj1.x).toBe(0);    // killed
    expect(obj2.y).toBeCloseTo(50); // still running
  });

  it('supports EventBus tween/to API', () => {
    const obj = makeObj({ x: 0 }) as Record<string, unknown>;
    const { output } = core.events.emitSync<
      { target: Record<string, unknown>; props: Record<string, number>; duration: number },
      { id: string }
    >('tween/to', { target: obj, props: { x: 100 }, duration: 100 });

    expect(typeof output.id).toBe('string');

    core.events.emitSync('core/tick', { delta: 1, elapsed: 50 });
    expect((obj as Record<string, number>)['x']).toBeCloseTo(50);
  });

  it('supports EventBus tween/kill by id', () => {
    const obj = makeObj({ x: 0 }) as Record<string, unknown>;
    core.events.emitSync('tween/to', {
      target: obj,
      props: { x: 100 },
      duration: 100,
      id: 'myTween',
    });

    core.events.emitSync('tween/kill', { id: 'myTween' });
    core.events.emitSync('core/tick', { delta: 1, elapsed: 50 });
    expect((obj as Record<string, number>)['x']).toBe(0);
  });

  it('supports EventBus tween/kill all', () => {
    const obj = makeObj({ x: 0 }) as Record<string, unknown>;
    core.events.emitSync('tween/to', { target: obj, props: { x: 100 }, duration: 100 });
    core.events.emitSync('tween/kill', { all: true });
    core.events.emitSync('core/tick', { delta: 1, elapsed: 50 });
    expect((obj as Record<string, number>)['x']).toBe(0);
  });

  it('resolves ease by string name', () => {
    const obj = makeObj({ x: 0 }) as Record<string, unknown>;
    core.events.emitSync('tween/to', {
      target: obj,
      props: { x: 100 },
      duration: 100,
      ease: 'easeInQuad',
    });
    core.events.emitSync('core/tick', { delta: 1, elapsed: 50 });
    // easeInQuad(0.5) = 0.25
    expect((obj as Record<string, number>)['x']).toBeCloseTo(25);
  });

  it('destroy removes all listeners', () => {
    manager.destroy();
    const obj = makeObj({ x: 0 });
    manager.add(new Tween(obj, { x: 100 }, { duration: 100 }));
    core.events.emitSync('core/tick', { delta: 1, elapsed: 50 });
    // After destroy, core/tick should not advance the tween
    expect(obj.x).toBe(0);
  });
});
