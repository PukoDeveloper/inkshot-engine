// ---------------------------------------------------------------------------
// timer/once
// ---------------------------------------------------------------------------

/**
 * Parameters for `timer/once`.
 *
 * Schedules a one-shot timer that fires `timer/fired` after `delay` ms.
 * Re-emitting with the same `id` replaces the existing timer.
 *
 * @example
 * ```ts
 * core.events.emitSync<TimerOnceParams>('timer/once', { id: 'respawn', delay: 3000 });
 * core.events.on('myGame', 'timer/fired', ({ id }) => {
 *   if (id === 'respawn') spawnPlayer();
 * });
 * ```
 */
export interface TimerOnceParams {
  /** Unique timer identifier. */
  readonly id: string;
  /** Milliseconds to wait before firing. */
  readonly delay: number;
}

// ---------------------------------------------------------------------------
// timer/interval
// ---------------------------------------------------------------------------

/**
 * Parameters for `timer/interval`.
 *
 * Schedules a repeating timer that fires `timer/fired` every `interval` ms.
 * Re-emitting with the same `id` replaces the existing timer.
 *
 * @example
 * ```ts
 * // Fire forever every second
 * core.events.emitSync<TimerIntervalParams>('timer/interval', {
 *   id: 'heartbeat',
 *   interval: 1000,
 * });
 *
 * // Fire exactly 3 times
 * core.events.emitSync<TimerIntervalParams>('timer/interval', {
 *   id: 'tripleShot',
 *   interval: 200,
 *   repeat: 3,
 * });
 * ```
 */
export interface TimerIntervalParams {
  /** Unique timer identifier. */
  readonly id: string;
  /** Milliseconds between each firing. */
  readonly interval: number;
  /**
   * Maximum number of times the timer should fire.
   * `undefined` or `0` means the timer repeats indefinitely.
   */
  readonly repeat?: number;
}

// ---------------------------------------------------------------------------
// timer/cancel
// ---------------------------------------------------------------------------

/**
 * Parameters for `timer/cancel`.
 *
 * Cancels an active once/interval timer or clears a cooldown.
 * Emits `timer/cancelled` if the timer existed.
 */
export interface TimerCancelParams {
  /** The identifier of the timer (or cooldown) to cancel. */
  readonly id: string;
}

// ---------------------------------------------------------------------------
// timer/cooldown  (setter + getter)
// ---------------------------------------------------------------------------

/**
 * Parameters for `timer/cooldown`.
 *
 * **Setter**: when `duration` is provided, starts or resets the cooldown for
 * `id`.  The `ready` output will be `false` immediately after setting.
 *
 * **Getter**: when `duration` is omitted, returns whether the cooldown period
 * has elapsed (or no cooldown was ever registered, which is considered ready).
 *
 * @example
 * ```ts
 * // Start a 1-second cooldown
 * core.events.emitSync<TimerCooldownParams, TimerCooldownOutput>(
 *   'timer/cooldown', { id: 'attack', duration: 1000 },
 * );
 *
 * // Later: check if the cooldown has elapsed
 * const { output } = core.events.emitSync<TimerCooldownParams, TimerCooldownOutput>(
 *   'timer/cooldown', { id: 'attack' },
 * );
 * if (output.ready) performAttack();
 * ```
 */
export interface TimerCooldownParams {
  /** Unique cooldown identifier. */
  readonly id: string;
  /**
   * Cooldown duration in milliseconds.
   * When provided the cooldown is started (or reset).
   * Omit to perform a read-only readiness check.
   */
  readonly duration?: number;
}

/**
 * Output for `timer/cooldown`.
 */
export interface TimerCooldownOutput {
  /**
   * `true` when the cooldown has fully elapsed (or was never registered).
   * `false` immediately after the cooldown is started and while it is active.
   */
  ready: boolean;
}

// ---------------------------------------------------------------------------
// timer/fired
// ---------------------------------------------------------------------------

/**
 * Parameters for `timer/fired`.
 *
 * Emitted by `TimerManager` whenever a once or interval timer fires.
 *
 * @example
 * ```ts
 * core.events.on('myGame', 'timer/fired', ({ id, count }) => {
 *   console.log(`Timer "${id}" fired (count: ${count})`);
 * });
 * ```
 */
export interface TimerFiredParams {
  /** The identifier of the timer that fired. */
  readonly id: string;
  /** How many times this timer has fired (1 for the first fire, 2 for the second, …). */
  readonly count: number;
}

// ---------------------------------------------------------------------------
// timer/cancelled
// ---------------------------------------------------------------------------

/**
 * Parameters for `timer/cancelled`.
 *
 * Emitted by `TimerManager` when a timer or cooldown is explicitly cancelled
 * via `timer/cancel`.
 */
export interface TimerCancelledParams {
  /** The identifier of the timer that was cancelled. */
  readonly id: string;
}

// ---------------------------------------------------------------------------
// timer/cancel-all
// ---------------------------------------------------------------------------

/**
 * Output for `timer/cancel-all`.
 *
 * Cancels **every** active timer and cooldown in one call.
 * `timer/cancelled` is emitted once for each removed entry.
 *
 * @example
 * ```ts
 * // On scene transition — wipe all outstanding timers
 * const { output } = core.events.emitSync<Record<string, never>, TimerCancelAllOutput>(
 *   'timer/cancel-all',
 *   {},
 * );
 * console.log(`Cancelled ${output.cancelledCount} timers / cooldowns.`);
 * ```
 */
export interface TimerCancelAllOutput {
  /** Number of timers and cooldowns that were actually cancelled. */
  cancelledCount: number;
}
