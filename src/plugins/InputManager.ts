import type { Core } from '../core/Core.js';
import { EventBus } from '../core/EventBus.js';
import type { EnginePlugin } from '../types/plugin.js';
import type {
  InputKeyDownParams,
  InputKeyUpParams,
  InputPointerDownParams,
  InputPointerUpParams,
  InputPointerMoveParams,
  InputKeyPressedParams,
  InputKeyPressedOutput,
  InputPointerStateOutput,
  InputActionBindParams,
  InputActionTriggeredParams,
  InputGamepadButtonDownParams,
  InputGamepadButtonUpParams,
  InputGamepadAxesParams,
  InputGamepadAxisBindParams,
  InputGamepadVibrateParams,
  InputGamepadConnectedParams,
  InputGamepadDisconnectedParams,
} from '../types/input.js';

/**
 * Built-in plugin that handles keyboard, pointer, and gamepad input.
 *
 * `InputManager` implements a **dual-track** input model:
 *
 * ### Push (event-driven)
 * State-transition events are emitted on the `EventBus` exactly once per
 * transition, keeping per-frame overhead near zero:
 *
 * | Event                       | When emitted                                                |
 * |-----------------------------|-------------------------------------------------------------|
 * | `input/key:down`            | A key transitions released → pressed (auto-repeat filtered) |
 * | `input/key:up`              | A key transitions pressed → released                        |
 * | `input/pointer:down`        | A pointer button transitions released → pressed             |
 * | `input/pointer:up`          | A pointer button transitions pressed → released             |
 * | `input/pointer:move`        | Pointer moved — throttled to **one event per frame**        |
 * | `input/action:triggered`    | A bound action key or button changed state                  |
 * | `input/gamepad:button:down` | A gamepad button transitions released → pressed             |
 * | `input/gamepad:button:up`   | A gamepad button transitions pressed → released             |
 * | `input/gamepad:axes`        | Per-frame raw analog axes (when any axis > 0.05 deadzone)   |
 * | `input/gamepad:connected`   | A gamepad was connected (browser `gamepadconnected` event)  |
 * | `input/gamepad:disconnected`| A gamepad was disconnected (`gamepaddisconnected` event)    |
 *
 * ### Pull (synchronous query)
 * Current state can be queried at any time without subscribing to events:
 *
 * | Event                  | Returns                                     |
 * |------------------------|---------------------------------------------|
 * | `input/key:pressed`    | `output.pressed: boolean`                   |
 * | `input/pointer:state`  | `output.position`, `output.buttons`         |
 *
 * Direct accessor methods (`isKeyPressed`, `getPointerPosition`,
 * `isPointerButtonDown`, `isGamepadButtonPressed`, `getGamepadAxes`) are also
 * available for code that holds a reference to the plugin instance.
 *
 * ### Action bindings
 * Logical actions decouple game code from physical keys.  Both keyboard codes
 * and gamepad buttons (`'Gamepad:<index>:<button>'`) can be bound:
 * ```ts
 * core.events.emitSync('input/action:bind', {
 *   action: 'jump',
 *   codes: ['Space', 'Gamepad:0:0'],
 * });
 * core.events.on('myGame', 'input/action:triggered', (params) => {
 *   if (params.action === 'jump' && params.state === 'pressed') player.jump();
 * });
 * ```
 *
 * ### Gamepad axis binding
 * Map analog axes to logical actions with `input/gamepad:axis:bind`.
 * Re-registering the same `action` + `axisIndex` + `direction` on the same
 * gamepad **replaces** the existing binding (no duplicates):
 * ```ts
 * core.events.emitSync('input/gamepad:axis:bind', {
 *   action: 'move-right', axisIndex: 0, direction: 'positive',
 * });
 * ```
 *
 * ### Performance safeguards
 * - `keydown` auto-repeat events are suppressed; `input/key:down` fires once.
 * - `pointermove` DOM events are batched; one `input/pointer:move` per frame.
 * - `window blur` clears all pressed-key and gamepad state to prevent stuck inputs.
 * - Gamepad axes are snapshotted once per frame; `getGamepadAxes()` reads the
 *   frame-local cache for consistency.
 *
 * ---
 *
 * ### Usage
 * ```ts
 * import { createEngine, InputManager } from 'inkshot-engine';
 *
 * const inputManager = new InputManager();
 * const { core } = await createEngine({ plugins: [inputManager] });
 *
 * // Push: react to a key press
 * core.events.on('myGame', 'input/key:down', (params) => {
 *   console.log('pressed', params.code);
 * });
 *
 * // Pull: check state every frame
 * core.events.on('myGame', 'core/tick', () => {
 *   if (inputManager.isKeyPressed('KeyW')) player.moveUp();
 * });
 * ```
 */
