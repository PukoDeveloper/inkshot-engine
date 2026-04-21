// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { InputManager } from '../src/plugins/input/InputManager.js';
import type { Core } from '../src/core/Core.js';
import type {
  InputTouchStartParams,
  InputTouchEndParams,
  InputTouchMoveParams,
  InputGesturePinchParams,
  InputGestureRotateParams,
  InputGestureSwipeParams,
  InputTouchStateOutput,
  InputActionTriggeredParams,
} from '../src/types/input.js';

function createStubCore(): Core {
  return { events: new EventBus(), dataRoot: '/' } as unknown as Core;
}

/** Dispatch a PointerEvent with pointerType='touch' on window. */
function fireTouch(
  type: 'pointerdown' | 'pointerup' | 'pointermove' | 'pointercancel',
  opts: { pointerId?: number; clientX?: number; clientY?: number } = {},
): void {
  window.dispatchEvent(
    new PointerEvent(type, {
      pointerId: opts.pointerId ?? 1,
      clientX: opts.clientX ?? 0,
      clientY: opts.clientY ?? 0,
      pointerType: 'touch',
      bubbles: true,
    }),
  );
}

function tick(core: Core): void {
  core.events.emitSync('core/tick', { delta: 1, elapsed: 16 });
}

describe('InputManager — Touch & Gesture support', () => {
  let core: Core;
  let input: InputManager;

  beforeEach(() => {
    core = createStubCore();
    input = new InputManager();
    input.init(core);
  });

  afterEach(() => {
    input.destroy(core);
  });

  // -------------------------------------------------------------------------
  // touch:start / touch:end
  // -------------------------------------------------------------------------

  describe('input/touch:start and input/touch:end', () => {
    it('emits input/touch:start when a touch begins', () => {
      const handler = vi.fn();
      core.events.on('test', 'input/touch:start', handler);

      fireTouch('pointerdown', { pointerId: 1, clientX: 100, clientY: 200 });

      expect(handler).toHaveBeenCalledOnce();
      const params = handler.mock.calls[0]![0] as InputTouchStartParams;
      expect(params.pointerId).toBe(1);
      expect(params.x).toBe(100);
      expect(params.y).toBe(200);
    });

    it('emits input/touch:end when a touch lifts', () => {
      const handler = vi.fn();
      core.events.on('test', 'input/touch:end', handler);

      fireTouch('pointerdown', { pointerId: 1, clientX: 10, clientY: 20 });
      fireTouch('pointerup', { pointerId: 1, clientX: 10, clientY: 20 });

      expect(handler).toHaveBeenCalledOnce();
      const params = handler.mock.calls[0]![0] as InputTouchEndParams;
      expect(params.pointerId).toBe(1);
    });

    it('emits input/touch:end on pointercancel', () => {
      const handler = vi.fn();
      core.events.on('test', 'input/touch:end', handler);

      fireTouch('pointerdown', { pointerId: 2 });
      fireTouch('pointercancel', { pointerId: 2 });

      expect(handler).toHaveBeenCalledOnce();
    });

    it('does NOT emit pointer:down/up for touch pointers', () => {
      const downHandler = vi.fn();
      const upHandler = vi.fn();
      core.events.on('test', 'input/pointer:down', downHandler);
      core.events.on('test', 'input/pointer:up', upHandler);

      fireTouch('pointerdown', { pointerId: 1 });
      fireTouch('pointerup', { pointerId: 1 });

      expect(downHandler).not.toHaveBeenCalled();
      expect(upHandler).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // touch:move (throttled)
  // -------------------------------------------------------------------------

  describe('input/touch:move throttle', () => {
    it('batches touch moves and emits once per core/tick per touch point', () => {
      const handler = vi.fn();
      core.events.on('test', 'input/touch:move', handler);

      fireTouch('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 });
      fireTouch('pointermove', { pointerId: 1, clientX: 10, clientY: 10 });
      fireTouch('pointermove', { pointerId: 1, clientX: 20, clientY: 20 });
      fireTouch('pointermove', { pointerId: 1, clientX: 30, clientY: 30 });

      // No event yet
      expect(handler).not.toHaveBeenCalled();

      tick(core);

      expect(handler).toHaveBeenCalledOnce();
      const params = handler.mock.calls[0]![0] as InputTouchMoveParams;
      expect(params.pointerId).toBe(1);
      expect(params.x).toBe(30);
      expect(params.y).toBe(30);
    });

    it('does not emit touch:move if no movement occurred', () => {
      const handler = vi.fn();
      core.events.on('test', 'input/touch:move', handler);

      fireTouch('pointerdown', { pointerId: 1 });
      tick(core);

      expect(handler).not.toHaveBeenCalled();
    });

    it('reports correct dx/dy relative to last emission', () => {
      const handler = vi.fn();
      core.events.on('test', 'input/touch:move', handler);

      fireTouch('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 });
      fireTouch('pointermove', { pointerId: 1, clientX: 10, clientY: 5 });
      tick(core); // first flush: dx=10, dy=5

      fireTouch('pointermove', { pointerId: 1, clientX: 14, clientY: 8 });
      tick(core); // second flush: dx=4, dy=3

      expect(handler).toHaveBeenCalledTimes(2);
      const second = handler.mock.calls[1]![0] as InputTouchMoveParams;
      expect(second.dx).toBe(4);
      expect(second.dy).toBe(3);
    });

    it('handles multiple simultaneous touch points independently', () => {
      const handler = vi.fn();
      core.events.on('test', 'input/touch:move', handler);

      fireTouch('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 });
      fireTouch('pointerdown', { pointerId: 2, clientX: 100, clientY: 0 });
      fireTouch('pointermove', { pointerId: 1, clientX: 5, clientY: 0 });
      fireTouch('pointermove', { pointerId: 2, clientX: 105, clientY: 0 });

      tick(core);

      expect(handler).toHaveBeenCalledTimes(2);
      const ids = handler.mock.calls.map((c) => (c[0] as InputTouchMoveParams).pointerId);
      expect(ids).toContain(1);
      expect(ids).toContain(2);
    });
  });

  // -------------------------------------------------------------------------
  // input/touch:state (pull query)
  // -------------------------------------------------------------------------

  describe('input/touch:state pull query', () => {
    it('returns active touch points', () => {
      fireTouch('pointerdown', { pointerId: 1, clientX: 50, clientY: 60 });

      const { output } = core.events.emitSync<Record<string, never>, InputTouchStateOutput>(
        'input/touch:state',
        {},
      );

      expect(output.touches.size).toBe(1);
      expect(output.touches.get(1)).toEqual({ x: 50, y: 60 });
    });

    it('removes touch from state after lift', () => {
      fireTouch('pointerdown', { pointerId: 1 });
      fireTouch('pointerup', { pointerId: 1 });

      const { output } = core.events.emitSync<Record<string, never>, InputTouchStateOutput>(
        'input/touch:state',
        {},
      );

      expect(output.touches.size).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // getActiveTouches() accessor
  // -------------------------------------------------------------------------

  describe('getActiveTouches() accessor', () => {
    it('returns all currently active touch points', () => {
      fireTouch('pointerdown', { pointerId: 1, clientX: 10, clientY: 20 });
      fireTouch('pointerdown', { pointerId: 2, clientX: 30, clientY: 40 });

      const touches = input.getActiveTouches();
      expect(touches.size).toBe(2);
      expect(touches.get(1)).toEqual({ x: 10, y: 20 });
      expect(touches.get(2)).toEqual({ x: 30, y: 40 });
    });

    it('returns an empty map when no touches are active', () => {
      expect(input.getActiveTouches().size).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Swipe gesture
  // -------------------------------------------------------------------------

  describe('input/gesture:swipe', () => {
    /** Fire a touch that travels a sufficient distance quickly. */
    function performSwipe(
      startX: number,
      startY: number,
      endX: number,
      endY: number,
    ): void {
      fireTouch('pointerdown', { pointerId: 1, clientX: startX, clientY: startY });
      fireTouch('pointermove', { pointerId: 1, clientX: endX, clientY: endY });
      fireTouch('pointerup', { pointerId: 1, clientX: endX, clientY: endY });
    }

    it('detects a right swipe', () => {
      const handler = vi.fn();
      core.events.on('test', 'input/gesture:swipe', handler);

      performSwipe(0, 0, 100, 0);

      expect(handler).toHaveBeenCalledOnce();
      expect((handler.mock.calls[0]![0] as InputGestureSwipeParams).direction).toBe('right');
    });

    it('detects a left swipe', () => {
      const handler = vi.fn();
      core.events.on('test', 'input/gesture:swipe', handler);

      performSwipe(100, 0, 0, 0);

      expect(handler).toHaveBeenCalledOnce();
      expect((handler.mock.calls[0]![0] as InputGestureSwipeParams).direction).toBe('left');
    });

    it('detects a down swipe', () => {
      const handler = vi.fn();
      core.events.on('test', 'input/gesture:swipe', handler);

      performSwipe(0, 0, 0, 100);

      expect(handler).toHaveBeenCalledOnce();
      expect((handler.mock.calls[0]![0] as InputGestureSwipeParams).direction).toBe('down');
    });

    it('detects an up swipe', () => {
      const handler = vi.fn();
      core.events.on('test', 'input/gesture:swipe', handler);

      performSwipe(0, 100, 0, 0);

      expect(handler).toHaveBeenCalledOnce();
      expect((handler.mock.calls[0]![0] as InputGestureSwipeParams).direction).toBe('up');
    });

    it('carries distance and position metadata', () => {
      const handler = vi.fn();
      core.events.on('test', 'input/gesture:swipe', handler);

      performSwipe(10, 20, 110, 20); // 100px horizontal swipe

      const params = handler.mock.calls[0]![0] as InputGestureSwipeParams;
      expect(params.startX).toBe(10);
      expect(params.startY).toBe(20);
      expect(params.endX).toBe(110);
      expect(params.endY).toBe(20);
      expect(params.distance).toBeCloseTo(100);
    });

    it('does not fire for a short tap', () => {
      const handler = vi.fn();
      core.events.on('test', 'input/gesture:swipe', handler);

      // Move only 5px — below the 30px threshold.
      fireTouch('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 });
      fireTouch('pointerup', { pointerId: 1, clientX: 5, clientY: 0 });

      expect(handler).not.toHaveBeenCalled();
    });

    it('does not fire during two-finger contact', () => {
      const handler = vi.fn();
      core.events.on('test', 'input/gesture:swipe', handler);

      // Two fingers down, then one lifts while still far from original position.
      fireTouch('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 });
      fireTouch('pointerdown', { pointerId: 2, clientX: 200, clientY: 0 });
      fireTouch('pointerup', { pointerId: 1, clientX: 200, clientY: 0 });

      expect(handler).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Gesture-to-action binding
  // -------------------------------------------------------------------------

  describe('gesture action bindings', () => {
    it('triggers bound action on swipe-right', () => {
      const handler = vi.fn();
      core.events.on('test', 'input/action:triggered', handler);

      core.events.emitSync('input/action:bind', {
        action: 'dash-right',
        codes: ['Gesture:swipe:right'],
      });

      // Perform a right swipe.
      fireTouch('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 });
      fireTouch('pointermove', { pointerId: 1, clientX: 100, clientY: 0 });
      fireTouch('pointerup', { pointerId: 1, clientX: 100, clientY: 0 });

      const pressed = handler.mock.calls.find(
        (c) =>
          (c[0] as InputActionTriggeredParams).action === 'dash-right' &&
          (c[0] as InputActionTriggeredParams).state === 'pressed',
      );
      expect(pressed).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Pinch gesture
  // -------------------------------------------------------------------------

  describe('input/gesture:pinch', () => {
    it('emits pinch events when two fingers are active and move', () => {
      const handler = vi.fn();
      core.events.on('test', 'input/gesture:pinch', handler);

      // Place two fingers.
      fireTouch('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 });
      fireTouch('pointerdown', { pointerId: 2, clientX: 100, clientY: 0 });

      // Move one finger to change the distance.
      fireTouch('pointermove', { pointerId: 2, clientX: 200, clientY: 0 });

      tick(core);

      expect(handler).toHaveBeenCalledOnce();
      const params = handler.mock.calls[0]![0] as InputGesturePinchParams;
      // Initial distance = 100, new distance = 200 → scale = 2.
      expect(params.scale).toBeCloseTo(2);
    });

    it('carries center point', () => {
      const handler = vi.fn();
      core.events.on('test', 'input/gesture:pinch', handler);

      // Two fingers at (0,0) and (100,0): center = (50, 0).
      fireTouch('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 });
      fireTouch('pointerdown', { pointerId: 2, clientX: 100, clientY: 0 });
      fireTouch('pointermove', { pointerId: 2, clientX: 102, clientY: 0 });
      tick(core);

      const params = handler.mock.calls[0]![0] as InputGesturePinchParams;
      // After the move, finger 2 is at 102, center ≈ (51, 0).
      expect(params.centerX).toBeCloseTo(51);
      expect(params.centerY).toBeCloseTo(0);
    });

    it('does not emit pinch with fewer than two active touches', () => {
      const handler = vi.fn();
      core.events.on('test', 'input/gesture:pinch', handler);

      fireTouch('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 });
      fireTouch('pointermove', { pointerId: 1, clientX: 50, clientY: 0 });

      tick(core);
      expect(handler).not.toHaveBeenCalled();
    });

    it('triggers Gesture:pinch:out action when fingers spread', () => {
      const handler = vi.fn();
      core.events.on('test', 'input/action:triggered', handler);

      core.events.emitSync('input/action:bind', {
        action: 'zoom-in',
        codes: ['Gesture:pinch:out'],
      });

      fireTouch('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 });
      fireTouch('pointerdown', { pointerId: 2, clientX: 100, clientY: 0 });
      // Large spread: new distance = 300 (delta ≈ 3 > 1.02).
      fireTouch('pointermove', { pointerId: 2, clientX: 300, clientY: 0 });
      tick(core);

      const pressed = handler.mock.calls.find(
        (c) =>
          (c[0] as InputActionTriggeredParams).action === 'zoom-in' &&
          (c[0] as InputActionTriggeredParams).state === 'pressed',
      );
      expect(pressed).toBeDefined();
    });

    it('triggers Gesture:pinch:in action when fingers close', () => {
      const handler = vi.fn();
      core.events.on('test', 'input/action:triggered', handler);

      core.events.emitSync('input/action:bind', {
        action: 'zoom-out',
        codes: ['Gesture:pinch:in'],
      });

      fireTouch('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 });
      fireTouch('pointerdown', { pointerId: 2, clientX: 100, clientY: 0 });
      // Large pinch-in: new distance = 10 (delta ≈ 0.1 < 0.98).
      fireTouch('pointermove', { pointerId: 2, clientX: 10, clientY: 0 });
      tick(core);

      const pressed = handler.mock.calls.find(
        (c) =>
          (c[0] as InputActionTriggeredParams).action === 'zoom-out' &&
          (c[0] as InputActionTriggeredParams).state === 'pressed',
      );
      expect(pressed).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // Rotate gesture
  // -------------------------------------------------------------------------

  describe('input/gesture:rotate', () => {
    it('emits rotate events when two fingers are active and the angle changes', () => {
      const handler = vi.fn();
      core.events.on('test', 'input/gesture:rotate', handler);

      // Start: finger 1 at (0,0), finger 2 at (100,0) → angle = 0.
      fireTouch('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 });
      fireTouch('pointerdown', { pointerId: 2, clientX: 100, clientY: 0 });

      // Rotate: finger 2 moves to (0,100) → angle = π/2.
      fireTouch('pointermove', { pointerId: 2, clientX: 0, clientY: 100 });
      tick(core);

      expect(handler).toHaveBeenCalledOnce();
      const params = handler.mock.calls[0]![0] as InputGestureRotateParams;
      expect(params.delta).toBeCloseTo(Math.PI / 2, 2);
      expect(params.rotation).toBeCloseTo(Math.PI / 2, 2);
    });

    it('accumulates rotation over multiple frames', () => {
      const handler = vi.fn();
      core.events.on('test', 'input/gesture:rotate', handler);

      fireTouch('pointerdown', { pointerId: 1, clientX: 0, clientY: 0 });
      fireTouch('pointerdown', { pointerId: 2, clientX: 100, clientY: 0 });

      // First quarter turn.
      fireTouch('pointermove', { pointerId: 2, clientX: 0, clientY: 100 });
      tick(core);

      // Second quarter turn.
      fireTouch('pointermove', { pointerId: 2, clientX: -100, clientY: 0 });
      tick(core);

      const last = handler.mock.calls.at(-1)![0] as InputGestureRotateParams;
      expect(last.rotation).toBeCloseTo(Math.PI, 1);
    });
  });

  // -------------------------------------------------------------------------
  // Blur clears touch state
  // -------------------------------------------------------------------------

  describe('window blur', () => {
    it('clears all active touches on blur', () => {
      fireTouch('pointerdown', { pointerId: 1 });
      fireTouch('pointerdown', { pointerId: 2 });

      expect(input.getActiveTouches().size).toBe(2);

      window.dispatchEvent(new Event('blur'));

      expect(input.getActiveTouches().size).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // destroy() stops all touch events
  // -------------------------------------------------------------------------

  describe('destroy()', () => {
    it('stops emitting touch events after destroy', () => {
      const handler = vi.fn();
      core.events.on('test', 'input/touch:start', handler);

      input.destroy(core);

      fireTouch('pointerdown', { pointerId: 1 });

      expect(handler).not.toHaveBeenCalled();
    });
  });
});
