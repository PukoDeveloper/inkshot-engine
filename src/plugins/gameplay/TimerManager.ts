import type { Core } from '../../core/Core.js';
import type { EnginePlugin } from '../../types/plugin.js';
import type {
  TimerOnceParams,
  TimerIntervalParams,
  TimerCancelParams,
  TimerCooldownParams,
  TimerCooldownOutput,
  TimerFiredParams,
  TimerCancelledParams,
  TimerCancelAllOutput,
} from '../../types/timer.js';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface TimerEntry {
  readonly id: string;
  readonly type: 'once' | 'interval';
  /** For 'interval': the original interval duration (ms). */
  readonly interval?: number;
  /** Remaining ms until the next fire. */
  remaining: number;
  /** How many times this timer has fired so far. */
  count: number;
  /** Maximum number of times to fire (undefined = unlimited). */
  readonly maxCount?: number;
}

interface CooldownEntry {
  readonly duration: number;
  elapsed: number;
}

// ---------------------------------------------------------------------------
// TimerManager
// ---------------------------------------------------------------------------

/**
 * Built-in plugin that provides timer and cooldown scheduling.
 *
 * All timers are driven by `core/tick` and automatically pause / resume with
 * the game loop (`core/pause` / `core/resume`).
 *
 * ### Events handled
 *
 * | Event              | Description                                                  |
 * |--------------------|--------------------------------------------------------------|
 * | `timer/once`       | Schedule a one-shot callback after `delay` ms                |
 * | `timer/interval`   | Schedule a repeating callback every `interval` ms            |
 * | `timer/cancel`     | Cancel an active timer or cooldown by id                     |
 * | `timer/cancel-all` | Cancel every active timer and cooldown at once               |
 * | `timer/cooldown`   | Start / reset a cooldown, or query its readiness             |
 *
 * ### Events emitted
 *
 * | Event              | When                                                         |
 * |--------------------|--------------------------------------------------------------|
 * | `timer/fired`      | When a once or interval timer fires                          |
 * | `timer/cancelled`  | When `timer/cancel` or `timer/cancel-all` removes a timer    |
 *
 * ### Direct accessors (Pull API)
 *
 * | Method                    | Returns                                              |
 * |---------------------------|------------------------------------------------------|
 * | `isTimerActive(id)`       | `true` while a once/interval timer is still waiting  |
 * | `getTimeRemaining(id)`    | ms until the next fire (0 if not active)             |
 * | `getCooldownProgress(id)` | Completion ratio `0`–`1` for a cooldown              |
 *
 * ---
 *
 * ### Usage
 * ```ts
 * import { createEngine, TimerManager } from 'inkshot-engine';
 *
 * const timer = new TimerManager();
 * const { core } = await createEngine({ plugins: [timer] });
 *
 * // One-shot: fire once after 2 s
 * core.events.emitSync('timer/once', { id: 'respawn', delay: 2000 });
 *
 * // Interval: fire every 500 ms (unlimited)
 * core.events.emitSync('timer/interval', { id: 'tick', interval: 500 });
 *
 * // Listen for fires
 * core.events.on('myGame', 'timer/fired', ({ id, count }) => {
 *   if (id === 'respawn') spawnPlayer();
 * });
 *
 * // Cooldown: start a 1-second cooldown on attack
 * core.events.emitSync('timer/cooldown', { id: 'attack', duration: 1000 });
 *
 * // Later: check if attack is ready
 * const { output } = core.events.emitSync('timer/cooldown', { id: 'attack' });
 * if (output.ready) performAttack();
 *
 * // Cancel everything on scene transition
 * core.events.emitSync('timer/cancel-all', {});
 * ```
 */
export class TimerManager implements EnginePlugin {
  readonly namespace = 'timer';
  readonly editorMeta = {
    displayName: 'Timer Manager',
    icon: 'timer',
    description: 'Event-driven one-shot timers, repeating intervals, and cooldown checks.',
    events: [
      'timer/once', 'timer/interval', 'timer/cancel', 'timer/cancel-all', 'timer/cooldown',
    ] as const,
  };

  // ---------------------------------------------------------------------------
  // Internal state
  // ---------------------------------------------------------------------------

  private readonly _timers = new Map<string, TimerEntry>();
  private readonly _cooldowns = new Map<string, CooldownEntry>();

  /** Whether the game loop is currently paused — timers freeze while true. */
  private _paused = false;

  // ---------------------------------------------------------------------------
  // EnginePlugin lifecycle
  // ---------------------------------------------------------------------------