export class InputManager implements EnginePlugin {
  readonly namespace = 'input';

  // ---------------------------------------------------------------------------
  // Internal state
  // ---------------------------------------------------------------------------

  /** Physical keys currently held down (KeyboardEvent.code values). */
  private readonly _pressedKeys = new Set<string>();

  /** Pointer buttons currently held down (PointerEvent.button values). */
  private readonly _pointerButtons = new Set<number>();

  /** Latest known pointer position in client coordinates. */
  private _pointerPosition = { x: 0, y: 0 };

  /**
   * Pointer position at the time of the last emitted `input/pointer:move`.
   * Used to compute `dx`/`dy` when flushing the pending move each frame.
   */
  private _lastEmittedPointerPos = { x: 0, y: 0 };

  /** Whether the pointer has moved since the last `core/tick`. */
  private _pendingPointerMove = false;

  // ---------------------------------------------------------------------------
  // Action bindings
  // ---------------------------------------------------------------------------

  /** Maps action name → bound key codes. */
  private readonly _actions = new Map<string, string[]>();

  /** Reverse map: key code → bound action names (for O(1) lookup on key events). */
  private readonly _codeToActions = new Map<string, string[]>();

  // ---------------------------------------------------------------------------
  // Gamepad state
  // ---------------------------------------------------------------------------

  /**
   * Previous-frame button pressed state, keyed by `'<gamepadIndex>:<buttonIndex>'`.
   * Used to detect transitions (released → pressed, pressed → released).
   */
  private readonly _gamepadButtonState = new Map<string, boolean>();

  /**
   * Axis-to-action bindings registered via `input/gamepad:axis:bind`.
   * Key: `'<action>:<gamepadIndex>:<axisIndex>:<direction>'`
   */
  private readonly _axisBindings: Array<{
    action: string;
    gamepadIndex: number;
    axisIndex: number;
    deadzone: number;
    threshold: number;
    direction: 'positive' | 'negative' | 'both';
    /** Whether the axis was in the "pressed" state during the previous poll. */
    wasActive: boolean;
  }> = [];

  // ---------------------------------------------------------------------------
  // Per-frame axes snapshot (populated in _pollGamepads)
  // ---------------------------------------------------------------------------

  /**
   * Most recent axis values per gamepad, snapshotted once per frame.
   * Keyed by gamepad index; used by `getGamepadAxes()` for consistent
   * per-frame reads (mirrors `_gamepadButtonState` semantics for buttons).
   */
  private readonly _gamepadAxesCache = new Map<number, readonly number[]>();

  // ---------------------------------------------------------------------------
  // EventBus reference (set during init, cleared during destroy)
  // ---------------------------------------------------------------------------

  private _events: EventBus | null = null;

  // ---------------------------------------------------------------------------
  // EnginePlugin lifecycle
  // ---------------------------------------------------------------------------

