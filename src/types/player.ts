// ---------------------------------------------------------------------------
// PlayerController options
// ---------------------------------------------------------------------------

/**
 * Constructor options for {@link PlayerController}.
 */
export interface PlayerControllerOptions {
  /**
   * ID of the entity to control at construction time.
   *
   * Can also be set (or changed) later at runtime via `player/entity:set`.
   */
  entityId?: string;

  /**
   * Movement speed in pixels per second.
   *
   * Defaults to `120`.
   */
  speed?: number;

  /**
   * Entity tag used for automatic entity detection.
   *
   * When an entity is created with this tag and no entity is currently
   * controlled, the controller automatically adopts it — no explicit
   * `player/entity:set` call is needed.
   *
   * Defaults to `'player'`. Pass an empty string (`''`) to disable
   * auto-detection entirely.
   *
   * @example
   * ```ts
   * // Default: automatically adopts any entity tagged 'player'.
   * new PlayerController()
   *
   * // Custom tag.
   * new PlayerController({ playerTag: 'hero' })
   *
   * // Opt-out of auto-detection entirely.
   * new PlayerController({ playerTag: '' })
   * ```
   */
  playerTag?: string;

  /**
   * Logical action names that map to movement directions and interaction.
   *
   * These must match the bindings registered via `input/action:bind`.
   * Any omitted key falls back to the default value shown below.
   *
   * @example
   * ```ts
   * new PlayerController({
   *   actions: { up: 'walk-up', down: 'walk-down', left: 'walk-left', right: 'walk-right' },
   * });
   * ```
   */
  actions?: {
    /** Action name for moving upward.    Default: `'move-up'`. */
    up?: string;
    /** Action name for moving downward.  Default: `'move-down'`. */
    down?: string;
    /** Action name for moving left.      Default: `'move-left'`. */
    left?: string;
    /** Action name for moving right.     Default: `'move-right'`. */
    right?: string;
    /** Action name for the interact key. Default: `'interact'`. */
    interact?: string;
  };
}

// ---------------------------------------------------------------------------
// player/entity:set
// ---------------------------------------------------------------------------

/** Parameters for `player/entity:set`. */
export interface PlayerEntitySetParams {
  /** ID of the entity to control from this point onwards. */
  readonly entityId: string;
}

// ---------------------------------------------------------------------------
// player/moved
// ---------------------------------------------------------------------------

/**
 * Emitted each fixed-update frame when the player entity is successfully
 * moved (only fires when `dx` or `dy` is non-zero).
 */
export interface PlayerMovedParams {
  /** ID of the player entity. */
  readonly entityId: string;
  /** Final world X position after the move. */
  readonly x: number;
  /** Final world Y position after the move. */
  readonly y: number;
  /**
   * Horizontal displacement requested this frame in pixels.
   *
   * May differ from the actual movement when a physics adapter resolves
   * collisions.
   */
  readonly dx: number;
  /**
   * Vertical displacement requested this frame in pixels.
   *
   * May differ from the actual movement when a physics adapter resolves
   * collisions.
   */
  readonly dy: number;
}

// ---------------------------------------------------------------------------
// player/interact
// ---------------------------------------------------------------------------

/**
 * Emitted when the player presses the interact action key, but **only** when
 * the game phase is `'playing'`.
 *
 * Listen to this event in actor triggers or map-event handlers to react to
 * player interaction.
 */
export interface PlayerInteractParams {
  /**
   * ID of the player entity at the time of the press, or `null` if no entity
   * is currently controlled.
   */
  readonly entityId: string | null;
  /** Player's world X position at the time of the press. */
  readonly x: number;
  /** Player's world Y position at the time of the press. */
  readonly y: number;
}
