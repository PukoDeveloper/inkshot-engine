import type { Core } from '../core/Core.js';

/**
 * The contract every engine plugin must satisfy.
 *
 * A plugin is a self-contained unit of functionality that integrates with the
 * engine exclusively through the event bus.  It should **not** hold direct
 * references to other plugins; use `core.events` to communicate instead.
 *
 * ### Lifecycle
 * 1. `init(core)` – called once during engine startup (before the main loop
 *    starts).  Register event listeners and allocate resources here.
 * 2. `destroy(core)` – called when the engine is destroyed.  Clean up any
 *    resources and remove listeners (or call `core.events.removeNamespace`).
 *
 * ### Namespace
 * Each plugin declares a unique `namespace` string (e.g. `'audio'`, `'saves'`,
 * `'myGame/combat'`).  The event bus uses this to scope and isolate listeners,
 * making it trivially possible to unload a plugin without side-effects.
 */
export interface EnginePlugin {
  /** Unique identifier for this plugin used to scope event-bus registrations. */
  readonly namespace: string;

  /**
   * Called once before the game loop starts.
   * Use this to subscribe to events and initialize subsystems.
   */
  init(core: Core): void | Promise<void>;

  /**
   * Called when the engine shuts down.
   * Unsubscribe from events and release held resources.
   */
  destroy?(core: Core): void | Promise<void>;
}

/**
 * A plugin can be supplied either as:
 * - An {@link EnginePlugin} object (recommended for TypeScript projects).
 * - A **URL string** pointing to an ES module whose `default` export is an
 *   `EnginePlugin`.  The factory function will `import()` the module
 *   dynamically at engine startup.
 *
 * @example
 * ```ts
 * // Object form
 * const myPlugin: EnginePlugin = { namespace: 'myPlugin', init(core) { ... } };
 *
 * // URL form (module must export a default EnginePlugin)
 * const remotePlugin: PluginSource = 'https://cdn.example.com/my-plugin.js';
 * ```
 */
export type PluginSource = EnginePlugin | string;
