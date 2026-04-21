// ---------------------------------------------------------------------------
// input/key:down
// ---------------------------------------------------------------------------

/**
 * Parameters for `input/key:down`.
 *
 * Emitted once when a key transitions from **released → pressed**.
 * Browser auto-repeat events are suppressed; this event fires exactly once
 * per physical key-press.
 */
export interface InputKeyDownParams {
  /** The physical key identifier (e.g. `'KeyW'`, `'ArrowUp'`, `'Space'`). */
  readonly code: string;
  /** The logical key value (e.g. `'w'`, `'ArrowUp'`, `' '`). */
  readonly key: string;
}

// ---------------------------------------------------------------------------
// input/key:up
// ---------------------------------------------------------------------------

/**
 * Parameters for `input/key:up`.
 *
 * Emitted once when a key transitions from **pressed → released**.
 */
export interface InputKeyUpParams {
  /** The physical key identifier (e.g. `'KeyW'`, `'ArrowUp'`, `'Space'`). */
  readonly code: string;
  /** The logical key value (e.g. `'w'`, `'ArrowUp'`, `' '`). */
  readonly key: string;
}

// ---------------------------------------------------------------------------
// input/pointer:down
// ---------------------------------------------------------------------------

/**
 * Parameters for `input/pointer:down`.
 *
 * Emitted when a pointer button transitions from **released → pressed**.
 */
export interface InputPointerDownParams {
  /** Horizontal position of the pointer in client (viewport) coordinates. */
  readonly x: number;
  /** Vertical position of the pointer in client (viewport) coordinates. */
  readonly y: number;
  /**
   * Which mouse/pointer button was pressed.
   * `0` = primary (left), `1` = middle, `2` = secondary (right).
   */
  readonly button: number;
}

// ---------------------------------------------------------------------------
// input/pointer:up
// ---------------------------------------------------------------------------

/**
 * Parameters for `input/pointer:up`.
 *
 * Emitted when a pointer button transitions from **pressed → released**.
 */
export interface InputPointerUpParams {
  /** Horizontal position of the pointer in client (viewport) coordinates. */
  readonly x: number;
  /** Vertical position of the pointer in client (viewport) coordinates. */
  readonly y: number;
  /**
   * Which mouse/pointer button was released.
   * `0` = primary (left), `1` = middle, `2` = secondary (right).
   */
  readonly button: number;
}

// ---------------------------------------------------------------------------
// input/pointer:move
// ---------------------------------------------------------------------------

/**
 * Parameters for `input/pointer:move`.
 *
 * Emitted **at most once per frame** (throttled to the `core/tick` rhythm).
 * Carries the pointer's final position for that frame and the total delta
 * accumulated since the last emission.
 */
export interface InputPointerMoveParams {
  /** Final horizontal position in client (viewport) coordinates this frame. */
  readonly x: number;
  /** Final vertical position in client (viewport) coordinates this frame. */
  readonly y: number;
  /** Horizontal movement since the last `input/pointer:move` event. */
  readonly dx: number;
  /** Vertical movement since the last `input/pointer:move` event. */
  readonly dy: number;
}

// ---------------------------------------------------------------------------
// input/key:pressed  (Pull query)
// ---------------------------------------------------------------------------

/**
 * Parameters for `input/key:pressed`.
 *
 * Synchronous query — use `core.events.emitSync` to check whether a specific
 * key is currently held down without subscribing to push events.
 *
 * @example
 * ```ts
 * const { output } = core.events.emitSync<InputKeyPressedParams, InputKeyPressedOutput>(
 *   'input/key:pressed',
 *   { code: 'Space' },
 * );
 * if (output.pressed) { ... }
 * ```
 */
export interface InputKeyPressedParams {
  /** The physical key identifier to query (e.g. `'Space'`, `'KeyW'`). */
  readonly code: string;
}

/**
 * Output for `input/key:pressed`.
 */
export interface InputKeyPressedOutput {
  /** `true` when the queried key is currently held down, `false` otherwise. */
  pressed: boolean;
}

// ---------------------------------------------------------------------------
// input/pointer:state  (Pull query)
// ---------------------------------------------------------------------------

/**
 * Output for `input/pointer:state`.
 *
 * Synchronous query — use `core.events.emitSync` to retrieve the full pointer
 * state without subscribing to push events.
 *
 * @example
 * ```ts
 * const { output } = core.events.emitSync<Record<string, never>, InputPointerStateOutput>(
 *   'input/pointer:state',
 *   {},
 * );
 * console.log(output.position.x, output.position.y);
 * ```
 */
