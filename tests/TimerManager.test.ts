import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { TimerManager } from '../src/plugins/TimerManager.js';
import type { Core } from '../src/core/Core.js';
import type {
  TimerOnceParams,
  TimerIntervalParams,
  TimerCancelParams,
  TimerCooldownParams,
  TimerCooldownOutput,
  TimerFiredParams,
  TimerCancelledParams,
  TimerCancelAllOutput,
} from '../src/types/timer.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createStubCore(): Core {
  return { events: new EventBus(), dataRoot: '/' } as unknown as Core;
}

/** Simulate a frame tick of `elapsed` ms. */
function tick(core: Core, elapsed: number): void {
  core.events.emitSync('core/tick', { delta: 1, elapsed });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TimerManager', () => {
  let core: Core;
  let timer: TimerManager;

  beforeEach(() => {
    core = createStubCore();
    timer = new TimerManager();
    timer.init(core);
  });

  afterEach(() => {
    timer.destroy(core);
  });

  // -------------------------------------------------------------------------
  // timer/once
  // -------------------------------------------------------------------------

  describe('timer/once', () => {
    it('fires timer/fired once after delay elapses', () => {
      const handler = vi.fn();
      core.events.on('test', 'timer/fired', handler);

      core.events.emitSync<TimerOnceParams>('timer/once', { id: 'boom', delay: 500 });

      tick(core, 300);
      expect(handler).not.toHaveBeenCalled();

      tick(core, 300); // total 600 ms > 500 ms delay
      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0][0]).toMatchObject({ id: 'boom', count: 1 });
    });

    it('does not fire again after it has fired once', () => {
      const handler = vi.fn();
      core.events.on('test', 'timer/fired', handler);

      core.events.emitSync<TimerOnceParams>('timer/once', { id: 'once', delay: 100 });
      tick(core, 200);
      tick(core, 200);

      expect(handler).toHaveBeenCalledOnce();
    });

    it('fires on the exact tick when remaining reaches 0', () => {
      const handler = vi.fn();
      core.events.on('test', 'timer/fired', handler);

      core.events.emitSync<TimerOnceParams>('timer/once', { id: 'exact', delay: 100 });
      tick(core, 100);

      expect(handler).toHaveBeenCalledOnce();
    });

    it('re-registering with same id resets the timer', () => {
      const handler = vi.fn();
      core.events.on('test', 'timer/fired', handler);

      core.events.emitSync<TimerOnceParams>('timer/once', { id: 'reset', delay: 500 });
      tick(core, 300);

      // Reset before it fires
      core.events.emitSync<TimerOnceParams>('timer/once', { id: 'reset', delay: 500 });
      tick(core, 300); // 300 ms into the new timer — should not fire yet
      expect(handler).not.toHaveBeenCalled();

      tick(core, 300); // total 600 ms after reset — should fire
      expect(handler).toHaveBeenCalledOnce();
    });

    it('fires count = 1', () => {
      const handler = vi.fn();
      core.events.on('test', 'timer/fired', handler);

      core.events.emitSync<TimerOnceParams>('timer/once', { id: 'c', delay: 50 });
      tick(core, 100);

      expect(handler.mock.calls[0][0]).toMatchObject({ count: 1 });
    });
  });

  // -------------------------------------------------------------------------
  // timer/interval
  // -------------------------------------------------------------------------

  describe('timer/interval', () => {
    it('fires repeatedly at the specified interval', () => {
      const handler = vi.fn();
      core.events.on('test', 'timer/fired', handler);

      core.events.emitSync<TimerIntervalParams>('timer/interval', {
        id: 'tick',
        interval: 1000,
      });

      tick(core, 1000);
      expect(handler).toHaveBeenCalledTimes(1);

      tick(core, 1000);
      expect(handler).toHaveBeenCalledTimes(2);

      tick(core, 1000);
      expect(handler).toHaveBeenCalledTimes(3);
    });

    it('increments count on each fire', () => {
      const handler = vi.fn();
      core.events.on('test', 'timer/fired', handler);

      core.events.emitSync<TimerIntervalParams>('timer/interval', {
        id: 'c',
        interval: 100,
      });

      tick(core, 100);
      tick(core, 100);
      tick(core, 100);

      const counts = handler.mock.calls.map((c) => (c[0] as TimerFiredParams).count);
      expect(counts).toEqual([1, 2, 3]);
    });

    it('stops after repeat limit', () => {
      const handler = vi.fn();
      core.events.on('test', 'timer/fired', handler);

      core.events.emitSync<TimerIntervalParams>('timer/interval', {
        id: 'limited',
        interval: 100,
        repeat: 3,
      });

      for (let i = 0; i < 10; i++) tick(core, 100);

      expect(handler).toHaveBeenCalledTimes(3);
    });

    it('fires unlimited times when repeat is not specified', () => {
      const handler = vi.fn();
      core.events.on('test', 'timer/fired', handler);

      core.events.emitSync<TimerIntervalParams>('timer/interval', {
        id: 'forever',
        interval: 100,
      });

      for (let i = 0; i < 50; i++) tick(core, 100);

      expect(handler).toHaveBeenCalledTimes(50);
    });

    it('handles burst: multiple fires in a single large tick', () => {
      const handler = vi.fn();
      core.events.on('test', 'timer/fired', handler);

      core.events.emitSync<TimerIntervalParams>('timer/interval', {
        id: 'burst',
        interval: 100,
        repeat: 5,
      });

      tick(core, 500); // Should fire 5 times at once

      expect(handler).toHaveBeenCalledTimes(5);
    });

    it('re-registering with same id resets the interval timer', () => {
      const handler = vi.fn();
      core.events.on('test', 'timer/fired', handler);

      core.events.emitSync<TimerIntervalParams>('timer/interval', {
        id: 'reset',
        interval: 100,
        repeat: 2,
      });

      tick(core, 150); // fires once (count=1, remaining ~50 ms debt)

      // Reset
      core.events.emitSync<TimerIntervalParams>('timer/interval', {
        id: 'reset',
        interval: 200,
        repeat: 1,
      });

      // Old timer gone; need to wait full 200 ms now
      tick(core, 100);
      expect(handler).toHaveBeenCalledTimes(1); // only the first fire before reset

      tick(core, 150);
      expect(handler).toHaveBeenCalledTimes(2); // new timer fires once
    });
  });

  // -------------------------------------------------------------------------
  // timer/cancel
  // -------------------------------------------------------------------------

  describe('timer/cancel', () => {
    it('cancels a once timer and emits timer/cancelled', () => {
      const firedHandler = vi.fn();
      const cancelledHandler = vi.fn();
      core.events.on('test', 'timer/fired', firedHandler);
      core.events.on('test', 'timer/cancelled', cancelledHandler);

      core.events.emitSync<TimerOnceParams>('timer/once', { id: 'cancel-me', delay: 500 });
      core.events.emitSync<TimerCancelParams>('timer/cancel', { id: 'cancel-me' });

      tick(core, 1000);

      expect(firedHandler).not.toHaveBeenCalled();
      expect(cancelledHandler).toHaveBeenCalledOnce();
      expect(cancelledHandler.mock.calls[0][0]).toMatchObject({ id: 'cancel-me' });
    });

    it('cancels an interval timer', () => {
      const handler = vi.fn();
      core.events.on('test', 'timer/fired', handler);

      core.events.emitSync<TimerIntervalParams>('timer/interval', {
        id: 'stop',
        interval: 100,
      });

      tick(core, 100);
      expect(handler).toHaveBeenCalledTimes(1);

      core.events.emitSync<TimerCancelParams>('timer/cancel', { id: 'stop' });

      tick(core, 200);
      expect(handler).toHaveBeenCalledTimes(1); // no additional fires
    });

    it('does not emit timer/cancelled when id is unknown', () => {
      const handler = vi.fn();
      core.events.on('test', 'timer/cancelled', handler);

      core.events.emitSync<TimerCancelParams>('timer/cancel', { id: 'ghost' });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // timer/cooldown
  // -------------------------------------------------------------------------

  describe('timer/cooldown', () => {
    it('starts a cooldown and reports not ready immediately', () => {
      const { output } = core.events.emitSync<TimerCooldownParams, TimerCooldownOutput>(
        'timer/cooldown',
        { id: 'attack', duration: 1000 },
      );
      expect(output.ready).toBe(false);
    });

    it('reports ready after the cooldown duration elapses', () => {
      core.events.emitSync<TimerCooldownParams>('timer/cooldown', {
        id: 'attack',
        duration: 500,
      });

      tick(core, 400);
      const { output: notYet } = core.events.emitSync<TimerCooldownParams, TimerCooldownOutput>(
        'timer/cooldown',
        { id: 'attack' },
      );
      expect(notYet.ready).toBe(false);

      tick(core, 200); // total 600 ms > 500 ms
      const { output: ready } = core.events.emitSync<TimerCooldownParams, TimerCooldownOutput>(
        'timer/cooldown',
        { id: 'attack' },
      );
      expect(ready.ready).toBe(true);
    });

    it('reports ready for an unknown cooldown id', () => {
      const { output } = core.events.emitSync<TimerCooldownParams, TimerCooldownOutput>(
        'timer/cooldown',
        { id: 'unknown' },
      );
      expect(output.ready).toBe(true);
    });

    it('resets the cooldown when duration is provided again', () => {
      core.events.emitSync<TimerCooldownParams>('timer/cooldown', {
        id: 'dash',
        duration: 300,
      });
      tick(core, 400); // cooldown elapsed

      // Reset
      core.events.emitSync<TimerCooldownParams>('timer/cooldown', {
        id: 'dash',
        duration: 300,
      });

      const { output } = core.events.emitSync<TimerCooldownParams, TimerCooldownOutput>(
        'timer/cooldown',
        { id: 'dash' },
      );
      expect(output.ready).toBe(false);
    });

    it('timer/cancel clears a cooldown and emits timer/cancelled', () => {
      const handler = vi.fn();
      core.events.on('test', 'timer/cancelled', handler);

      core.events.emitSync<TimerCooldownParams>('timer/cooldown', {
        id: 'dash',
        duration: 1000,
      });
      core.events.emitSync<TimerCancelParams>('timer/cancel', { id: 'dash' });

      expect(handler).toHaveBeenCalledOnce();

      const { output } = core.events.emitSync<TimerCooldownParams, TimerCooldownOutput>(
        'timer/cooldown',
        { id: 'dash' },
      );
      expect(output.ready).toBe(true); // cancelled = no active cooldown
    });
  });

  // -------------------------------------------------------------------------
  // Pause / resume
  // -------------------------------------------------------------------------

  describe('pause / resume', () => {
    it('freezes timers while paused', () => {
      const handler = vi.fn();
      core.events.on('test', 'timer/fired', handler);

      core.events.emitSync<TimerOnceParams>('timer/once', { id: 'p', delay: 500 });

      tick(core, 200);
      core.events.emitSync('core/pause', { core });
      tick(core, 400); // paused: should not count
      core.events.emitSync('core/resume', { core });

      // Still 300 ms remaining after resume
      tick(core, 200);
      expect(handler).not.toHaveBeenCalled();

      tick(core, 200);
      expect(handler).toHaveBeenCalledOnce();
    });

    it('freezes cooldowns while paused', () => {
      core.events.emitSync<TimerCooldownParams>('timer/cooldown', {
        id: 'cd',
        duration: 500,
      });

      tick(core, 200);
      core.events.emitSync('core/pause', { core });
      tick(core, 400); // paused: should not count
      core.events.emitSync('core/resume', { core });

      tick(core, 200); // total counting time: 400 ms — still not ready
      const { output: notYet } = core.events.emitSync<TimerCooldownParams, TimerCooldownOutput>(
        'timer/cooldown',
        { id: 'cd' },
      );
      expect(notYet.ready).toBe(false);

      tick(core, 200); // total 600 ms > 500 ms — ready
      const { output } = core.events.emitSync<TimerCooldownParams, TimerCooldownOutput>(
        'timer/cooldown',
        { id: 'cd' },
      );
      expect(output.ready).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // destroy()
  // -------------------------------------------------------------------------

  describe('destroy()', () => {
    it('stops all timers after destroy', () => {
      const handler = vi.fn();
      core.events.on('test', 'timer/fired', handler);

      core.events.emitSync<TimerOnceParams>('timer/once', { id: 'x', delay: 100 });
      timer.destroy(core);

      tick(core, 200);
      expect(handler).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // timer/cancel-all
  // -------------------------------------------------------------------------

  describe('timer/cancel-all', () => {
    it('cancels all active timers and emits timer/cancelled for each', () => {
      const cancelledHandler = vi.fn();
      const firedHandler = vi.fn();
      core.events.on('test', 'timer/cancelled', cancelledHandler);
      core.events.on('test', 'timer/fired', firedHandler);

      core.events.emitSync<TimerOnceParams>('timer/once', { id: 'a', delay: 500 });
      core.events.emitSync<TimerIntervalParams>('timer/interval', { id: 'b', interval: 200 });

      const { output } = core.events.emitSync<Record<string, never>, TimerCancelAllOutput>(
        'timer/cancel-all',
        {},
      );

      expect(output.cancelledCount).toBe(2);
      expect(cancelledHandler).toHaveBeenCalledTimes(2);
      const ids = cancelledHandler.mock.calls.map((c) => (c[0] as TimerCancelledParams).id);
      expect(ids).toContain('a');
      expect(ids).toContain('b');

      tick(core, 1000);
      expect(firedHandler).not.toHaveBeenCalled();
    });

    it('cancels cooldowns too', () => {
      const cancelledHandler = vi.fn();
      core.events.on('test', 'timer/cancelled', cancelledHandler);

      core.events.emitSync<TimerCooldownParams>('timer/cooldown', { id: 'cd', duration: 1000 });

      const { output } = core.events.emitSync<Record<string, never>, TimerCancelAllOutput>(
        'timer/cancel-all',
        {},
      );

      expect(output.cancelledCount).toBe(1);
      expect(cancelledHandler).toHaveBeenCalledOnce();

      const { output: query } = core.events.emitSync<TimerCooldownParams, TimerCooldownOutput>(
        'timer/cooldown',
        { id: 'cd' },
      );
      expect(query.ready).toBe(true);
    });

    it('returns cancelledCount = 0 when nothing is active', () => {
      const { output } = core.events.emitSync<Record<string, never>, TimerCancelAllOutput>(
        'timer/cancel-all',
        {},
      );
      expect(output.cancelledCount).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Interval burst safety cap
  // -------------------------------------------------------------------------

  describe('interval burst safety cap', () => {
    it('fires at most MAX_BURST_FIRES (10) times in a single oversized tick', () => {
      const handler = vi.fn();
      core.events.on('test', 'timer/fired', handler);

      core.events.emitSync<TimerIntervalParams>('timer/interval', {
        id: 'burst',
        interval: 100,
      });

      // A 10 000 ms tick would be 100 fires without a cap.
      tick(core, 10_000);

      expect(handler).toHaveBeenCalledTimes(10);
    });
  });

  // -------------------------------------------------------------------------
  // Direct accessor methods
  // -------------------------------------------------------------------------

  describe('isTimerActive()', () => {
    it('returns true while a once timer is pending', () => {
      core.events.emitSync<TimerOnceParams>('timer/once', { id: 'p', delay: 500 });
      expect(timer.isTimerActive('p')).toBe(true);
    });

    it('returns false after a once timer fires', () => {
      core.events.emitSync<TimerOnceParams>('timer/once', { id: 'p', delay: 100 });
      tick(core, 200);
      expect(timer.isTimerActive('p')).toBe(false);
    });

    it('returns true while an interval timer is running', () => {
      core.events.emitSync<TimerIntervalParams>('timer/interval', { id: 'iv', interval: 100 });
      tick(core, 50);
      expect(timer.isTimerActive('iv')).toBe(true);
    });

    it('returns false after an interval timer is cancelled', () => {
      core.events.emitSync<TimerIntervalParams>('timer/interval', { id: 'iv', interval: 100 });
      core.events.emitSync<TimerCancelParams>('timer/cancel', { id: 'iv' });
      expect(timer.isTimerActive('iv')).toBe(false);
    });

    it('returns false for an unknown id', () => {
      expect(timer.isTimerActive('ghost')).toBe(false);
    });
  });

  describe('getTimeRemaining()', () => {
    it('returns the full delay before any tick', () => {
      core.events.emitSync<TimerOnceParams>('timer/once', { id: 'r', delay: 500 });
      expect(timer.getTimeRemaining('r')).toBe(500);
    });

    it('decreases after a tick', () => {
      core.events.emitSync<TimerOnceParams>('timer/once', { id: 'r', delay: 500 });
      tick(core, 200);
      expect(timer.getTimeRemaining('r')).toBeCloseTo(300);
    });

    it('returns 0 for an unknown id', () => {
      expect(timer.getTimeRemaining('ghost')).toBe(0);
    });

    it('returns 0 after the timer has fired', () => {
      core.events.emitSync<TimerOnceParams>('timer/once', { id: 'r', delay: 100 });
      tick(core, 200);
      expect(timer.getTimeRemaining('r')).toBe(0);
    });
  });

  describe('getCooldownProgress()', () => {
    it('returns 0 immediately after cooldown starts', () => {
      core.events.emitSync<TimerCooldownParams>('timer/cooldown', { id: 'cd', duration: 1000 });
      expect(timer.getCooldownProgress('cd')).toBeCloseTo(0);
    });

    it('returns 0.5 when half the duration has elapsed', () => {
      core.events.emitSync<TimerCooldownParams>('timer/cooldown', { id: 'cd', duration: 1000 });
      tick(core, 500);
      expect(timer.getCooldownProgress('cd')).toBeCloseTo(0.5);
    });

    it('returns 1 when the cooldown is complete', () => {
      core.events.emitSync<TimerCooldownParams>('timer/cooldown', { id: 'cd', duration: 500 });
      tick(core, 600);
      expect(timer.getCooldownProgress('cd')).toBe(1);
    });

    it('returns 1 for an unknown id', () => {
      expect(timer.getCooldownProgress('ghost')).toBe(1);
    });
  });
});
