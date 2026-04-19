import type { EventHandler, EventName, ListenerOptions, DispatchResult } from '../types/events.js';
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
export declare class EventBus {
    private readonly _registry;
    /**
     * Register a listener for an event.
     *
     * @param listenerNamespace  Namespace of the registrant (e.g. `'core'`, `'myPlugin'`).
     * @param event              Base event name (`workspace/eventname`).
     * @param handler            The handler to invoke.
     * @param options            Optional priority and phase.
     * @returns                  A function that unregisters this listener when called.
     */
    on<P = unknown, O extends object = Record<string, unknown>>(listenerNamespace: string, event: EventName, handler: EventHandler<P, O>, options?: ListenerOptions): () => void;
    /**
     * Register a listener that automatically unregisters after the first invocation.
     */
    once<P = unknown, O extends object = Record<string, unknown>>(listenerNamespace: string, event: EventName, handler: EventHandler<P, O>, options?: ListenerOptions): () => void;
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
    emit<P = unknown, O extends object = Record<string, unknown>>(event: EventName, params: P, seed?: Partial<O>): Promise<DispatchResult<O>>;
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
    emitSync<P = unknown, O extends object = Record<string, unknown>>(event: EventName, params: P, seed?: Partial<O>): DispatchResult<O>;
    /**
     * Remove all listeners associated with a given namespace.
     * Useful when unloading a plugin.
     */
    removeNamespace(namespace: string): void;
    /** Remove all registered listeners. */
    clear(): void;
    private _off;
}
//# sourceMappingURL=EventBus.d.ts.map