  init(core: Core): void {
    this._events = core.events;
    const { events } = core;

    // ── DOM listeners ──────────────────────────────────────────────────────
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    window.addEventListener('pointerdown', this._onPointerDown);
    window.addEventListener('pointerup', this._onPointerUp);
    window.addEventListener('pointermove', this._onPointerMove);
    window.addEventListener('blur', this._onBlur);
    window.addEventListener('gamepadconnected', this._onGamepadConnected);
    window.addEventListener('gamepaddisconnected', this._onGamepadDisconnected);

    // ── Pull: synchronous state queries ───────────────────────────────────
    events.on<InputKeyPressedParams, InputKeyPressedOutput>(
      this.namespace,
      'input/key:pressed',
      (params, output) => {
        output.pressed = this._pressedKeys.has(params.code);
      },
    );

    events.on<Record<string, never>, InputPointerStateOutput>(
      this.namespace,
      'input/pointer:state',
      (_params, output) => {
        output.position = { ...this._pointerPosition };
        output.buttons = new Set(this._pointerButtons);
      },
    );

    // ── pointer:move throttle: flush once per frame ────────────────────────
    // Runs in the 'before' phase of core/tick so pointer position is current
    // by the time game logic runs in the main phase.
    events.on(
      this.namespace,
      'core/tick',
      () => {
        if (!this._pendingPointerMove) return;
        const { x, y } = this._pointerPosition;
        const dx = x - this._lastEmittedPointerPos.x;
        const dy = y - this._lastEmittedPointerPos.y;
        this._pendingPointerMove = false;
        this._lastEmittedPointerPos = { x, y };
        events.emitSync<InputPointerMoveParams, Record<string, never>>(
          'input/pointer:move',
          { x, y, dx, dy },
        );
      },
      { phase: 'before' },
    );

    // ── Action binding registration ────────────────────────────────────────
    events.on<InputActionBindParams>(
      this.namespace,
      'input/action:bind',
      (params) => {
        this._bindAction(params.action, [...params.codes]);
      },
    );

    // ── Dispatch action events after key state transitions ─────────────────
    // Runs in the 'after' phase so game code can react to the raw key event
    // first (in the main phase) before the higher-level action fires.
    events.on<InputKeyDownParams>(
      this.namespace,
      'input/key:down',
      (params) => {
        this._triggerActions(events, params.code, 'pressed');
      },
      { phase: 'after' },
    );

    events.on<InputKeyUpParams>(
      this.namespace,
      'input/key:up',
      (params) => {
        this._triggerActions(events, params.code, 'released');
      },
      { phase: 'after' },
    );

    // ── Gamepad polling: runs in the before-phase of core/tick ────────────
    events.on(
      this.namespace,
      'core/tick',
      () => {
        this._pollGamepads(events);
      },
      { phase: 'before' },
    );

    // ── Gamepad axis binding ───────────────────────────────────────────────
    events.on<InputGamepadAxisBindParams>(
      this.namespace,
      'input/gamepad:axis:bind',
      (params) => {
        const gamepadIndex = params.gamepadIndex ?? 0;
        const direction = params.direction ?? 'both';
        // Replace any existing binding for the same (action, gamepadIndex, axisIndex, direction)
        // tuple to avoid stacking duplicate entries on re-registration.
        const existingIdx = this._axisBindings.findIndex(
          (b) =>
            b.action === params.action &&
            b.gamepadIndex === gamepadIndex &&
            b.axisIndex === params.axisIndex &&
            b.direction === direction,
        );
        const entry = {
          action: params.action,
          gamepadIndex,
          axisIndex: params.axisIndex,
          deadzone: params.deadzone ?? 0.1,
          threshold: params.threshold ?? 0.5,
          direction,
          wasActive: false,
        };
        if (existingIdx !== -1) {
          this._axisBindings[existingIdx] = entry;
        } else {
          this._axisBindings.push(entry);
        }
      },
    );

    // ── Gamepad vibration ─────────────────────────────────────────────────
    events.on<InputGamepadVibrateParams>(
      this.namespace,
      'input/gamepad:vibrate',
      (params) => {
        this._vibrate(params);
      },
    );
  }

