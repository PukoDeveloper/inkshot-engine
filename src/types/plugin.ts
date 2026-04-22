import type { Core } from '../core/Core.js';

// ---------------------------------------------------------------------------
// SchemaFieldDef / SchemaObjectDef
// ---------------------------------------------------------------------------

/**
 * A single field definition inside a {@link SchemaObjectDef}.
 *
 * Each variant corresponds to one of the primitive or composite types that
 * the Inkshot editor understands:
 *
 * | `type`    | Extra properties |
 * |-----------|-----------------|
 * | `string`  | `default?`      |
 * | `number`  | `default?`, `min?`, `max?` |
 * | `boolean` | `default?`      |
 * | `enum`    | `options`, `default?` |
 * | `ref`     | `ref` (collection name) |
 * | `array`   | `items`         |
 * | `object`  | `properties`    |
 */
export type SchemaFieldDef =
  | { type: 'string';  label?: string; description?: string; hidden?: boolean; default?: string }
  | { type: 'number';  label?: string; description?: string; hidden?: boolean; default?: number; min?: number; max?: number }
  | { type: 'boolean'; label?: string; description?: string; hidden?: boolean; default?: boolean }
  | { type: 'enum';    label?: string; description?: string; hidden?: boolean; options: string[]; default?: string }
  | { type: 'ref';     label?: string; description?: string; hidden?: boolean; ref: string }
  | { type: 'array';   label?: string; description?: string; hidden?: boolean; items: SchemaFieldDef }
  | { type: 'object';  label?: string; description?: string; hidden?: boolean; properties: Record<string, SchemaFieldDef> };

/**
 * A structured, editor-renderable definition of a data collection's shape.
 *
 * This mirrors a simplified subset of JSON Schema that is sufficient to
 * describe typical game data (actors, items, skills, …) while remaining easy
 * for visual editors to render as form controls.
 *
 * @example
 * ```ts
 * const itemSchema: SchemaObjectDef = {
 *   type: 'object',
 *   label: 'Item',
 *   properties: {
 *     name:  { type: 'string',  label: 'Name' },
 *     price: { type: 'number',  label: 'Price', default: 0, min: 0 },
 *     stackable: { type: 'boolean', label: 'Stackable', default: true },
 *   },
 * };
 * ```
 */
export interface SchemaObjectDef {
  type: 'object';
  /** Human-readable label for the editor UI. */
  label?: string;
  /** Short description of what this schema represents. */
  description?: string;
  /** Field definitions keyed by field name. */
  properties: Record<string, SchemaFieldDef>;
}

// ---------------------------------------------------------------------------
// EditorSchema
// ---------------------------------------------------------------------------

/**
 * Describes a single data schema that a plugin exposes to the Inkshot editor.
 *
 * Each entry in {@link EditorMeta.schemas} uses this shape.  The engine never
 * reads or validates this object — it is passed through as-is to external
 * tooling.
 */
export interface EditorSchema {
  /** Human-readable label for this schema, used in the editor UI. */
  displayName?: string;

  /** Icon identifier understood by the Inkshot editor (e.g. `'data'`, `'actor'`). */
  icon?: string;

  /**
   * Name of the project sub-folder (relative to the project root) that
   * contains files associated with this schema.
   *
   * @example `'audio'`, `'tilemaps'`, `'data'`, `'i18n'`
   */
  folder?: string;

  /**
   * Structured field definition for this schema.
   *
   * When present, the editor uses this to render a form for creating and
   * editing entries of this collection type.
   */
  field?: SchemaObjectDef;

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
 * - `events` — the event names this plugin registers (helps the editor
 *   build auto-complete lists and show relevant events in its UI).
 * - `schemas` — named data shapes this plugin works with.  Each entry may
 *   include a {@link EditorSchema.folder | folder} and a
 *   {@link EditorSchema.field | field} definition so the editor knows where
 *   files of that type live and how to render an edit form for them.
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
  events?: readonly string[];

  /**
   * Named data schemas describing the data structures this plugin works with.
   *
   * Each key is a schema name (e.g. `'tilemap'`, `'actor'`).  Each value is
   * an {@link EditorSchema} with optional `displayName`, `icon`, `folder`, and
   * `field` properties.
   *
   * @example
   * ```ts
   * schemas: {
   *   tilemap: { folder: 'tilemaps', displayName: 'Tilemap' },
   *   actor:   {
   *     folder: 'actors',
   *     displayName: 'Actor Definition',
   *     field: {
   *       type: 'object',
   *       properties: { name: { type: 'string', label: 'Name' } },
   *     },
   *   },
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
   * type the plugin works with.  Its `folder` property tells the editor which
   * project sub-folder holds files of that type, and its optional `field`
   * property describes the editable structure of each entry.
   *
   * @example
   * ```ts
   * const sceneManagerPlugin: EnginePlugin = {
   *   namespace: 'scene',
   *   editorMeta: {
   *     displayName: 'Scene Manager',
   *     icon: 'scene',
   *     events: ['scene/register', 'scene/load', 'scene/current'],
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