  init(core: Core): void {
    const { events } = core;

    // ── timer/once ────────────────────────────────────────────────────────
    events.on<TimerOnceParams>(this.namespace, 'timer/once', (params) => {
      this._timers.set(params.id, {
        id: params.id,
        type: 'once',
        remaining: params.delay,
        count: 0,
      });
    });

    // ── timer/interval ───────────────────────────────────────────────────
    events.on<TimerIntervalParams>(this.namespace, 'timer/interval', (params) => {
      this._timers.set(params.id, {
        id: params.id,
        type: 'interval',
        interval: params.interval,
        remaining: params.interval,
        count: 0,
        maxCount: params.repeat && params.repeat > 0 ? params.repeat : undefined,
      });
    });

    // ── timer/cancel ──────────────────────────────────────────────────────
    events.on<TimerCancelParams>(this.namespace, 'timer/cancel', (params) => {
      const hadTimer = this._timers.delete(params.id);
      const hadCooldown = this._cooldowns.delete(params.id);
      if (hadTimer || hadCooldown) {
        events.emitSync<TimerCancelledParams, Record<string, never>>(
          'timer/cancelled',
          { id: params.id },
        );
      }
    });

    // ── timer/cancel-all ──────────────────────────────────────────────────
    events.on<Record<string, never>, TimerCancelAllOutput>(
      this.namespace,
      'timer/cancel-all',
      (_params, output) => {
        let count = 0;
        for (const id of [...this._timers.keys(), ...this._cooldowns.keys()]) {
          const hadTimer = this._timers.delete(id);
          const hadCooldown = this._cooldowns.delete(id);
          if (hadTimer || hadCooldown) {
            count += 1;
            events.emitSync<TimerCancelledParams, Record<string, never>>(
              'timer/cancelled',
              { id },
            );
          }
        }
        output.cancelledCount = count;
      },
    );

    // ── timer/cooldown ────────────────────────────────────────────────────
    events.on<TimerCooldownParams, TimerCooldownOutput>(
      this.namespace,
      'timer/cooldown',
      (params, output) => {
        if (params.duration !== undefined) {
          // Setter: start or reset the cooldown.
          this._cooldowns.set(params.id, { duration: params.duration, elapsed: 0 });
          output.ready = false;
        } else {
          // Getter: query readiness without side effects.
          const cd = this._cooldowns.get(params.id);
          output.ready = cd === undefined || cd.elapsed >= cd.duration;
        }
      },
    );

    // ── Advance timers each frame (before-phase, so game logic runs after) ─
    events.on(
      this.namespace,
      'core/tick',
      (params: { delta: number; elapsed: number }) => {
        if (this._paused) return;
        const dt = params.elapsed;

        // Advance cooldowns
        for (const cd of this._cooldowns.values()) {
          if (cd.elapsed < cd.duration) {
            cd.elapsed = Math.min(cd.elapsed + dt, cd.duration);
          }
        }

        // Advance timers and collect those that have fired or finished.
        const toRemove: string[] = [];

        for (const entry of this._timers.values()) {
          entry.remaining -= dt;

          if (entry.type === 'once') {
            if (entry.remaining <= 0) {
              entry.count += 1;
              toRemove.push(entry.id);
              events.emitSync<TimerFiredParams, Record<string, never>>(
                'timer/fired',
                { id: entry.id, count: entry.count },
              );
            }
          } else {
            // Interval: handle burst (multiple fires) when dt > interval.
            // Cap at MAX_BURST_FIRES to avoid a single runaway tick when the
            // page was backgrounded (tab hidden) and resumes with a huge dt.
            const MAX_BURST_FIRES = 10;
            let burstCount = 0;
            while (entry.remaining <= 0 && burstCount < MAX_BURST_FIRES) {
              burstCount += 1;
              entry.count += 1;
              const done =
                entry.maxCount !== undefined && entry.count >= entry.maxCount;

              events.emitSync<TimerFiredParams, Record<string, never>>(
                'timer/fired',
                { id: entry.id, count: entry.count },
              );

              if (done) {
                toRemove.push(entry.id);
                break;
              }
              entry.remaining += entry.interval!;
            }
          }
        }

        for (const id of toRemove) {
          this._timers.delete(id);
        }
      },
      { phase: 'before' },
    );

    // ── Pause / resume with the game loop ────────────────────────────────
    events.on(this.namespace, 'core/pause', () => {
      this._paused = true;
    });

    events.on(this.namespace, 'core/resume', () => {
      this._paused = false;
    });
  }

  destroy(core: Core): void {
    core.events.removeNamespace(this.namespace);
    this._timers.clear();
    this._cooldowns.clear();
    this._paused = false;
  }

  // ---------------------------------------------------------------------------
  // Direct accessor API (Pull — use when you hold a plugin reference)
  // ---------------------------------------------------------------------------

  /**
   * Returns `true` when a once or interval timer with the given `id` is
   * currently active (i.e. registered and waiting to fire).
   *
   * @example
   * ```ts
   * if (timerManager.isTimerActive('respawn')) {
   *   showRespawnCountdown();
   * }
   * ```
   */
  isTimerActive(id: string): boolean {
    return this._timers.has(id);
  }

  /**
   * Returns the number of milliseconds remaining until the next fire of the
   * timer with the given `id`, or `0` if no such timer is active.
   *
   * For a `once` timer this is the time until it fires.
   * For an `interval` timer this is the time until the **next** fire.
   *
   * @example
   * ```ts
   * const ms = timerManager.getTimeRemaining('respawn');
   * ui.updateCountdown(Math.ceil(ms / 1000));
   * ```
   */
  getTimeRemaining(id: string): number {
    const entry = this._timers.get(id);
    if (!entry) return 0;
    // `remaining` can go slightly negative between the last tick and fire; clamp.
    return Math.max(0, entry.remaining);
  }

  /**
   * Returns the completion progress of a cooldown as a value between `0`
   * (just started) and `1` (fully elapsed / ready).
   *
   * Returns `1` when no cooldown with the given `id` is registered, matching
   * the "ready" semantics of the `timer/cooldown` query event.
   *
   * @example
   * ```ts
   * const progress = timerManager.getCooldownProgress('attack');
   * attackCooldownBar.setFill(progress); // 0 → 1
   * ```
   */
  getCooldownProgress(id: string): number {
    const cd = this._cooldowns.get(id);
    if (!cd) return 1;
    return cd.duration > 0 ? Math.min(cd.elapsed / cd.duration, 1) : 1;
  }
}