  destroy(core: Core): void {
    // Remove DOM listeners first so no new events can fire after teardown.
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    window.removeEventListener('pointerdown', this._onPointerDown);
    window.removeEventListener('pointerup', this._onPointerUp);
    window.removeEventListener('pointermove', this._onPointerMove);
    window.removeEventListener('blur', this._onBlur);
    window.removeEventListener('gamepadconnected', this._onGamepadConnected);
    window.removeEventListener('gamepaddisconnected', this._onGamepadDisconnected);

    // Remove all EventBus listeners registered under this namespace.
    core.events.removeNamespace(this.namespace);

    // Clear all internal state.
    this._pressedKeys.clear();
    this._pointerButtons.clear();
    this._actions.clear();
    this._codeToActions.clear();
    this._pendingPointerMove = false;
    this._gamepadButtonState.clear();
    this._gamepadAxesCache.clear();
    this._axisBindings.length = 0;
    this._events = null;
  }

  // ---------------------------------------------------------------------------
  // Direct accessor API (Pull — use when you hold a plugin reference)
  // ---------------------------------------------------------------------------

  /**
   * Returns `true` when the given key is currently held down.
   *
   * @param code  Physical key identifier (e.g. `'Space'`, `'KeyW'`).
   *
   * @example
   * ```ts
   * core.events.on('myGame', 'core/tick', () => {
   *   if (inputManager.isKeyPressed('KeyW')) player.moveUp();
   * });
   * ```
   */
  isKeyPressed(code: string): boolean {
    return this._pressedKeys.has(code);
  }

  /**
   * Returns the last known pointer position in client (viewport) coordinates.
   * The returned object is a **snapshot** — it will not update after being read.
   */
  getPointerPosition(): { readonly x: number; readonly y: number } {
    return { ...this._pointerPosition };
  }

  /**
   * Returns `true` when the given pointer button is currently held down.
   *
   * @param button  `0` = left, `1` = middle, `2` = right.
   */
  isPointerButtonDown(button: number): boolean {
    return this._pointerButtons.has(button);
  }

  /**
   * Returns `true` when the given gamepad button is currently pressed.
   *
   * @param gamepadIndex  Zero-based gamepad index.
   * @param button        Zero-based button index on that gamepad.
   */
  isGamepadButtonPressed(gamepadIndex: number, button: number): boolean {
    return this._gamepadButtonState.get(`${gamepadIndex}:${button}`) === true;
  }

  /**
   * Returns the axis values for the specified gamepad as of the **last
   * completed frame**, or an empty array if the gamepad is not connected.
   *
   * The returned values come from the per-frame snapshot taken during
   * `_pollGamepads`, keeping them consistent with `isGamepadButtonPressed`.
   *
   * @param gamepadIndex  Zero-based gamepad index.
   */
  getGamepadAxes(gamepadIndex: number): readonly number[] {
    return this._gamepadAxesCache.get(gamepadIndex) ?? [];
  }

  // ---------------------------------------------------------------------------
  // DOM event handlers (arrow functions to preserve `this` binding)
  // ---------------------------------------------------------------------------

  private readonly _onKeyDown = (event: KeyboardEvent): void => {
    // Suppress browser auto-repeat: only emit on the first physical press.
    if (event.repeat) return;
    this._pressedKeys.add(event.code);
    this._events?.emitSync<InputKeyDownParams, Record<string, never>>(
      'input/key:down',
      { code: event.code, key: event.key },
    );
  };

  private readonly _onKeyUp = (event: KeyboardEvent): void => {
    this._pressedKeys.delete(event.code);
    this._events?.emitSync<InputKeyUpParams, Record<string, never>>(
      'input/key:up',
      { code: event.code, key: event.key },
    );
  };