export interface InputPointerStateOutput {
  /** Last known pointer position in client (viewport) coordinates. */
  position: { x: number; y: number };
  /** Set of currently pressed pointer buttons (0 = left, 1 = middle, 2 = right). */
  buttons: Set<number>;
}

// ---------------------------------------------------------------------------
// input/action:bind
// ---------------------------------------------------------------------------

/**
 * Parameters for `input/action:bind`.
 *
 * Maps a logical action name to one or more physical key codes.
 * Re-emitting with the same `action` replaces the previous binding.
 *
 * @example
 * ```ts
 * core.events.emitSync<InputActionBindParams>('input/action:bind', {
 *   action: 'jump',
 *   codes: ['Space', 'GamepadButtonA'],
 * });
 * ```
 */
export interface InputActionBindParams {
  /** Logical name for the action (e.g. `'jump'`, `'attack'`, `'move-up'`). */
  readonly action: string;
  /** Physical key codes that trigger this action. */
  readonly codes: readonly string[];
}

// ---------------------------------------------------------------------------
// input/action:triggered
// ---------------------------------------------------------------------------

/**
 * Parameters for `input/action:triggered`.
 *
 * Emitted automatically after `input/key:down` or `input/key:up` when a
 * bound key changes state.  Subscribe to this event instead of raw key events
 * to keep game logic decoupled from physical key assignments.
 *
 * @example
 * ```ts
 * core.events.on('myGame', 'input/action:triggered', (params) => {
 *   if (params.action === 'jump' && params.state === 'pressed') {
 *     player.jump();
 *   }
 * });
 * ```
 */
export interface InputActionTriggeredParams {
  /** The logical action name (as registered via `input/action:bind`). */
  readonly action: string;
  /** Whether the action key was just pressed or released. */
  readonly state: 'pressed' | 'released';
}

// ---------------------------------------------------------------------------
// input/gamepad:button:down
// ---------------------------------------------------------------------------

/**
 * Parameters for `input/gamepad:button:down`.
 *
 * Emitted once when a gamepad button transitions from **released → pressed**.
 *
 * Gamepad buttons can also be used in `input/action:bind` via the code format
 * `'Gamepad:<gamepadIndex>:<buttonIndex>'` (e.g. `'Gamepad:0:0'`).
 */
export interface InputGamepadButtonDownParams {
  /** Zero-based index of the gamepad (matches `navigator.getGamepads()` order). */
  readonly gamepadIndex: number;
  /** Zero-based index of the button on the gamepad. */
  readonly button: number;
  /** How hard the button is pressed (`0`–`1`). */
  readonly value: number;
}

// ---------------------------------------------------------------------------
// input/gamepad:button:up
// ---------------------------------------------------------------------------

/**
 * Parameters for `input/gamepad:button:up`.
 *
 * Emitted once when a gamepad button transitions from **pressed → released**.
 */
export interface InputGamepadButtonUpParams {
  /** Zero-based index of the gamepad. */
  readonly gamepadIndex: number;
  /** Zero-based index of the button on the gamepad. */
  readonly button: number;
}

// ---------------------------------------------------------------------------
// input/gamepad:axes
// ---------------------------------------------------------------------------

/**
 * Parameters for `input/gamepad:axes`.
 *
 * Emitted every frame for each connected gamepad that has at least one axis
 * with an absolute value above the default deadzone (`0.05`).
 * Use this event for raw analog reading; for digital action mapping prefer
 * `input/gamepad:axis:bind`.
 */
export interface InputGamepadAxesParams {
  /** Zero-based index of the gamepad. */
  readonly gamepadIndex: number;
  /** Current axis values in the range `−1`–`+1`, indexed by axis number. */
  readonly axes: readonly number[];
}

// ---------------------------------------------------------------------------
// input/gamepad:axis:bind
// ---------------------------------------------------------------------------

/**
 * Parameters for `input/gamepad:axis:bind`.
 *
 * Maps a gamepad analog axis to a logical action, emitting
 * `input/action:triggered` with `state: 'pressed'` when the axis value
 * crosses `threshold` and `state: 'released'` when it falls back within
 * the deadzone.
 *
 * @example
 * ```ts
 * // Map left-stick horizontal to 'move-right' / 'move-left'
 * core.events.emitSync('input/gamepad:axis:bind', {
 *   action: 'move-right',
 *   axisIndex: 0,
 *   direction: 'positive',
 * });
 * core.events.emitSync('input/gamepad:axis:bind', {
 *   action: 'move-left',
 *   axisIndex: 0,
 *   direction: 'negative',
 * });
 * ```
 */
