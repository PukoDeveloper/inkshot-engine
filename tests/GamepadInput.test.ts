// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { InputManager } from '../src/plugins/InputManager.js';
import type { Core } from '../src/core/Core.js';
import type {
  InputGamepadButtonDownParams,
  InputGamepadButtonUpParams,
  InputGamepadAxesParams,
  InputGamepadAxisBindParams,
  InputGamepadVibrateParams,
  InputActionTriggeredParams,
  InputActionBindParams,
} from '../src/types/input.js';

// ---------------------------------------------------------------------------
// Gamepad mock helpers
// ---------------------------------------------------------------------------

/**
 * Create a minimal mock Gamepad object.
 * `buttons` is an array of { pressed, value } objects.
 * `axes` is an array of numbers.
 */
function makeGamepad(
  index: number,
  buttons: Array<{ pressed: boolean; value?: number }> = [],
  axes: number[] = [],
  vibrationActuator: object | null = null,
): Gamepad {
  return {
    id: `Mock Gamepad ${index}`,
    index,
    connected: true,
    timestamp: 0,
    mapping: 'standard',
    buttons: buttons.map((b) => ({
      pressed: b.pressed,
      touched: b.pressed,
      value: b.value ?? (b.pressed ? 1 : 0),
    })),
    axes,
    vibrationActuator,
    hapticActuators: [],
  } as unknown as Gamepad;
}

/**
 * Override `navigator.getGamepads` to return the given gamepads for the
 * current call, then optionally restore the previous implementation.
 */
function mockGamepads(...gamepads: Array<Gamepad | null>): void {
  Object.defineProperty(navigator, 'getGamepads', {
    configurable: true,
    writable: true,
    value: () => gamepads,
  });
}

function createStubCore(): Core {
  return { events: new EventBus(), dataRoot: '/' } as unknown as Core;
}

