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