export interface InputGamepadAxisBindParams {
  /** Logical action name to trigger. */
  readonly action: string;
  /** Zero-based gamepad index to read from. Defaults to `0`. */
  readonly gamepadIndex?: number;
  /** Zero-based axis index on the gamepad. */
  readonly axisIndex: number;
  /**
   * Minimum absolute axis value (exclusive) before the axis is considered
   * active.  Values within `[−deadzone, +deadzone]` are treated as zero.
   * Defaults to `0.1`.
   */
  readonly deadzone?: number;
  /**
   * Axis value (absolute) at which `state: 'pressed'` fires.
   * Defaults to `0.5`.
   */
  readonly threshold?: number;
  /**
   * Which half of the axis range triggers the action.
   * `'positive'` → axis > threshold,
   * `'negative'` → axis < −threshold,
   * `'both'` → either direction (default).
   */
  readonly direction?: 'positive' | 'negative' | 'both';
}

// ---------------------------------------------------------------------------
// input/gamepad:vibrate
// ---------------------------------------------------------------------------

/**
 * Parameters for `input/gamepad:vibrate`.
 *
 * Requests haptic feedback on a connected gamepad.
 * Has no effect if the browser or controller does not support vibration.
 *
 * @example
 * ```ts
 * core.events.emitSync('input/gamepad:vibrate', {
 *   duration: 200,
 *   strongMagnitude: 0.8,
 *   weakMagnitude: 0.3,
 * });
 * ```
 */
export interface InputGamepadVibrateParams {
  /** Zero-based gamepad index. Defaults to `0`. */
  readonly gamepadIndex?: number;
  /** Vibration duration in milliseconds. */
  readonly duration: number;
  /** Low-frequency (strong) motor magnitude in the range `0`–`1`. Defaults to `1`. */
  readonly strongMagnitude?: number;
  /** High-frequency (weak) motor magnitude in the range `0`–`1`. Defaults to `1`. */
  readonly weakMagnitude?: number;
}

// ---------------------------------------------------------------------------
// input/gamepad:connected
// ---------------------------------------------------------------------------

/**
 * Parameters for `input/gamepad:connected`.
 *
 * Emitted when the browser fires a `gamepadconnected` DOM event — i.e. when a
 * controller is plugged in or becomes active for the first time.
 */
export interface InputGamepadConnectedParams {
  /** Zero-based index of the newly connected gamepad. */
  readonly gamepadIndex: number;
  /** Human-readable name of the gamepad, sourced from `Gamepad.id`. */
  readonly id: string;
}

// ---------------------------------------------------------------------------
// input/gamepad:disconnected
// ---------------------------------------------------------------------------

/**
 * Parameters for `input/gamepad:disconnected`.
 *
 * Emitted when the browser fires a `gamepaddisconnected` DOM event — i.e.
 * when a controller is unplugged or loses connectivity.
 */
export interface InputGamepadDisconnectedParams {
  /** Zero-based index of the disconnected gamepad. */
  readonly gamepadIndex: number;
  /** Human-readable name of the gamepad, sourced from `Gamepad.id`. */
  readonly id: string;
}

// ---------------------------------------------------------------------------
// input/touch:start
// ---------------------------------------------------------------------------

/**
 * Parameters for `input/touch:start`.
 *
 * Emitted when a new touch point begins contact (Pointer Events with
 * `pointerType === 'touch'`).
 */
export interface InputTouchStartParams {
  /** Unique identifier for this touch point (`PointerEvent.pointerId`). */
  readonly pointerId: number;
  /** Horizontal position in client (viewport) coordinates. */
  readonly x: number;
  /** Vertical position in client (viewport) coordinates. */
  readonly y: number;
}

// ---------------------------------------------------------------------------
// input/touch:end
// ---------------------------------------------------------------------------

/**
 * Parameters for `input/touch:end`.
 *
 * Emitted when a touch point leaves contact (or is cancelled).
 */
export interface InputTouchEndParams {
  /** Unique identifier for this touch point. */
  readonly pointerId: number;
  /** Horizontal position in client coordinates at the moment of lift. */
  readonly x: number;
  /** Vertical position in client coordinates at the moment of lift. */
  readonly y: number;
}

// ---------------------------------------------------------------------------
// input/touch:move
// ---------------------------------------------------------------------------

