import type {
  EventControl,
  EventHandler,
  EventKey,
  EventName,
  EventPhase,
  ListenerEntry,
  ListenerOptions,
  DispatchResult,
} from '../types/events.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

const PHASE_SUFFIX: Record<EventPhase, string> = {
  before: '-before',
  main: '',
  after: '-after',
};

/**
 * Convert a base event name + phase into the internal storage key.
 * e.g. `('core/update', 'before')` → `'core/update-before'`
 */
function toKey(base: EventName, phase: EventPhase): EventKey {
  return `${base}${PHASE_SUFFIX[phase]}`;
}

/** Insert a listener into a sorted array (descending priority order). */
function insertSorted<P, O extends object>(
  arr: ListenerEntry<P, O>[],
  entry: ListenerEntry<P, O>,
): void {
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid].priority >= entry.priority) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }
  arr.splice(lo, 0, entry);
}

// ---------------------------------------------------------------------------
// EventControl implementation
// ---------------------------------------------------------------------------

class EventControlImpl implements EventControl {
  private _broken = false;
  private _phaseSkipped = false;

  break(): void {
    this._broken = true;
  }

  skipPhase(): void {
    this._phaseSkipped = true;
  }

  get isBroken(): boolean {
    return this._broken;
  }

  get isPhaseSkipped(): boolean {
    return this._phaseSkipped;
  }

  /** Called by the bus at the start of each new phase to reset the skip flag. */
  _resetPhase(): void {
    this._phaseSkipped = false;
  }
}

// ---------------------------------------------------------------------------
// EventBus
// ---------------------------------------------------------------------------

/**
 * A function registered to observe every event dispatched on the bus.
 *
 * Registered via {@link EventBus.addSpy}.  Called synchronously before the
 * first listener of each `emit` / `emitSync` call.  Must not throw.
 */
export type EventSpy = (event: EventName, params: unknown) => void;

/**
 * Central event bus for Inkshot Engine.
 *
 * ### Event naming
 * Events are identified by the pattern `workspace/eventname`.
 * When emitting, the bus automatically fires three sequential phases:
 *   1. `workspace/eventname-before`
 *   2. `workspace/eventname`  (main)
 *   3. `workspace/eventname-after`
 *
 * ### Listener registration
 * Every listener must supply its own namespace so the bus can track origin
 * (important for plugin isolation and debugging).
 *
 * ### Priority
 * Within a phase, listeners with a **higher** priority number are called first.
 *
 * ### Flow control
 * Each handler receives an `EventControl` object.
 * - `control.break()`     – stop all remaining handlers *and* phases.
 * - `control.skipPhase()` – skip the remaining handlers in the current phase
 *                           and continue with the next phase.
 */
export class EventBus {
  // Key → sorted listener array (descending by priority)
  private readonly _registry = new Map<EventKey, ListenerEntry[]>();

  /** Zero or more global spy functions called before every dispatch. */
  private readonly _spies: EventSpy[] = [];

  /**
   * Register a global spy that is called synchronously before every event
   * dispatch (`emit` **and** `emitSync`).
   *
   * Spies are called with the base event name and the raw params object.
   * They are invoked before any phase listeners run and must not throw.
   *
   * @returns A function that unregisters the spy when called.
   *
   * @example
   * ```ts
   * const unspy = core.events.addSpy((event, params) => {
   *   console.log('[event]', event, params);
   * });
   * // later:
   * unspy();
   * ```
   */
  addSpy(fn: EventSpy): () => void {
    this._spies.push(fn);
    return () => {
      const idx = this._spies.indexOf(fn);
      if (idx !== -1) this._spies.splice(idx, 1);
    };
  }

  // ---------------------------------------------------------------------------
  // Public API – registration
  // ---------------------------------------------------------------------------

  /**
   * Register a listener for an event.
   *
   * @param listenerNamespace  Namespace of the registrant (e.g. `'core'`, `'myPlugin'`).
   * @param event              Base event name (`workspace/eventname`).
   * @param handler            The handler to invoke.
   * @param options            Optional priority and phase.
   * @returns                  A function that unregisters this listener when called.
   */
  on<P = unknown, O extends object = Record<string, unknown>>(
    listenerNamespace: string,
    event: EventName,
    handler: EventHandler<P, O>,
    options: ListenerOptions = {},
  ): () => void {
    const { priority = 0, phase = 'main' } = options;
    const key = toKey(event, phase);

    if (!this._registry.has(key)) {
      this._registry.set(key, []);
    }

    const entry: ListenerEntry = {
      namespace: listenerNamespace,
      handler: handler as EventHandler,
      priority,
    };

    insertSorted(this._registry.get(key)!, entry);

    return () => this._off(key, entry);
  }

