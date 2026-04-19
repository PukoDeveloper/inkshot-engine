// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
const PHASE_SUFFIX = {
    before: '-before',
    main: '',
    after: '-after',
};
/**
 * Convert a base event name + phase into the internal storage key.
 * e.g. `('core/update', 'before')` → `'core/update-before'`
 */
function toKey(base, phase) {
    return `${base}${PHASE_SUFFIX[phase]}`;
}
/** Insert a listener into a sorted array (descending priority order). */
function insertSorted(arr, entry) {
    let lo = 0;
    let hi = arr.length;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (arr[mid].priority >= entry.priority) {
            lo = mid + 1;
        }
        else {
            hi = mid;
        }
    }
    arr.splice(lo, 0, entry);
}
// ---------------------------------------------------------------------------
// EventControl implementation
// ---------------------------------------------------------------------------
class EventControlImpl {
    _broken = false;
    _phaseSkipped = false;
    break() {
        this._broken = true;
    }
    skipPhase() {
        this._phaseSkipped = true;
    }
    get isBroken() {
        return this._broken;
    }
    get isPhaseSkipped() {
        return this._phaseSkipped;
    }
    /** Called by the bus at the start of each new phase to reset the skip flag. */
    _resetPhase() {
        this._phaseSkipped = false;
    }
}
// ---------------------------------------------------------------------------
// EventBus
// ---------------------------------------------------------------------------
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
    _registry = new Map();
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
    on(listenerNamespace, event, handler, options = {}) {
        const { priority = 0, phase = 'main' } = options;
        const key = toKey(event, phase);
        if (!this._registry.has(key)) {
            this._registry.set(key, []);
        }
        const entry = {
            namespace: listenerNamespace,
            handler: handler,
            priority,
        };
        insertSorted(this._registry.get(key), entry);
        return () => this._off(key, entry);
    }
    /**
     * Register a listener that automatically unregisters after the first invocation.
     */
    once(listenerNamespace, event, handler, options = {}) {
        let unregister;
        const wrapped = (params, output, control) => {
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
    async emit(event, params, seed) {
        const output = (seed ? { ...seed } : {});
        const control = new EventControlImpl();
        for (const phase of ['before', 'main', 'after']) {
            if (control.isBroken)
                break;
            control._resetPhase();
            const listeners = this._registry.get(toKey(event, phase)) ?? [];
            for (const entry of listeners) {
                if (control.isBroken || control.isPhaseSkipped)
                    break;
                await entry.handler(params, output, control);
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
    emitSync(event, params, seed) {
        const output = (seed ? { ...seed } : {});
        const control = new EventControlImpl();
        for (const phase of ['before', 'main', 'after']) {
            if (control.isBroken)
                break;
            control._resetPhase();
            const listeners = this._registry.get(toKey(event, phase)) ?? [];
            for (const entry of listeners) {
                if (control.isBroken || control.isPhaseSkipped)
                    break;
                entry.handler(params, output, control);
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
    removeNamespace(namespace) {
        for (const [key, listeners] of this._registry) {
            const filtered = listeners.filter((e) => e.namespace !== namespace);
            if (filtered.length === 0) {
                this._registry.delete(key);
            }
            else {
                this._registry.set(key, filtered);
            }
        }
    }
    /** Remove all registered listeners. */
    clear() {
        this._registry.clear();
    }
    // ---------------------------------------------------------------------------
    // Private helpers
    // ---------------------------------------------------------------------------
    _off(key, entry) {
        const listeners = this._registry.get(key);
        if (!listeners)
            return;
        const idx = listeners.indexOf(entry);
        if (idx !== -1)
            listeners.splice(idx, 1);
        if (listeners.length === 0)
            this._registry.delete(key);
    }
}
//# sourceMappingURL=EventBus.js.map