// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { InputManager } from '../src/plugins/InputManager.js';
import type { Core } from '../src/core/Core.js';
import type {
  InputKeyDownParams,
  InputKeyUpParams,
  InputKeyPressedOutput,
  InputPointerStateOutput,
  InputPointerDownParams,
  InputPointerUpParams,
  InputPointerMoveParams,
  InputActionTriggeredParams,
} from '../src/types/input.js';

function createStubCore(): Core {
  return { events: new EventBus(), dataRoot: '/' } as unknown as Core;
}

/** Helper to dispatch a native KeyboardEvent on `window`. */
function fireKey(type: 'keydown' | 'keyup', code: string, key = code, repeat = false): void {
  window.dispatchEvent(new KeyboardEvent(type, { code, key, repeat }));
}

/** Helper to dispatch a native PointerEvent on `window`. */
function firePointer(
  type: 'pointerdown' | 'pointerup' | 'pointermove',
  opts: { clientX?: number; clientY?: number; button?: number } = {},
): void {
  window.dispatchEvent(
    new PointerEvent(type, {
      clientX: opts.clientX ?? 0,
      clientY: opts.clientY ?? 0,
      button: opts.button ?? 0,
    }),
  );
}

describe('InputManager', () => {
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
  // Keyboard: push events
  // -------------------------------------------------------------------------

  describe('keyboard push events', () => {
    it('emits input/key:down on keydown', () => {
      const handler = vi.fn();
      core.events.on('test', 'input/key:down', handler);

      fireKey('keydown', 'KeyW', 'w');

      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0][0]).toMatchObject({ code: 'KeyW', key: 'w' });
    });

    it('emits input/key:up on keyup', () => {
      const handler = vi.fn();
      core.events.on('test', 'input/key:up', handler);

      fireKey('keydown', 'KeyW', 'w');
      fireKey('keyup', 'KeyW', 'w');

      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0][0]).toMatchObject({ code: 'KeyW' });
    });

    it('suppresses auto-repeat keydown events', () => {
      const handler = vi.fn();
      core.events.on('test', 'input/key:down', handler);

      fireKey('keydown', 'KeyW', 'w');
      fireKey('keydown', 'KeyW', 'w', true); // repeat=true
      fireKey('keydown', 'KeyW', 'w', true);

      expect(handler).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // Keyboard: pull queries
  // -------------------------------------------------------------------------

  describe('keyboard pull queries', () => {
    it('isKeyPressed() returns true while key is held', () => {
      fireKey('keydown', 'Space', ' ');
      expect(input.isKeyPressed('Space')).toBe(true);

      fireKey('keyup', 'Space', ' ');
      expect(input.isKeyPressed('Space')).toBe(false);
    });

    it('input/key:pressed event returns pressed state', () => {
      fireKey('keydown', 'KeyA', 'a');

      const { output } = core.events.emitSync<{ code: string }, InputKeyPressedOutput>(
        'input/key:pressed',
        { code: 'KeyA' },
      );
      expect(output.pressed).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Pointer: push events
  // -------------------------------------------------------------------------

  describe('pointer push events', () => {
    it('emits input/pointer:down on pointerdown', () => {
      const handler = vi.fn();
      core.events.on('test', 'input/pointer:down', handler);

      firePointer('pointerdown', { clientX: 100, clientY: 200, button: 0 });

      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0][0]).toMatchObject({ x: 100, y: 200, button: 0 });
    });

    it('emits input/pointer:up on pointerup', () => {
      const handler = vi.fn();
      core.events.on('test', 'input/pointer:up', handler);

      firePointer('pointerdown', { button: 0 });
      firePointer('pointerup', { clientX: 50, clientY: 60, button: 0 });

      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0][0]).toMatchObject({ x: 50, y: 60, button: 0 });
    });
  });

  // -------------------------------------------------------------------------
  // Pointer: pull queries
  // -------------------------------------------------------------------------

  describe('pointer pull queries', () => {
    it('getPointerPosition() returns last known position', () => {
      firePointer('pointerdown', { clientX: 42, clientY: 84 });
      const pos = input.getPointerPosition();
      expect(pos).toEqual({ x: 42, y: 84 });
    });

    it('isPointerButtonDown() tracks button state', () => {
      firePointer('pointerdown', { button: 2 });
      expect(input.isPointerButtonDown(2)).toBe(true);

      firePointer('pointerup', { button: 2 });
      expect(input.isPointerButtonDown(2)).toBe(false);
    });

    it('input/pointer:state event returns position and buttons', () => {
      firePointer('pointerdown', { clientX: 10, clientY: 20, button: 0 });

      const { output } = core.events.emitSync<Record<string, never>, InputPointerStateOutput>(
        'input/pointer:state',
        {} as Record<string, never>,
      );

      expect(output.position).toEqual({ x: 10, y: 20 });
      expect(output.buttons.has(0)).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Pointer move throttle (one per frame via core/tick)
  // -------------------------------------------------------------------------

  describe('pointer move throttle', () => {
    it('batches pointer moves and emits once per core/tick', () => {
      const handler = vi.fn();
      core.events.on('test', 'input/pointer:move', handler);

      // Multiple moves before a tick.
      firePointer('pointermove', { clientX: 10, clientY: 10 });
      firePointer('pointermove', { clientX: 20, clientY: 20 });
      firePointer('pointermove', { clientX: 30, clientY: 30 });

      // No event emitted yet.
      expect(handler).not.toHaveBeenCalled();

      // Simulate a frame tick.
      core.events.emitSync('core/tick', { delta: 1, elapsed: 16 });

      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0][0]).toMatchObject({ x: 30, y: 30 });
    });

    it('does not emit pointer:move when no movement occurred', () => {
      const handler = vi.fn();
      core.events.on('test', 'input/pointer:move', handler);

      core.events.emitSync('core/tick', { delta: 1, elapsed: 16 });
      expect(handler).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Blur safety
  // -------------------------------------------------------------------------

  describe('window blur safety', () => {
    it('clears all pressed keys on blur', () => {
      fireKey('keydown', 'KeyW', 'w');
      fireKey('keydown', 'KeyA', 'a');
      expect(input.isKeyPressed('KeyW')).toBe(true);

      window.dispatchEvent(new Event('blur'));

      expect(input.isKeyPressed('KeyW')).toBe(false);
      expect(input.isKeyPressed('KeyA')).toBe(false);
    });

    it('clears all pointer buttons on blur', () => {
      firePointer('pointerdown', { button: 0 });
      expect(input.isPointerButtonDown(0)).toBe(true);

      window.dispatchEvent(new Event('blur'));

      expect(input.isPointerButtonDown(0)).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Action bindings
  // -------------------------------------------------------------------------

  describe('action bindings', () => {
    it('triggers action events when a bound key is pressed', () => {
      const handler = vi.fn();
      core.events.on('test', 'input/action:triggered', handler);

      core.events.emitSync('input/action:bind', { action: 'jump', codes: ['Space'] });
      fireKey('keydown', 'Space', ' ');

      expect(handler).toHaveBeenCalledOnce();
      expect(handler.mock.calls[0][0]).toMatchObject({ action: 'jump', state: 'pressed' });
    });

    it('triggers "released" when a bound key is released', () => {
      const handler = vi.fn();
      core.events.on('test', 'input/action:triggered', handler);

      core.events.emitSync('input/action:bind', { action: 'jump', codes: ['Space'] });
      fireKey('keydown', 'Space', ' ');
      fireKey('keyup', 'Space', ' ');

      const releasedCall = handler.mock.calls.find(
        (c) => c[0].action === 'jump' && c[0].state === 'released',
      );
      expect(releasedCall).toBeDefined();
    });

    it('supports multiple codes for the same action', () => {
      const handler = vi.fn();
      core.events.on('test', 'input/action:triggered', handler);

      core.events.emitSync('input/action:bind', {
        action: 'move-up',
        codes: ['KeyW', 'ArrowUp'],
      });

      fireKey('keydown', 'KeyW', 'w');
      fireKey('keydown', 'ArrowUp', 'ArrowUp');

      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('rebinding an action replaces the old codes', () => {
      const handler = vi.fn();
      core.events.on('test', 'input/action:triggered', handler);

      core.events.emitSync('input/action:bind', { action: 'jump', codes: ['Space'] });
      core.events.emitSync('input/action:bind', { action: 'jump', codes: ['KeyJ'] });

      // Old code should no longer trigger.
      fireKey('keydown', 'Space', ' ');
      expect(handler).not.toHaveBeenCalled();

      // New code should trigger.
      fireKey('keydown', 'KeyJ', 'j');
      expect(handler).toHaveBeenCalledOnce();
    });
  });

  // -------------------------------------------------------------------------
  // destroy()
  // -------------------------------------------------------------------------

  describe('destroy()', () => {
    it('stops emitting events after destroy', () => {
      const handler = vi.fn();
      core.events.on('test', 'input/key:down', handler);

      input.destroy(core);
      fireKey('keydown', 'KeyW', 'w');

      expect(handler).not.toHaveBeenCalled();
    });
  });
});
