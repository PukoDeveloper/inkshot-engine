import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { Tween, TweenManager, Easing } from '../src/plugins/TweenManager.js';
import { Timeline } from '../src/plugins/Timeline.js';
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
// Timeline — basic sequencing
// ---------------------------------------------------------------------------

describe('Timeline — basic sequencing', () => {
  it('plays two tweens one after the other by default', () => {
    const obj = makeObj({ x: 0, y: 0 });
    const tl = new Timeline();

    tl.to(obj, { x: 100 }, { duration: 100 })
      .to(obj, { y: 100 }, { duration: 100 });

    // After 150 ms: first tween done (x=100), second tween 50 ms in (y=50)
    tl.advance(150);
    expect(obj.x).toBeCloseTo(100);
    expect(obj.y).toBeCloseTo(50);
  });

  it('reports isCompleted when all entries finish', () => {
    const obj = makeObj();
    const tl = new Timeline();
    tl.to(obj, { x: 100 }, { duration: 100 });

    expect(tl.isCompleted).toBe(false);
    tl.advance(100);
    expect(tl.isCompleted).toBe(true);
  });

  it('returns true from advance() when complete', () => {
    const tl = new Timeline();
    tl.to(makeObj(), { x: 1 }, { duration: 50 });

    expect(tl.advance(50)).toBe(true);
  });

  it('does not advance past completion', () => {
    const obj = makeObj({ x: 0 });
    const tl = new Timeline();
    tl.to(obj, { x: 100 }, { duration: 100 });

    tl.advance(200);
    obj.x = 999; // mutate after completion
    tl.advance(50); // must not touch obj
    expect(obj.x).toBe(999);
  });
});

// ---------------------------------------------------------------------------
// Timeline — parallel entries (at: '<')
// ---------------------------------------------------------------------------

