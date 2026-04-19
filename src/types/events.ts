/**
 * The phase of an event lifecycle.
 * When emitting `workspace/eventname`, the bus fires three phases in order:
 *   workspace/eventname-before  → workspace/eventname  → workspace/eventname-after
 */
export type EventPhase = 'before' | 'main' | 'after';

/**
 * The full qualified event key stored in the registry.
 * Format: `workspace/eventname` (main) or `workspace/eventname-before|after`
 */
export type EventKey = string;

/**
 * The name of the event as used in `emit` / `emitSync`.
 * Must match the pattern: `<workspace>/<eventname>`
 */
export type EventName = string;

/**
 * Controls the execution flow of the current event dispatch.
 */
export interface EventControl {
  /**
   * Stop ALL further listener execution, including subsequent phases.
   * Once called the bus will not invoke any more handlers for this dispatch.
   */
  break(): void;

  /**
   * Skip the remaining listeners in the current phase and move to the next one.
   * Has no effect if called in the `after` phase.
   */
  skipPhase(): void;

  /** Whether `break()` has been called during this dispatch. */
  readonly isBroken: boolean;

  /** Whether `skipPhase()` has been called during the current phase. */
  readonly isPhaseSkipped: boolean;
}

/**
 * The handler function registered by a listener.
 *
 * @template P  Type of the parameters passed to `emit`.
 * @template O  Type of the shared output object accumulated across all handlers.
 */
export type EventHandler<P = unknown, O extends object = Record<string, unknown>> = (
  params: Readonly<P>,
  output: O,
  control: EventControl,
) => void | Promise<void>;

/**
 * Registration options when subscribing to an event.
 */
export interface ListenerOptions {
  /**
   * Execution priority. Higher numbers run **first** within the same phase.
   * Defaults to `0`.
   */
  priority?: number;

  /**
   * Specific phase to listen on.
   * - `'before'` → fires in the `workspace/eventname-before` phase
   * - `'main'`   → fires in the `workspace/eventname` main phase (default)
   * - `'after'`  → fires in the `workspace/eventname-after` phase
   */
  phase?: EventPhase;
}

/**
 * Internal descriptor for a registered listener.
 */
export interface ListenerEntry<P = unknown, O extends object = Record<string, unknown>> {
  /** Namespace of the registrant (e.g. `'core'`, `'myPlugin'`). */
  namespace: string;
  handler: EventHandler<P, O>;
  priority: number;
}

/**
 * Result returned after a full event dispatch.
 */
export interface DispatchResult<O extends object = Record<string, unknown>> {
  /** The accumulated output object. */
  output: O;
  /** Whether the dispatch was stopped early via `control.break()`. */
  stopped: boolean;
}