/** Simulate a frame tick. */
function tick(core: Core): void {
  core.events.emitSync('core/tick', { delta: 1, elapsed: 16 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('InputManager — Gamepad support', () => {
  let core: Core;
  let input: InputManager;

  beforeEach(() => {
    core = createStubCore();
    input = new InputManager();
    input.init(core);
  });

  afterEach(() => {
    input.destroy(core);
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // Button down / up events
  // -------------------------------------------------------------------------

  describe('button down / up events', () => {
    it('emits input/gamepad:button:down when a button is first pressed', () => {
      const handler = vi.fn();
      core.events.on('test', 'input/gamepad:button:down', handler);

      // Frame 1: button 0 released
      mockGamepads(makeGamepad(0, [{ pressed: false }]));
      tick(core);
      expect(handler).not.toHaveBeenCalled();

      // Frame 2: button 0 pressed
      mockGamepads(makeGamepad(0, [{ pressed: true, value: 1 }]));
      tick(core);

      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0][0]).toMatchObject({
        gamepadIndex: 0,
        button: 0,
        value: 1,
      });
    });

    it('emits input/gamepad:button:up when a button is released', () => {
      const handler = vi.fn();
      core.events.on('test', 'input/gamepad:button:up', handler);

      // Press then release
      mockGamepads(makeGamepad(0, [{ pressed: true }]));
      tick(core);

      mockGamepads(makeGamepad(0, [{ pressed: false }]));
      tick(core);

      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0][0]).toMatchObject({ gamepadIndex: 0, button: 0 });
    });

    it('does not re-emit button:down while held', () => {
      const handler = vi.fn();
      core.events.on('test', 'input/gamepad:button:down', handler);

      const gp = makeGamepad(0, [{ pressed: true }]);
      mockGamepads(gp);
      tick(core);
      tick(core);
      tick(core);

      expect(handler).toHaveBeenCalledOnce();
    });

    it('correctly tracks multiple buttons on the same gamepad', () => {
      const downHandler = vi.fn();
      const upHandler = vi.fn();
      core.events.on('test', 'input/gamepad:button:down', downHandler);
      core.events.on('test', 'input/gamepad:button:up', upHandler);

      // Buttons 0 and 1 both pressed
      mockGamepads(makeGamepad(0, [{ pressed: true }, { pressed: true }]));
      tick(core);
      expect(downHandler).toHaveBeenCalledTimes(2);

      // Button 0 released, button 1 still held
      mockGamepads(makeGamepad(0, [{ pressed: false }, { pressed: true }]));
      tick(core);
      expect(upHandler).toHaveBeenCalledTimes(1);
      expect(upHandler.mock.calls[0][0]).toMatchObject({ button: 0 });
    });

    it('handles multiple gamepads independently', () => {
      const handler = vi.fn();
      core.events.on('test', 'input/gamepad:button:down', handler);

      mockGamepads(
        makeGamepad(0, [{ pressed: true }]),
        makeGamepad(1, [{ pressed: true }]),
      );
      tick(core);

      expect(handler).toHaveBeenCalledTimes(2);
      const indices = handler.mock.calls.map((c) => (c[0] as InputGamepadButtonDownParams).gamepadIndex);
      expect(indices).toContain(0);
      expect(indices).toContain(1);
    });
  });

  // -------------------------------------------------------------------------
  // isGamepadButtonPressed() accessor
  // -------------------------------------------------------------------------

  describe('isGamepadButtonPressed()', () => {
    it('returns true while a button is held', () => {
      mockGamepads(makeGamepad(0, [{ pressed: true }]));
      tick(core);
      expect(input.isGamepadButtonPressed(0, 0)).toBe(true);
    });

    it('returns false after a button is released', () => {
      mockGamepads(makeGamepad(0, [{ pressed: true }]));
      tick(core);

      mockGamepads(makeGamepad(0, [{ pressed: false }]));
      tick(core);

      expect(input.isGamepadButtonPressed(0, 0)).toBe(false);
    });

    it('returns false for a button that was never pressed', () => {
      expect(input.isGamepadButtonPressed(0, 99)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // getGamepadAxes() accessor
  // -------------------------------------------------------------------------

  describe('getGamepadAxes()', () => {
    it('returns current axis values for a connected gamepad', () => {
      mockGamepads(makeGamepad(0, [], [0.5, -0.3]));
      const axes = input.getGamepadAxes(0);
      expect(axes[0]).toBeCloseTo(0.5);
      expect(axes[1]).toBeCloseTo(-0.3);
    });

    it('returns empty array for a disconnected gamepad', () => {
      mockGamepads(null);
      expect(input.getGamepadAxes(0)).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Axes events
  // -------------------------------------------------------------------------

  describe('input/gamepad:axes event', () => {
    it('emits input/gamepad:axes when axes exceed the internal deadzone', () => {
      const handler = vi.fn();
      core.events.on('test', 'input/gamepad:axes', handler);

      mockGamepads(makeGamepad(0, [], [0.8, 0]));
      tick(core);

      expect(handler).toHaveBeenCalledOnce();
      const params = handler.mock.calls[0][0] as InputGamepadAxesParams;
      expect(params.gamepadIndex).toBe(0);
      expect(params.axes[0]).toBeCloseTo(0.8);
    });

    it('does not emit input/gamepad:axes when all axes are near zero', () => {
      const handler = vi.fn();
      core.events.on('test', 'input/gamepad:axes', handler);

      mockGamepads(makeGamepad(0, [], [0.01, -0.02]));
      tick(core);

      expect(handler).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Action bindings — gamepad buttons
  // -------------------------------------------------------------------------

  describe('action bindings with gamepad buttons', () => {
    it('triggers action when a bound gamepad button is pressed', () => {
      const handler = vi.fn();
      core.events.on('test', 'input/action:triggered', handler);

      core.events.emitSync<InputActionBindParams>('input/action:bind', {
        action: 'jump',
        codes: ['Space', 'Gamepad:0:0'],
      });

      mockGamepads(makeGamepad(0, [{ pressed: true }]));
      tick(core);

      const jumpCalls = handler.mock.calls.filter(
        (c) => (c[0] as InputActionTriggeredParams).action === 'jump',
      );
      expect(jumpCalls.length).toBeGreaterThanOrEqual(1);
      expect(jumpCalls[0]![0]).toMatchObject({ action: 'jump', state: 'pressed' });
    });

    it('triggers "released" when a bound gamepad button is released', () => {
      const handler = vi.fn();
      core.events.on('test', 'input/action:triggered', handler);

      core.events.emitSync<InputActionBindParams>('input/action:bind', {
        action: 'jump',
        codes: ['Gamepad:0:0'],
      });

      mockGamepads(makeGamepad(0, [{ pressed: true }]));
      tick(core);

      mockGamepads(makeGamepad(0, [{ pressed: false }]));
      tick(core);

      const releasedCall = handler.mock.calls.find(
        (c) => c[0].action === 'jump' && c[0].state === 'released',
      );
      expect(releasedCall).toBeDefined();
    });

    it('can bind both keyboard and gamepad to the same action', () => {
      const handler = vi.fn();
      core.events.on('test', 'input/action:triggered', handler);

      core.events.emitSync<InputActionBindParams>('input/action:bind', {
        action: 'fire',
        codes: ['KeyZ', 'Gamepad:0:1'],
      });

      // Gamepad button 1 pressed
      mockGamepads(makeGamepad(0, [{ pressed: false }, { pressed: true }]));
      tick(core);

      const fireCalls = handler.mock.calls.filter((c) => c[0].action === 'fire');
      expect(fireCalls.length).toBeGreaterThanOrEqual(1);
    });
  });

  // -------------------------------------------------------------------------
  // Axis-to-action binding
  // -------------------------------------------------------------------------

  describe('input/gamepad:axis:bind', () => {
    it('emits action:triggered pressed when axis exceeds threshold', () => {
      const handler = vi.fn();
      core.events.on('test', 'input/action:triggered', handler);

      core.events.emitSync<InputGamepadAxisBindParams>('input/gamepad:axis:bind', {
        action: 'move-right',
        axisIndex: 0,
        direction: 'positive',
        threshold: 0.5,
      });

      mockGamepads(makeGamepad(0, [], [0.8]));
      tick(core);

      const pressedCall = handler.mock.calls.find(
        (c) => c[0].action === 'move-right' && c[0].state === 'pressed',
      );
      expect(pressedCall).toBeDefined();
    });

    it('emits action:triggered released when axis returns inside deadzone', () => {
      const handler = vi.fn();
      core.events.on('test', 'input/action:triggered', handler);

      core.events.emitSync<InputGamepadAxisBindParams>('input/gamepad:axis:bind', {
        action: 'move-right',
        axisIndex: 0,
        direction: 'positive',
        threshold: 0.5,
        deadzone: 0.1,
      });

      // Activate
      mockGamepads(makeGamepad(0, [], [0.8]));
      tick(core);

      // Deactivate
      mockGamepads(makeGamepad(0, [], [0.05]));
      tick(core);

      const releasedCall = handler.mock.calls.find(
        (c) => c[0].action === 'move-right' && c[0].state === 'released',
      );
      expect(releasedCall).toBeDefined();
    });

    it('respects the negative direction', () => {
      const handler = vi.fn();
      core.events.on('test', 'input/action:triggered', handler);

      core.events.emitSync<InputGamepadAxisBindParams>('input/gamepad:axis:bind', {
        action: 'move-left',
        axisIndex: 0,
        direction: 'negative',
        threshold: 0.5,
      });

      // Positive axis — should NOT trigger
      mockGamepads(makeGamepad(0, [], [0.9]));
      tick(core);
      expect(handler).not.toHaveBeenCalled();

      // Negative axis — should trigger
      mockGamepads(makeGamepad(0, [], [-0.9]));
      tick(core);

      const pressedCall = handler.mock.calls.find(
        (c) => c[0].action === 'move-left' && c[0].state === 'pressed',
      );
      expect(pressedCall).toBeDefined();
    });

    it('does not re-emit pressed while axis stays above threshold', () => {
      const handler = vi.fn();
      core.events.on('test', 'input/action:triggered', handler);

      core.events.emitSync<InputGamepadAxisBindParams>('input/gamepad:axis:bind', {
        action: 'run',
        axisIndex: 0,
        direction: 'both',
      });

      mockGamepads(makeGamepad(0, [], [0.9]));
      tick(core);
      tick(core);
      tick(core);

      const pressedCalls = handler.mock.calls.filter(
        (c) => c[0].action === 'run' && c[0].state === 'pressed',
      );
      expect(pressedCalls).toHaveLength(1);
    });
  });

  // -------------------------------------------------------------------------
  // Blur clears gamepad state
  // -------------------------------------------------------------------------

  describe('window blur', () => {
    it('clears gamepad button state on blur', () => {
      mockGamepads(makeGamepad(0, [{ pressed: true }]));
      tick(core);
      expect(input.isGamepadButtonPressed(0, 0)).toBe(true);

      window.dispatchEvent(new Event('blur'));
      expect(input.isGamepadButtonPressed(0, 0)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Haptic feedback
  // -------------------------------------------------------------------------

  describe('input/gamepad:vibrate', () => {
    it('calls playEffect on the vibrationActuator when supported', () => {
      const playEffect = vi.fn();
      const actuator = { playEffect };

      mockGamepads(makeGamepad(0, [], [], actuator));
      tick(core); // ensure gamepad is tracked

      core.events.emitSync<InputGamepadVibrateParams>('input/gamepad:vibrate', {
        gamepadIndex: 0,
        duration: 200,
        strongMagnitude: 0.8,
        weakMagnitude: 0.3,
      });

      expect(playEffect).toHaveBeenCalledOnce();
      expect(playEffect.mock.calls[0][0]).toBe('dual-rumble');
      expect(playEffect.mock.calls[0][1]).toMatchObject({
        duration: 200,
        strongMagnitude: 0.8,
        weakMagnitude: 0.3,
      });
    });

    it('does not throw when vibrationActuator is absent', () => {
      mockGamepads(makeGamepad(0));
      tick(core);

      expect(() => {
        core.events.emitSync<InputGamepadVibrateParams>('input/gamepad:vibrate', {
          duration: 100,
        });
      }).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // destroy()
  // -------------------------------------------------------------------------

  describe('destroy()', () => {
    it('stops gamepad event emission after destroy', () => {
      const handler = vi.fn();
      core.events.on('test', 'input/gamepad:button:down', handler);

      input.destroy(core);

      mockGamepads(makeGamepad(0, [{ pressed: true }]));
      tick(core);

      expect(handler).not.toHaveBeenCalled();
    });
  });
});
