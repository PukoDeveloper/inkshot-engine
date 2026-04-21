import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { Tween, TweenManager, Easing } from '../src/plugins/animation/TweenManager.js';
import { Timeline } from '../src/plugins/animation/Timeline.js';
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

    // advance(0) triggers onStart which sets x to fromProps (0) before from-capture.
    tl.advance(0);
    expect(obj.x).toBeCloseTo(0); // onStart has fired; target is at fromProps

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
// Timeline — loop
// ---------------------------------------------------------------------------

describe('Timeline — loop', () => {
  it('repeats after completion when loop: true', () => {
    const obj = makeObj({ x: 0 });
    const tl = new Timeline({ loop: true });
    tl.to(obj, { x: 100 }, { duration: 100 });

    tl.advance(100); // end of first cycle → loops (tweens reset, x snapped to 100)
    expect(tl.isCompleted).toBe(false);

    // Second cycle: tween resets and re-captures from=100 to to=100
    // (since the tween's target.x is at 100 after first cycle and _toProps.x=100).
    // Advance 50 ms into the second cycle
    tl.advance(50);
    expect(tl.isCompleted).toBe(false);
  });

  it('does not call onComplete when looping', () => {
    const obj = makeObj();
    const onComplete = vi.fn();
    const tl = new Timeline({ loop: true, onComplete });
    tl.to(obj, { x: 100 }, { duration: 100 });

    tl.advance(500);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('resets call entries so callbacks fire again on each loop', () => {
    const fn = vi.fn();
    const tl = new Timeline({ loop: true });
    tl.call(fn, { at: 0 });
    tl.delay(50); // give the timeline a positive duration

    tl.advance(50); // first cycle → call fires once
    expect(fn).toHaveBeenCalledTimes(1);

    tl.advance(50); // second cycle → call should fire again
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Timeline — playbackRate
// ---------------------------------------------------------------------------

describe('Timeline — playbackRate', () => {
  it('playbackRate: 2 runs the timeline at double speed', () => {
    const obj = makeObj({ x: 0 });
    const tl = new Timeline();
    tl.to(obj, { x: 100 }, { duration: 100 });
    tl.playbackRate = 2;

    tl.advance(25); // 25 real ms × 2 = 50 ms of animation
    expect(obj.x).toBeCloseTo(50);
  });

  it('playbackRate: 0.5 runs at half speed', () => {
    const obj = makeObj({ x: 0 });
    const tl = new Timeline();
    tl.to(obj, { x: 100 }, { duration: 100 });
    tl.playbackRate = 0.5;

    tl.advance(100); // 100 real ms × 0.5 = 50 ms of animation
    expect(obj.x).toBeCloseTo(50);
  });

  it('default playbackRate is 1', () => {
    const tl = new Timeline();
    expect(tl.playbackRate).toBe(1);
  });

  it('playbackRate affects when the timeline completes', () => {
    const obj = makeObj({ x: 0 });
    const tl = new Timeline();
    tl.to(obj, { x: 100 }, { duration: 100 });
    tl.playbackRate = 2;

    const done = tl.advance(50); // 50 × 2 = 100 ms → completes
    expect(done).toBe(true);
    expect(tl.isCompleted).toBe(true);
  });

  it('playbackRate scales call entry timing', () => {
    const fn = vi.fn();
    const tl = new Timeline();
    tl.call(fn, { at: 100 });
    tl.delay(200);
    tl.playbackRate = 2;

    tl.advance(40); // 40 × 2 = 80 ms — before callback
    expect(fn).not.toHaveBeenCalled();

    tl.advance(20); // 20 × 2 = 40 ms → total 120 ms — callback fires
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Timeline — seek / seekProgress / progress
// ---------------------------------------------------------------------------

describe('Timeline — seek / seekProgress / progress', () => {
  it('seek positions the playhead and applies tween values', () => {
    const obj = makeObj({ x: 0 });
    const tl = new Timeline();
    tl.to(obj, { x: 100 }, { duration: 100 });

    tl.seek(50);
    expect(obj.x).toBeCloseTo(50);
    expect(tl.elapsed).toBeCloseTo(50);
  });

  it('seek to 0 applies fromProps for fromTo entries', () => {
    const obj = makeObj({ x: 999 });
    const tl = new Timeline();
    tl.fromTo(obj, { x: 0 }, { x: 100 }, { duration: 100 });

    tl.advance(80); // obj.x = 80
    tl.seek(0);     // tween reset; fromTo onStart sets x=0 at t=0
    expect(obj.x).toBeCloseTo(0);
  });

  it('seek to totalDuration positions at the end', () => {
    const obj = makeObj({ x: 0 });
    const tl = new Timeline();
    tl.to(obj, { x: 100 }, { duration: 100 });

    tl.seek(100);
    expect(obj.x).toBeCloseTo(100);
  });

  it('seek clamps beyond totalDuration', () => {
    const obj = makeObj({ x: 0 });
    const tl = new Timeline();
    tl.to(obj, { x: 100 }, { duration: 100 });

    tl.seek(9999);
    expect(obj.x).toBeCloseTo(100);
  });

  it('seek does not invoke call entry callbacks', () => {
    const fn = vi.fn();
    const obj = makeObj();
    const tl = new Timeline();
    tl.to(obj, { x: 100 }, { duration: 200 });
    tl.call(fn, { at: 50 });

    tl.seek(100); // passes the callback position
    expect(fn).not.toHaveBeenCalled();
  });

  it('call entries after seek position are still triggered on advance', () => {
    const fn = vi.fn();
    const obj = makeObj();
    const tl = new Timeline();
    tl.to(obj, { x: 100 }, { duration: 200 });
    tl.call(fn, { at: 150 });

    tl.seek(100); // before callback
    expect(fn).not.toHaveBeenCalled();

    tl.advance(60); // crosses 150 ms mark
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('seekProgress jumps to normalised position', () => {
    const obj = makeObj({ x: 0 });
    const tl = new Timeline();
    tl.to(obj, { x: 100 }, { duration: 100 });

    tl.seekProgress(0.75);
    expect(obj.x).toBeCloseTo(75);
  });

  it('progress getter returns 0 before any advancement', () => {
    const tl = new Timeline();
    tl.to(makeObj(), { x: 100 }, { duration: 100 });
    expect(tl.progress).toBe(0);
  });

  it('progress getter reflects elapsed / totalDuration', () => {
    const obj = makeObj({ x: 0 });
    const tl = new Timeline();
    tl.to(obj, { x: 100 }, { duration: 100 });

    tl.advance(40);
    expect(tl.progress).toBeCloseTo(0.4);

    tl.advance(60);
    expect(tl.progress).toBe(1);
  });

  it('seek continues to play after repositioning', () => {
    const obj = makeObj({ x: 0 });
    const tl = new Timeline();
    tl.to(obj, { x: 100 }, { duration: 100 });

    tl.seek(30);          // jump to 30 ms
    tl.advance(20);       // advance 20 ms more → 50 ms total
    expect(obj.x).toBeCloseTo(50);
  });
});

// ---------------------------------------------------------------------------
// Timeline — reset
// ---------------------------------------------------------------------------

describe('Timeline — reset', () => {
  it('reset restores the timeline to initial state', () => {
    const obj = makeObj({ x: 0 });
    const tl = new Timeline();
    tl.to(obj, { x: 100 }, { duration: 100 });

    tl.advance(100); // complete
    expect(tl.isCompleted).toBe(true);

    tl.reset();
    expect(tl.isCompleted).toBe(false);
    expect(tl.isKilled).toBe(false);
    expect(tl.elapsed).toBe(0);
  });

  it('timeline replays after reset', () => {
    const obj = makeObj({ x: 0 });
    const tl = new Timeline();
    tl.to(obj, { x: 100 }, { duration: 100 });

    tl.advance(100); // complete, obj.x = 100
    tl.reset();
    obj.x = 0; // reset target for observation

    tl.advance(50); // 50% of replay → x = 50
    expect(obj.x).toBeCloseTo(50);
  });
});

// ---------------------------------------------------------------------------
// Timeline — repeat (finite)
// ---------------------------------------------------------------------------

describe('Timeline — repeat', () => {
  it('repeat: 2 plays the timeline 3 times then completes', () => {
    const obj = makeObj({ x: 0 });
    const tl = new Timeline({ repeat: 2 });
    tl.to(obj, { x: 100 }, { duration: 100 });

    // Cycle 1
    tl.advance(100);
    expect(tl.isCompleted).toBe(false);

    // Cycle 2
    tl.advance(100);
    expect(tl.isCompleted).toBe(false);

    // Cycle 3 — final play
    tl.advance(100);
    expect(tl.isCompleted).toBe(true);
  });

  it('repeat: -1 loops indefinitely', () => {
    const obj = makeObj({ x: 0 });
    const tl = new Timeline({ repeat: -1 });
    tl.to(obj, { x: 100 }, { duration: 100 });

    tl.advance(1000);
    expect(tl.isCompleted).toBe(false);
  });

  it('calls onComplete once after all repeats', () => {
    const obj = makeObj();
    const onComplete = vi.fn();
    const tl = new Timeline({ repeat: 1, onComplete });
    tl.to(obj, { x: 100 }, { duration: 100 });

    tl.advance(300); // 3 × 100 ms
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('repeat resets call entries between cycles', () => {
    const fn = vi.fn();
    const tl = new Timeline({ repeat: 1 });
    tl.call(fn, { at: 0 });
    tl.delay(100);

    tl.advance(100); // cycle 1 ends
    tl.advance(100); // cycle 2 ends
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

// ---------------------------------------------------------------------------
// Timeline — repeatDelay
// ---------------------------------------------------------------------------

describe('Timeline — repeatDelay', () => {
  it('does not complete during repeat delay', () => {
    const obj = makeObj({ x: 0 });
    const tl = new Timeline({ repeat: 1, repeatDelay: 50 });
    tl.to(obj, { x: 100 }, { duration: 100 });

    tl.advance(100); // cycle 1 done, enter repeat delay
    expect(tl.isCompleted).toBe(false);

    tl.advance(30);  // 30 ms into 50 ms delay
    expect(tl.isCompleted).toBe(false);
  });

  it('resumes animating after repeat delay expires', () => {
    const obj = makeObj({ x: 0 });
    const tl = new Timeline({ repeat: 1, repeatDelay: 50 });
    // Use fromTo so cycle 2 animates from 0→100 regardless of cycle 1 end state.
    tl.fromTo(obj, { x: 0 }, { x: 100 }, { duration: 100 });

    tl.advance(100); // cycle 1 done
    tl.advance(50);  // repeat delay expires (0 ms excess)
    tl.advance(50);  // 50 ms into cycle 2 → x = 50
    expect(obj.x).toBeCloseTo(50);
  });

  it('carries excess time past repeat delay boundary', () => {
    const obj = makeObj({ x: 0 });
    const tl = new Timeline({ repeat: 1, repeatDelay: 50 });
    // Use fromTo so cycle 2 always starts from 0.
    tl.fromTo(obj, { x: 0 }, { x: 100 }, { duration: 100 });

    // 100 ms cycle 1 + 50 ms delay + 30 ms into cycle 2 = 180 ms total
    tl.advance(180);
    expect(obj.x).toBeCloseTo(30);
    expect(tl.isCompleted).toBe(false);
  });
});