  /**
   * Register a listener that automatically unregisters after the first invocation.
   */
  once<P = unknown, O extends object = Record<string, unknown>>(
    listenerNamespace: string,
    event: EventName,
    handler: EventHandler<P, O>,
    options: ListenerOptions = {},
  ): () => void {
    let unregister!: () => void;
    const wrapped: EventHandler<P, O> = (params, output, control) => {
      unregister();
      return handler(params, output, control);
    };
    unregister = this.on(listenerNamespace, event, wrapped, options);
    return unregister;
  }

  // ---------------------------------------------------------------------------
  // Public API – dispatch (async)
  // ---------------------------------------------------------------------------

  /**
   * Emit an event **asynchronously**.
   *
   * Fires phases in order: `before` → `main` → `after`.
   * Returns the accumulated output object and a `stopped` flag.
   *
   * @param event   Base event name (`workspace/eventname`).
   * @param params  Parameters forwarded to every handler.
   * @param seed    Optional initial value for the shared output object.
   */
  async emit<P = unknown, O extends object = Record<string, unknown>>(
    event: EventName,
    params: P,
    seed?: Partial<O>,
  ): Promise<DispatchResult<O>> {
    for (const spy of this._spies) spy(event, params);
    const output = (seed ? { ...seed } : {}) as O;
    const control = new EventControlImpl();

    for (const phase of ['before', 'main', 'after'] as EventPhase[]) {
      if (control.isBroken) break;
      control._resetPhase();

      const listeners = this._registry.get(toKey(event, phase)) ?? [];
      for (const entry of listeners) {
        if (control.isBroken || control.isPhaseSkipped) break;
        await (entry.handler as EventHandler<P, O>)(params, output, control);
      }
    }

    return { output, stopped: control.isBroken };
  }

  // ---------------------------------------------------------------------------
  // Public API – dispatch (sync)
  // ---------------------------------------------------------------------------

  /**
   * Emit an event **synchronously**.
   *
   * Handlers that return a Promise are **not** awaited; use `emit` for async
   * handlers.
   *
   * @param event   Base event name (`workspace/eventname`).
   * @param params  Parameters forwarded to every handler.
   * @param seed    Optional initial value for the shared output object.
   */
  emitSync<P = unknown, O extends object = Record<string, unknown>>(
    event: EventName,
    params: P,
    seed?: Partial<O>,
  ): DispatchResult<O> {
    for (const spy of this._spies) spy(event, params);
    const output = (seed ? { ...seed } : {}) as O;
    const control = new EventControlImpl();

    for (const phase of ['before', 'main', 'after'] as EventPhase[]) {
      if (control.isBroken) break;
      control._resetPhase();

      const listeners = this._registry.get(toKey(event, phase)) ?? [];
      for (const entry of listeners) {
        if (control.isBroken || control.isPhaseSkipped) break;
        (entry.handler as EventHandler<P, O>)(params, output, control);
      }
    }

    return { output, stopped: control.isBroken };
  }

  // ---------------------------------------------------------------------------
  // Utility
  // ---------------------------------------------------------------------------

  /**
   * Remove all listeners associated with a given namespace.
   * Useful when unloading a plugin.
   */
  removeNamespace(namespace: string): void {
    for (const [key, listeners] of this._registry) {
      const filtered = listeners.filter((e) => e.namespace !== namespace);
      if (filtered.length === 0) {
        this._registry.delete(key);
      } else {
        this._registry.set(key, filtered);
      }
    }
  }

  /** Remove all registered listeners. */
  clear(): void {
    this._registry.clear();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _off(key: EventKey, entry: ListenerEntry): void {
    const listeners = this._registry.get(key);
    if (!listeners) return;
    const idx = listeners.indexOf(entry);
    if (idx !== -1) listeners.splice(idx, 1);
    if (listeners.length === 0) this._registry.delete(key);
  }
}