/**
 * Parameters for `input/touch:move`.
 *
 * Emitted **at most once per frame** per touch point (throttled to the
 * `core/tick` rhythm).  Carries the final position and accumulated delta
 * for that frame.
 */
export interface InputTouchMoveParams {
  /** Unique identifier for this touch point. */
  readonly pointerId: number;
  /** Final horizontal position this frame in client coordinates. */
  readonly x: number;
  /** Final vertical position this frame in client coordinates. */
  readonly y: number;
  /** Horizontal movement since the last `input/touch:move` event for this point. */
  readonly dx: number;
  /** Vertical movement since the last `input/touch:move` event for this point. */
  readonly dy: number;
}

// ---------------------------------------------------------------------------
// input/gesture:pinch
// ---------------------------------------------------------------------------

/**
 * Parameters for `input/gesture:pinch`.
 *
 * Emitted once per frame while exactly two touch points are active and at
 * least one has moved.  Values are relative to when the two-finger gesture
 * began (i.e. the moment the second finger made contact).
 */
export interface InputGesturePinchParams {
  /**
   * Current distance between the two touch points divided by the distance
   * at gesture start.  `> 1` means the fingers moved apart (zoom in),
   * `< 1` means they moved closer (zoom out).
   */
  readonly scale: number;
  /**
   * Multiplicative change since the last event
   * (`currentDistance / previousDistance`).
   */
  readonly delta: number;
  /** Horizontal midpoint of the two touch points in client coordinates. */
  readonly centerX: number;
  /** Vertical midpoint of the two touch points in client coordinates. */
  readonly centerY: number;
}

// ---------------------------------------------------------------------------
// input/gesture:rotate
// ---------------------------------------------------------------------------

/**
 * Parameters for `input/gesture:rotate`.
 *
 * Emitted once per frame while exactly two touch points are active and at
 * least one has moved.
 */
export interface InputGestureRotateParams {
  /**
   * Total rotation in **radians** accumulated since the gesture started.
   * Positive values are clockwise, negative are counter-clockwise (matches
   * the browser's `atan2` convention).
   */
  readonly rotation: number;
  /** Change in rotation (radians) since the last event. */
  readonly delta: number;
  /** Horizontal midpoint of the two touch points in client coordinates. */
  readonly centerX: number;
  /** Vertical midpoint of the two touch points in client coordinates. */
  readonly centerY: number;
}

// ---------------------------------------------------------------------------
// input/gesture:swipe
// ---------------------------------------------------------------------------

/**
 * Parameters for `input/gesture:swipe`.
 *
 * Emitted when a single touch point lifts and the motion was fast enough
 * and long enough to qualify as a swipe (default: distance ≥ 30 px,
 * velocity ≥ 0.1 px/ms).
 *
 * The dominant axis (horizontal vs. vertical) determines the direction.
 */
export interface InputGestureSwipeParams {
  /** The dominant direction of the swipe. */
  readonly direction: 'left' | 'right' | 'up' | 'down';
  /** Swipe velocity in pixels per millisecond. */
  readonly velocity: number;
  /** Euclidean distance of the swipe in pixels. */
  readonly distance: number;
  /** X position where the touch began. */
  readonly startX: number;
  /** Y position where the touch began. */
  readonly startY: number;
  /** X position where the touch ended. */
  readonly endX: number;
  /** Y position where the touch ended. */
  readonly endY: number;
}

// ---------------------------------------------------------------------------
// input/touch:state  (Pull query)
// ---------------------------------------------------------------------------

/**
 * Output for `input/touch:state`.
 *
 * Synchronous query — use `core.events.emitSync` to retrieve all currently
 * active touch points without subscribing to push events.
 *
 * @example
 * ```ts
 * const { output } = core.events.emitSync<Record<string, never>, InputTouchStateOutput>(
 *   'input/touch:state',
 *   {},
 * );
 * console.log(output.touches.size); // number of active touches
 * ```
 */
export interface InputTouchStateOutput {
  /**
   * Map of currently active touch points keyed by `pointerId`.
   * Each entry holds the current `{ x, y }` in client coordinates.
   */
  touches: Map<number, { x: number; y: number }>;
}

// ---------------------------------------------------------------------------
// InputRecorder — shared data structures
// ---------------------------------------------------------------------------

/**
 * A single recorded input event.
 */
export interface InputRecordEntry {
  /** The engine-frame number at which this event was emitted. */
  readonly frame: number;
  /** The event name (e.g. `'input/key:down'`). */
  readonly event: string;
  /** The raw parameters object passed to the event. */
  readonly params: unknown;
}