  private readonly _onPointerDown = (event: PointerEvent): void => {
    this._pointerButtons.add(event.button);
    this._pointerPosition = { x: event.clientX, y: event.clientY };
    this._events?.emitSync<InputPointerDownParams, Record<string, never>>(
      'input/pointer:down',
      { x: event.clientX, y: event.clientY, button: event.button },
    );
  };

  private readonly _onPointerUp = (event: PointerEvent): void => {
    this._pointerButtons.delete(event.button);
    this._pointerPosition = { x: event.clientX, y: event.clientY };
    this._events?.emitSync<InputPointerUpParams, Record<string, never>>(
      'input/pointer:up',
      { x: event.clientX, y: event.clientY, button: event.button },
    );
  };

  private readonly _onPointerMove = (event: PointerEvent): void => {
    // Buffer the latest position; the actual event is flushed once per frame
    // in the core/tick before-phase handler to avoid EventBus saturation.
    this._pointerPosition = { x: event.clientX, y: event.clientY };
    this._pendingPointerMove = true;
  };

  private readonly _onBlur = (): void => {
    // When the window loses focus, clear all held state to prevent stuck keys
    // (e.g. user presses W, Alt-Tabs away, releases W, returns — W would
    // otherwise remain in _pressedKeys forever).
    this._pressedKeys.clear();
    this._pointerButtons.clear();
    // Also clear gamepad button state so buttons aren't stuck on blur.
    this._gamepadButtonState.clear();
    for (const binding of this._axisBindings) {
      binding.wasActive = false;
    }
  };

  private readonly _onGamepadConnected = (event: GamepadEvent): void => {
    this._events?.emitSync<InputGamepadConnectedParams, Record<string, never>>(
      'input/gamepad:connected',
      { gamepadIndex: event.gamepad.index, id: event.gamepad.id },
    );
  };

  private readonly _onGamepadDisconnected = (event: GamepadEvent): void => {
    // Remove cached axis data for the disconnected controller.
    this._gamepadAxesCache.delete(event.gamepad.index);
    this._events?.emitSync<InputGamepadDisconnectedParams, Record<string, never>>(
      'input/gamepad:disconnected',
      { gamepadIndex: event.gamepad.index, id: event.gamepad.id },
    );
  };

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Poll the browser Gamepad API, compare with the previous frame's state,
   * and emit the appropriate events for any transitions.
   */
  private _pollGamepads(events: EventBus): void {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return;

    const gamepads = navigator.getGamepads();
    if (!gamepads) return;

    for (let gi = 0; gi < gamepads.length; gi++) {
      const gp = gamepads[gi];
      if (!gp) continue;

      // ── Button down / up events ──────────────────────────────────────────
      for (let bi = 0; bi < gp.buttons.length; bi++) {
        const key = `${gi}:${bi}`;
        const wasPressed = this._gamepadButtonState.get(key) ?? false;
        const isPressed = gp.buttons[bi]!.pressed;

        if (isPressed && !wasPressed) {
          this._gamepadButtonState.set(key, true);
          events.emitSync<InputGamepadButtonDownParams, Record<string, never>>(
            'input/gamepad:button:down',
            { gamepadIndex: gi, button: bi, value: gp.buttons[bi]!.value },
          );
          // Trigger any action bindings that use 'Gamepad:<gi>:<bi>'
          this._triggerActions(events, `Gamepad:${gi}:${bi}`, 'pressed');
        } else if (!isPressed && wasPressed) {
          this._gamepadButtonState.set(key, false);
          events.emitSync<InputGamepadButtonUpParams, Record<string, never>>(
            'input/gamepad:button:up',
            { gamepadIndex: gi, button: bi },
          );
          this._triggerActions(events, `Gamepad:${gi}:${bi}`, 'released');
        }
      }

      // ── Snapshot axes into the per-frame cache ───────────────────────────
      const axes = Array.from(gp.axes) as number[];
      this._gamepadAxesCache.set(gi, axes);

      // ── Axes event (emit if any axis exceeds a minimal deadzone) ─────────
      const AXES_EMIT_DEADZONE = 0.05;
      if (axes.some((v) => Math.abs(v) > AXES_EMIT_DEADZONE)) {
        events.emitSync<InputGamepadAxesParams, Record<string, never>>(
          'input/gamepad:axes',
          { gamepadIndex: gi, axes },
        );
      }

      // ── Axis-to-action bindings ──────────────────────────────────────────
      for (const binding of this._axisBindings) {
        if (binding.gamepadIndex !== gi) continue;
        const rawValue = gp.axes[binding.axisIndex] ?? 0;
        const absValue = Math.abs(rawValue);

        // Determine whether the axis is currently "active" (past threshold in
        // the specified direction, outside deadzone).
        let isActive = false;
        if (absValue > binding.deadzone && absValue >= binding.threshold) {
          if (binding.direction === 'both') {
            isActive = true;
          } else if (binding.direction === 'positive' && rawValue > 0) {
            isActive = true;
          } else if (binding.direction === 'negative' && rawValue < 0) {
            isActive = true;
          }
        }

        if (isActive && !binding.wasActive) {
          binding.wasActive = true;
          events.emitSync<InputActionTriggeredParams, Record<string, never>>(
            'input/action:triggered',
            { action: binding.action, state: 'pressed' },
          );
        } else if (!isActive && binding.wasActive) {
          binding.wasActive = false;
          events.emitSync<InputActionTriggeredParams, Record<string, never>>(
            'input/action:triggered',
            { action: binding.action, state: 'released' },
          );
        }
      }
    }
  }