describe('Timeline — parallel entries', () => {
  it('runs two tweens in parallel using at: "<"', () => {
    const obj = makeObj({ x: 0, y: 0 });
    const tl = new Timeline();

    tl.to(obj, { x: 100 }, { duration: 100 })
      .to(obj, { y: 100 }, { duration: 100, at: '<' }); // same start

    tl.advance(50);
    expect(obj.x).toBeCloseTo(50);
    expect(obj.y).toBeCloseTo(50);
  });

  it('total duration equals max(entry end times)', () => {
    const obj = makeObj();
    const tl = new Timeline();

    tl.to(obj, { x: 100 }, { duration: 200 })
      .to(obj, { y: 100 }, { duration: 100, at: '<' }); // parallel, ends sooner

    expect(tl.duration).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// Timeline — absolute positioning
// ---------------------------------------------------------------------------

describe('Timeline — absolute positioning', () => {
  it('places entry at an absolute time with at: number', () => {
    const obj = makeObj({ x: 0 });
    const tl = new Timeline();

    // Place a tween starting at t=200 ms
    tl.to(obj, { x: 100 }, { duration: 100, at: 200 });

    tl.advance(100); // before entry starts
    expect(obj.x).toBeCloseTo(0); // not started yet

    tl.advance(150); // t=250: 50 ms into the tween
    expect(obj.x).toBeCloseTo(50);
  });
});

// ---------------------------------------------------------------------------
// Timeline — relative positioning
// ---------------------------------------------------------------------------

describe('Timeline — relative positioning', () => {
  it('at: "+=N" offsets from the cursor', () => {
    const obj = makeObj({ x: 0, y: 0 });
    const tl = new Timeline();

    // cursor=0 → first entry ends at 100
    tl.to(obj, { x: 100 }, { duration: 100 })
      // cursor=100, +=50 → starts at 150
      .to(obj, { y: 100 }, { duration: 100, at: '+=50' });

    // total duration = 250
    expect(tl.duration).toBe(250);

    tl.advance(200); // 50 ms into the second tween
    expect(obj.y).toBeCloseTo(50);
  });

  it('at: "-=N" overlaps entries', () => {
    const obj = makeObj({ x: 0, y: 0 });
    const tl = new Timeline();

    // cursor=0, first entry ends at cursor=100
    tl.to(obj, { x: 100 }, { duration: 100 })
      // cursor=100, -= 50 → second entry starts at 50 (overlapping by 50 ms)
      .to(obj, { y: 100 }, { duration: 100, at: '-=50' });

    // at=50, duration=100 → ends at 150; total=150
    expect(tl.duration).toBe(150);
  });
});

// ---------------------------------------------------------------------------
// Timeline — call()
// ---------------------------------------------------------------------------

describe('Timeline — call()', () => {
  it('fires callback at the specified time', () => {
    const obj = makeObj({ x: 0 });
    const fn = vi.fn();
    const tl = new Timeline();

    tl.to(obj, { x: 100 }, { duration: 200 })
      .call(fn, { at: 100 });

    tl.advance(50); // before callback
    expect(fn).not.toHaveBeenCalled();

    tl.advance(60); // crosses 100 ms mark
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('fires callback only once', () => {
    const fn = vi.fn();
    const tl = new Timeline();
    tl.call(fn, { at: 50 });
    tl.to(makeObj(), { x: 1 }, { duration: 200 });

    tl.advance(60);
    tl.advance(60);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('fires callback placed after the last tween (uses cursor)', () => {
    const fn = vi.fn();
    const obj = makeObj();
    const tl = new Timeline();

    // tween: 0→100ms; cursor is now 100
    tl.to(obj, { x: 100 }, { duration: 100 });
    // call at cursor (100 ms) by default
    tl.call(fn);

    tl.advance(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Timeline — delay()
// ---------------------------------------------------------------------------

describe('Timeline — delay()', () => {
  it('advances the cursor without adding an entry', () => {
    const obj = makeObj({ x: 0 });
    const tl = new Timeline();

    tl.to(obj, { x: 100 }, { duration: 100 })
      .delay(100)
      .to(obj, { x: 200 }, { duration: 100 });

    // total duration = 100 (first) + 100 (delay) + 100 (second) = 300
    expect(tl.duration).toBe(300);

    tl.advance(250); // 50 ms into second tween
    expect(obj.x).toBeCloseTo(150);
  });
});

// ---------------------------------------------------------------------------
// Timeline — set()
// ---------------------------------------------------------------------------

describe('Timeline — set()', () => {
  it('instantly sets properties at the given time', () => {
    const obj = makeObj({ x: 0, alpha: 1 });
    const tl = new Timeline();

    tl.set(obj, { alpha: 0 }, { at: 50 })
      .to(obj, { x: 100 }, { duration: 200 });

    tl.advance(60); // past the set
    expect(obj.alpha).toBeCloseTo(0);
    // set and to(x) both start at t=50ms; after 60ms, to(x) has run 10ms out of 200ms
    expect(obj.x).toBeCloseTo(5); // (60-50)/200 * 100
  });
});

// ---------------------------------------------------------------------------
// Timeline — fromTo()
// ---------------------------------------------------------------------------

describe('Timeline — fromTo()', () => {
  it('animates from explicit start values to explicit end values', () => {
    const obj = makeObj({ x: 50 }); // current value doesn't matter
    const tl = new Timeline();

    tl.fromTo(obj, { x: 0 }, { x: 100 }, { duration: 100 });

    tl.advance(50); // 50% → x should be 50
    expect(obj.x).toBeCloseTo(50);
  });

  it('forces target to fromProps at tween start', () => {
    const obj = makeObj({ x: 999 });
    const tl = new Timeline();

    tl.fromTo(obj, { x: 0 }, { x: 100 }, { duration: 100 });

    tl.advance(0); // trigger start (duration=0 carry-over)
    // After first advance (any dt), onStart fires and x is set to 0
    tl.advance(10);
    // from=0, to=100, progress=10/100=0.1 → x ≈ 10
    expect(obj.x).toBeCloseTo(10);
  });
});

// ---------------------------------------------------------------------------
// Timeline — from()
// ---------------------------------------------------------------------------

describe('Timeline — from()', () => {
  it('animates from given values to the target current values', () => {
    const obj = makeObj({ x: 100 }); // current = destination
    const tl = new Timeline();

    tl.from(obj, { x: 0 }, { duration: 100 });

    tl.advance(50); // 50% from 0→100 = 50
    expect(obj.x).toBeCloseTo(50);
  });
});

// ---------------------------------------------------------------------------
// Timeline — pause / resume / kill
// ---------------------------------------------------------------------------

describe('Timeline — pause / resume / kill', () => {
  it('pause stops advancement', () => {
    const obj = makeObj({ x: 0 });
    const tl = new Timeline();
    tl.to(obj, { x: 100 }, { duration: 100 });

    tl.advance(30);
    tl.pause();
    tl.advance(40);
    expect(obj.x).toBeCloseTo(30);
    expect(tl.isPaused).toBe(true);
  });

  it('resume continues from paused position', () => {
    const obj = makeObj({ x: 0 });
    const tl = new Timeline();
    tl.to(obj, { x: 100 }, { duration: 100 });

    tl.advance(30);
    tl.pause();
    tl.advance(40);
    tl.resume();
    tl.advance(20);
    expect(obj.x).toBeCloseTo(50);
  });

  it('kill stops the timeline', () => {
    const obj = makeObj({ x: 0 });
    const tl = new Timeline();
    tl.to(obj, { x: 100 }, { duration: 100 });

    tl.advance(30);
    tl.kill();
    tl.advance(70);
    expect(obj.x).toBeCloseTo(30);
    expect(tl.isKilled).toBe(true);
    expect(tl.advance(10)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Timeline — onComplete callback
// ---------------------------------------------------------------------------

describe('Timeline — onComplete', () => {
  it('calls onComplete when the timeline finishes', () => {
    const obj = makeObj();
    const onComplete = vi.fn();
    const tl = new Timeline({ onComplete });
    tl.to(obj, { x: 100 }, { duration: 100 });

    tl.advance(200);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('does not call onComplete before completion', () => {
    const obj = makeObj();
    const onComplete = vi.fn();
    const tl = new Timeline({ onComplete });
    tl.to(obj, { x: 100 }, { duration: 100 });

    tl.advance(50);
    expect(onComplete).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Timeline — integration with TweenManager
// ---------------------------------------------------------------------------

describe('Timeline — TweenManager integration', () => {
  it('is driven by TweenManager via core/tick', () => {
    const core = createCoreStub();
    const manager = new TweenManager();
    manager.init(core);

    const obj = makeObj({ x: 0 });
    const tl = new Timeline();
    tl.to(obj, { x: 100 }, { duration: 100 });
    manager.add(tl);

    core.events.emitSync('core/tick', { delta: 1, elapsed: 50 });
    expect(obj.x).toBeCloseTo(50);

    manager.destroy();
  });

  it('TweenManager removes timeline after completion', () => {
    const core = createCoreStub();
    const manager = new TweenManager();
    manager.init(core);

    const obj = makeObj({ x: 0 });
    const tl = new Timeline();
    tl.to(obj, { x: 100 }, { duration: 100 });
    manager.add(tl);

    core.events.emitSync('core/tick', { delta: 1, elapsed: 200 }); // completes
    obj.x = 999;
    core.events.emitSync('core/tick', { delta: 1, elapsed: 50 }); // should not re-run
    expect(obj.x).toBe(999);

    manager.destroy();
  });

  it('easing functions produce correct output at midpoint', () => {
    const obj = makeObj({ x: 0 });
    const tl = new Timeline();
    tl.to(obj, { x: 100 }, { duration: 100, ease: Easing['easeOutQuad'] });

    tl.advance(50); // easeOutQuad(0.5) = 0.75
    expect(obj.x).toBeCloseTo(75);
  });
});
