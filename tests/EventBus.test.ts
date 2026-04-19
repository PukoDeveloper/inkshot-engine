import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  // -------------------------------------------------------------------------
  // Basic registration and dispatch
  // -------------------------------------------------------------------------

  describe('on / emitSync', () => {
    it('calls a registered handler with params and output', () => {
      const handler = vi.fn((_params, output: Record<string, number>) => {
        output.value = 42;
      });

      bus.on('test', 'ns/event', handler);
      const { output } = bus.emitSync<{ data: string }, { value: number }>(
        'ns/event',
        { data: 'hello' },
      );

      expect(handler).toHaveBeenCalledOnce();
      expect(output.value).toBe(42);
    });

    it('returns an empty output when no handlers are registered', () => {
      const { output } = bus.emitSync('ns/noop', {});
      expect(output).toEqual({});
    });

    it('seeds the output object when provided', () => {
      bus.on('test', 'ns/seeded', (_params, output: { count: number }) => {
        output.count += 1;
      });

      const { output } = bus.emitSync('ns/seeded', {}, { count: 10 });
      expect(output.count).toBe(11);
    });
  });

  // -------------------------------------------------------------------------
  // Three-phase dispatch order
  // -------------------------------------------------------------------------

  describe('three-phase dispatch', () => {
    it('fires handlers in order: before → main → after', () => {
      const order: string[] = [];

      bus.on('test', 'ns/phases', () => { order.push('main'); });
      bus.on('test', 'ns/phases', () => { order.push('before'); }, { phase: 'before' });
      bus.on('test', 'ns/phases', () => { order.push('after'); }, { phase: 'after' });

      bus.emitSync('ns/phases', {});
      expect(order).toEqual(['before', 'main', 'after']);
    });

    it('fires all three phases for async emit', async () => {
      const order: string[] = [];

      bus.on('test', 'ns/async-phases', () => { order.push('before'); }, { phase: 'before' });
      bus.on('test', 'ns/async-phases', () => { order.push('main'); });
      bus.on('test', 'ns/async-phases', () => { order.push('after'); }, { phase: 'after' });

      await bus.emit('ns/async-phases', {});
      expect(order).toEqual(['before', 'main', 'after']);
    });
  });

  // -------------------------------------------------------------------------
  // Priority ordering
  // -------------------------------------------------------------------------

  describe('priority ordering', () => {
    it('runs higher-priority handlers first within the same phase', () => {
      const order: number[] = [];

      bus.on('test', 'ns/prio', () => { order.push(0); }, { priority: 0 });
      bus.on('test', 'ns/prio', () => { order.push(100); }, { priority: 100 });
      bus.on('test', 'ns/prio', () => { order.push(50); }, { priority: 50 });

      bus.emitSync('ns/prio', {});
      expect(order).toEqual([100, 50, 0]);
    });

    it('runs same-priority handlers in registration order', () => {
      const order: string[] = [];

      bus.on('test', 'ns/same-prio', () => { order.push('first'); });
      bus.on('test', 'ns/same-prio', () => { order.push('second'); });
      bus.on('test', 'ns/same-prio', () => { order.push('third'); });

      bus.emitSync('ns/same-prio', {});
      expect(order).toEqual(['first', 'second', 'third']);
    });
  });

  // -------------------------------------------------------------------------
  // Flow control: break()
  // -------------------------------------------------------------------------

  describe('control.break()', () => {
    it('stops all remaining handlers and phases', () => {
      const order: string[] = [];

      bus.on('test', 'ns/break', () => { order.push('before'); }, { phase: 'before' });
      bus.on('test', 'ns/break', (_p, _o, control) => {
        order.push('main-breaker');
        control.break();
      });
      bus.on('test', 'ns/break', () => { order.push('main-after-break'); });
      bus.on('test', 'ns/break', () => { order.push('after'); }, { phase: 'after' });

      const { stopped } = bus.emitSync('ns/break', {});
      expect(order).toEqual(['before', 'main-breaker']);
      expect(stopped).toBe(true);
    });

    it('works with async emit', async () => {
      bus.on('test', 'ns/async-break', (_p, _o, control) => { control.break(); });
      bus.on('test', 'ns/async-break', () => { throw new Error('should not run'); });

      const { stopped } = await bus.emit('ns/async-break', {});
      expect(stopped).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Flow control: skipPhase()
  // -------------------------------------------------------------------------

  describe('control.skipPhase()', () => {
    it('skips remaining handlers in the current phase but continues to the next', () => {
      const order: string[] = [];

      bus.on('test', 'ns/skip', (_p, _o, control) => {
        order.push('before-1');
        control.skipPhase();
      }, { phase: 'before' });
      bus.on('test', 'ns/skip', () => { order.push('before-2'); }, { phase: 'before' });
      bus.on('test', 'ns/skip', () => { order.push('main'); });
      bus.on('test', 'ns/skip', () => { order.push('after'); }, { phase: 'after' });

      bus.emitSync('ns/skip', {});
      expect(order).toEqual(['before-1', 'main', 'after']);
    });
  });

  // -------------------------------------------------------------------------
  // once()
  // -------------------------------------------------------------------------

  describe('once()', () => {
    it('fires the handler only once then auto-unregisters', () => {
      const handler = vi.fn();

      bus.once('test', 'ns/once', handler);
      bus.emitSync('ns/once', {});
      bus.emitSync('ns/once', {});

      expect(handler).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // Unregistration
  // -------------------------------------------------------------------------

  describe('unregistration', () => {
    it('on() returns an unregister function', () => {
      const handler = vi.fn();
      const off = bus.on('test', 'ns/off', handler);

      off();
      bus.emitSync('ns/off', {});

      expect(handler).not.toHaveBeenCalled();
    });

    it('once() returns an unregister function', () => {
      const handler = vi.fn();
      const off = bus.once('test', 'ns/once-off', handler);

      off();
      bus.emitSync('ns/once-off', {});

      expect(handler).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // removeNamespace()
  // -------------------------------------------------------------------------

  describe('removeNamespace()', () => {
    it('removes all handlers registered under a namespace', () => {
      const handlerA = vi.fn();
      const handlerB = vi.fn();
      const handlerOther = vi.fn();

      bus.on('pluginA', 'ns/shared', handlerA);
      bus.on('pluginA', 'ns/shared', handlerB, { phase: 'after' });
      bus.on('pluginB', 'ns/shared', handlerOther);

      bus.removeNamespace('pluginA');
      bus.emitSync('ns/shared', {});

      expect(handlerA).not.toHaveBeenCalled();
      expect(handlerB).not.toHaveBeenCalled();
      expect(handlerOther).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // clear()
  // -------------------------------------------------------------------------

  describe('clear()', () => {
    it('removes all registered handlers', () => {
      const handler = vi.fn();
      bus.on('test', 'ns/clear', handler);
      bus.clear();
      bus.emitSync('ns/clear', {});
      expect(handler).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Output accumulation across handlers
  // -------------------------------------------------------------------------

  describe('output accumulation', () => {
    it('multiple handlers can write to the same output object', () => {
      bus.on('a', 'ns/acc', (_p, output: Record<string, number>) => {
        output.a = 1;
      });
      bus.on('b', 'ns/acc', (_p, output: Record<string, number>) => {
        output.b = 2;
      });
      bus.on('c', 'ns/acc', (_p, output: Record<string, number>) => {
        output.c = (output.a ?? 0) + (output.b ?? 0);
      }, { phase: 'after' });

      const { output } = bus.emitSync('ns/acc', {});
      expect(output).toEqual({ a: 1, b: 2, c: 3 });
    });
  });

  // -------------------------------------------------------------------------
  // Async handler support
  // -------------------------------------------------------------------------

  describe('async emit', () => {
    it('awaits async handlers in order', async () => {
      const order: number[] = [];

      bus.on('test', 'ns/async', async () => {
        await new Promise((r) => setTimeout(r, 10));
        order.push(1);
      });
      bus.on('test', 'ns/async', async () => {
        order.push(2);
      });

      await bus.emit('ns/async', {});
      expect(order).toEqual([1, 2]);
    });
  });
});