  /**
   * Request haptic feedback on a gamepad via the Vibration Actuator API.
   * Silently does nothing if the browser or controller does not support it.
   */
  private _vibrate(params: InputGamepadVibrateParams): void {
    if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return;
    const gamepads = navigator.getGamepads();
    if (!gamepads) return;
    const gi = params.gamepadIndex ?? 0;
    const gp = gamepads[gi];
    if (!gp) return;

    // vibrationActuator is a non-standard extension; cast to access it safely.
    const actuator = (gp as unknown as { vibrationActuator?: { playEffect?: (type: string, params: object) => void } }).vibrationActuator;
    if (!actuator?.playEffect) return;

    actuator.playEffect('dual-rumble', {
      duration: params.duration,
      strongMagnitude: params.strongMagnitude ?? 1,
      weakMagnitude: params.weakMagnitude ?? 1,
    });
  }

  /**
   * Register or replace the key codes bound to a logical action.
   *
   * Replaces any previous binding for the same `action`, correctly cleaning
   * up the reverse (`_codeToActions`) map before applying the new codes.
   */
  private _bindAction(action: string, codes: string[]): void {
    // Remove old reverse-map entries for this action.
    const oldCodes = this._actions.get(action) ?? [];
    for (const code of oldCodes) {
      const actions = this._codeToActions.get(code);
      if (!actions) continue;
      const idx = actions.indexOf(action);
      if (idx !== -1) actions.splice(idx, 1);
      if (actions.length === 0) this._codeToActions.delete(code);
    }

    // Store the new codes and build reverse-map entries.
    this._actions.set(action, codes);
    for (const code of codes) {
      const existing = this._codeToActions.get(code);
      if (existing) {
        if (!existing.includes(action)) existing.push(action);
      } else {
        this._codeToActions.set(code, [action]);
      }
    }
  }

  /**
   * Emit `input/action:triggered` for every action bound to `code`.
   */
  private _triggerActions(
    events: EventBus,
    code: string,
    state: 'pressed' | 'released',
  ): void {
    const actions = this._codeToActions.get(code);
    if (!actions) return;
    for (const action of actions) {
      events.emitSync<InputActionTriggeredParams, Record<string, never>>(
        'input/action:triggered',
        { action, state },
      );
    }
  }
}