/**
 * A complete, self-contained recording of input events.
 *
 * Designed to be JSON-serialisable so it can be persisted via `SaveManager`
 * or sent over the network.
 */
export interface InputRecording {
  /** Schema version — currently always `1`. */
  readonly version: 1;
  /** Ordered list of all recorded input events. */
  readonly entries: InputRecordEntry[];
  /** Total number of engine frames captured. */
  readonly frameCount: number;
  /** Unix timestamp (ms) when the recording was started. */
  readonly createdAt: number;
}

// ---------------------------------------------------------------------------
// input/recorder:start
// ---------------------------------------------------------------------------

/**
 * Parameters for `input/recorder:start`.
 *
 * Starts recording all `input/*` events.  If a recording is already in
 * progress it is discarded and a fresh recording begins.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface InputRecorderStartParams {
  // intentionally empty — no options currently
}

// ---------------------------------------------------------------------------
// input/recorder:stop
// ---------------------------------------------------------------------------

/**
 * Output for `input/recorder:stop`.
 *
 * Stops an active recording and returns the captured data.
 */
export interface InputRecorderStopOutput {
  /** The completed recording.  `null` if no recording was in progress. */
  readonly recording: InputRecording | null;
}

// ---------------------------------------------------------------------------
// input/recorder:play
// ---------------------------------------------------------------------------

/**
 * Parameters for `input/recorder:play`.
 *
 * Starts playing back a previously captured recording.  During playback the
 * recorder injects the recorded events into the EventBus on the correct
 * frame so game logic reacts as if the original input was happening live.
 */
export interface InputRecorderPlayParams {
  /** The recording to replay. */
  readonly recording: InputRecording;
  /** When `true` the recording loops indefinitely.  Defaults to `false`. */
  readonly loop?: boolean;
}

// ---------------------------------------------------------------------------
// input/recorder:pause  /  input/recorder:resume
// ---------------------------------------------------------------------------

/**
 * Parameters for `input/recorder:pause`.
 *
 * Pauses an active playback without discarding the position.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface InputRecorderPauseParams {
  // intentionally empty
}

/**
 * Parameters for `input/recorder:resume`.
 *
 * Resumes a paused playback from where it was paused.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface InputRecorderResumeParams {
  // intentionally empty
}

// ---------------------------------------------------------------------------
// input/recorder:save
// ---------------------------------------------------------------------------

/**
 * Parameters for `input/recorder:save`.
 *
 * Serialises a recording to JSON and persists it via `SaveManager` into the
 * global save area under the key `inputRecording/<slotId>`.
 */
export interface InputRecorderSaveParams {
  /** Unique identifier for this recording within the global save. */
  readonly slotId: string;
  /** The recording to persist. */
  readonly recording: InputRecording;
}

// ---------------------------------------------------------------------------
// input/recorder:load
// ---------------------------------------------------------------------------

/**
 * Parameters for `input/recorder:load`.
 *
 * Loads a previously saved recording from the global save area.
 */
export interface InputRecorderLoadParams {
  /** The `slotId` passed to `input/recorder:save`. */
  readonly slotId: string;
}

/**
 * Output for `input/recorder:load`.
 */
export interface InputRecorderLoadOutput {
  /** The loaded recording, or `null` if no recording was found for that key. */
  readonly recording: InputRecording | null;
}

// ---------------------------------------------------------------------------
// input/recorder:state  (Pull query)
// ---------------------------------------------------------------------------

/**
 * Output for `input/recorder:state`.
 *
 * Synchronous query — call with `emitSync` to inspect the current recorder
 * status without subscribing to push events.
 */
export interface InputRecorderStateOutput {
  /** Current operational state of the recorder. */
  readonly state: 'idle' | 'recording' | 'playing' | 'paused';
  /**
   * Current frame counter.
   * During recording: the number of frames captured so far.
   * During playback / paused: the current playback frame.
   * When idle: `0`.
   */
  readonly frame: number;
}

// ---------------------------------------------------------------------------
// input/recorder:playback:end
// ---------------------------------------------------------------------------

/**
 * Parameters for `input/recorder:playback:end`.
 *
 * Emitted when a non-looping playback reaches the end of the recording, or
 * when `input/recorder:stop` is called during playback.
 */
export interface InputRecorderPlaybackEndParams {
  /** The recording that just finished playing. */
  readonly recording: InputRecording;
}
