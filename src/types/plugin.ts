import type { Core } from '../core/Core.js';

// ---------------------------------------------------------------------------
// EditorSchema
// ---------------------------------------------------------------------------

/**
 * Describes a single data schema that a plugin exposes to the Inkshot editor.
 *
 * The most important editor-specific field is {@link folder}, which tells the
 * editor where on disk files of this schema type are stored.  All other fields
 * are passed through to the editor as-is; the engine never reads them.
 */
export interface EditorSchema {
  /**
   * Name of the project sub-folder (relative to the project root) that
   * contains files associated with this schema.
   *
   * @example `'audio'`, `'tilemaps'`, `'data'`, `'i18n'`
   */
  folder?: string;

  /** Human-readable label for this schema, used in the editor UI. */
  displayName?: string;

  /** Additional arbitrary properties for custom tooling. */
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// EditorMeta
// ---------------------------------------------------------------------------

/**
 * Editor-facing metadata attached to a plugin.
 *
 * The engine itself **never** reads or validates this object — it is a
 * pass-through bag of data consumed exclusively by external tooling such as
 * the Inkshot visual editor.
 *
 * ### Key fields
 * - `displayName` / `icon` / `description` — basic presentation data.
 * - `commands` — the event names this plugin registers (helps the editor
 *   build auto-complete lists and show relevant commands in its UI).
 * - `schemas` — named data shapes this plugin works with.  Each entry may
 *   include a {@link EditorSchema.folder | folder} property so the editor
 *   knows which project directory contains files of that type.
 */
export interface EditorMeta {
  /** Human-readable plugin name shown in the editor sidebar / inspector. */
  displayName?: string;

  /** Icon identifier understood by the Inkshot editor (e.g. `'audio'`, `'scene'`). */
  icon?: string;

  /** Short description of what the plugin does. */
  description?: string;

  /**
   * Event names this plugin handles and exposes to the editor.
   *
   * @example `['scene/load', 'scene/register', 'scene/current']`
   */
  commands?: readonly string[];

  /**
   * Named data schemas describing the data structures this plugin works with.
   *
   * Each key is a schema name (e.g. `'tilemap'`, `'actor'`).  Each value is
   * an {@link EditorSchema} that optionally specifies a {@link EditorSchema.folder}
   * where files of this type are located on disk.
   *
   * @example
   * ```ts
   * schemas: {
   *   tilemap: { folder: 'tilemaps', displayName: 'Tilemap' },
   *   actor:   { folder: 'actors',   displayName: 'Actor Definition' },
   * }
   * ```
   */
  schemas?: Record<string, EditorSchema>;

  /** Additional arbitrary properties for custom tooling. */
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// EnginePlugin
// ---------------------------------------------------------------------------

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
   * Namespaces of other plugins that **must be initialised before** this one.
   *
   * `createEngine` performs a topological sort on the full plugin list using
   * these declarations, so the order in which plugins are passed to
   * `EngineOptions.plugins` does not affect the initialisation sequence.
   *
   * If a declared dependency is not present in the plugin list, `createEngine`
   * throws immediately.  Circular dependencies are also detected and throw.
   *
   * @example
   * ```ts
   * class MyPlugin implements EnginePlugin {
   *   readonly namespace = 'myGame/combat';
   *   readonly dependencies = ['entity', 'collision'] as const;
   *   init(core: Core) { ... }
   * }
   * ```
   */
  readonly dependencies?: readonly string[];

  /**
   * Editor-facing metadata exposed to external tooling (e.g. the Inkshot
   * visual editor).
   *
   * The engine itself never reads or validates this object — it is purely a
   * pass-through bag of data.  The shape is defined by {@link EditorMeta} and
   * each plugin author fills in whatever properties make sense for their use
   * case.  The editor is free to interpret them however it likes.
   *
   * The `schemas` map is especially important: each entry describes a data
   * type the plugin works with, and its optional {@link EditorSchema.folder}
   * property tells the editor which project sub-folder holds files of that
   * type.
   *
   * @example
   * ```ts
   * const sceneManagerPlugin: EnginePlugin = {
   *   namespace: 'scene',
   *   editorMeta: {
   *     displayName: 'Scene Manager',
   *     icon: 'scene',
   *     commands: ['scene/register', 'scene/load', 'scene/current'],
   *     schemas: {
   *       scene: {
   *         folder: 'scenes',
   *         displayName: 'Scene Descriptor',
   *       },
   *     },
   *   },
   *   init(core) { ... },
   * };
   * ```
   */
  readonly editorMeta?: EditorMeta;

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
