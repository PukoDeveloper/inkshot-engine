import type { Core } from '../../core/Core.js';
import type { EnginePlugin } from '../../types/plugin.js';
import type {
  SlotData,
  GlobalSaveData,
  SaveSlotSaveOutput,
  SaveSlotLoadParams,
  SaveSlotLoadOutput,
  SaveGlobalSaveOutput,
  SaveGlobalLoadOutput,
} from '../../types/save.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A migration function that transforms save-slot data from one version to the
 * next.
 *
 * The function receives the **slot data bag** (`SlotData.data`) and should
 * return the transformed bag.  If the function returns `void`, the original
 * bag reference is kept as-is (useful for in-place mutations).
 *
 * @example
 * ```ts
 * // Rename `gold` → `coins`
 * const migrateSlot: SlotMigrateFn = (data) => {
 *   if (typeof data['gold'] === 'number') {
 *     data['coins'] = data['gold'];
 *     delete data['gold'];
 *   }
 *   return data;
 * };
 * ```
 */
export type SlotMigrateFn = (data: Record<string, unknown>) => Record<string, unknown> | void;

/**
 * A migration function that transforms global save data from one version to
 * the next.
 *
 * Receives the **global data bag** (`GlobalSaveData.data`) and should return
 * the transformed bag, or `void` if the mutation is done in-place.
 */
export type GlobalMigrateFn = (data: Record<string, unknown>) => Record<string, unknown> | void;

/**
 * One step in a migration chain.
 *
 * A step describes the transition **from** a specific version to the next
 * (`fromVersion + 1`).  Provide `slot` and/or `global` handlers as needed.
 */
export interface SaveMigrationStep {
  /**
   * The save-data version that this step migrates **from**.
   *
   * When loading save data whose persisted version equals `fromVersion`, this
   * step's handlers are applied before the data is written into memory.
   */
  fromVersion: number;

  /**
   * Migration applied to the slot data bag (`SlotData.data`).
   * Omit if slot data does not change between these two versions.
   */
  slot?: SlotMigrateFn;

  /**
   * Migration applied to the global data bag (`GlobalSaveData.data`).
   * Omit if global data does not change between these two versions.
   */
  global?: GlobalMigrateFn;
}

/** Options for {@link SaveMigrationPlugin}. */
export interface SaveMigrationPluginOptions {
  /**
   * The current (latest) save-data schema version.
   *
   * This value is stamped onto every persisted slot and global data entry so
   * that future runs can detect and apply the correct migration chain.
   */
  currentVersion: number;

  /**
   * All migration steps, each describing the transformation from one version
   * to the next.  Steps may be supplied in any order — the plugin sorts them
   * by `fromVersion` ascending and executes them in sequence.
   */
  migrations: SaveMigrationStep[];
}

// ---------------------------------------------------------------------------
// SaveMigrationPlugin
// ---------------------------------------------------------------------------

/**
 * Plugin that provides **save-data version migration** for the
 * {@link SaveManager}.
 *
 * ### How it works
 *
 * **On save** (`save/slot:save` / `save/global:save` — `after` phase,
 * priority `1`):
 * The plugin stamps the `currentVersion` onto `output.data` _before_ the
 * environment adapter (e.g. {@link LocalStorageSaveAdapter} or
 * {@link IndexedDBSaveAdapter}) writes it to persistent storage.  This
 * ensures every persisted entry carries an explicit schema version.
 *
 * **On load** (`save/slot:load` / `save/global:load` — `before` phase,
 * priority `-1`):
 * After the environment adapter has placed the raw entry into `output.raw`,
 * the plugin inspects its stored version and applies each
 * {@link SaveMigrationStep} in sequence (from `storedVersion` up to
 * `currentVersion − 1`) before `SaveManager` writes the data into memory.
 * Save data with no version field is treated as version `0`.
 *
 * ### Priority ordering
 *
 * | Phase  | Event              | Listener                  | Priority |
 * |--------|--------------------|---------------------------|----------|
 * | after  | `save/slot:save`   | SaveMigrationPlugin stamp | `1`      |
 * | after  | `save/slot:save`   | env adapter persist       | `0`      |
 * | before | `save/slot:load`   | env adapter read          | `0`      |
 * | before | `save/slot:load`   | SaveMigrationPlugin apply | `-1`     |
 *
 * The same ordering applies to `save/global:save` / `save/global:load`.
 *
 * ### Usage
 *
 * ```ts
 * import {
 *   createEngine, SaveManager, LocalStorageSaveAdapter,
 *   SaveMigrationPlugin,
 * } from 'inkshot-engine';
 *
 * const { core } = await createEngine({
 *   plugins: [
 *     new SaveManager(),
 *     new LocalStorageSaveAdapter(),
 *     new SaveMigrationPlugin({
 *       currentVersion: 2,
 *       migrations: [
 *         {
 *           fromVersion: 0,
 *           slot: (data) => {
 *             // v0 → v1: rename `gold` to `coins`
 *             if (typeof data['gold'] === 'number') {
 *               data['coins'] = data['gold'];
 *               delete data['gold'];
 *             }
 *             return data;
 *           },
 *         },
 *         {
 *           fromVersion: 1,
 *           slot: (data) => {
 *             // v1 → v2: initialise new `level` field
 *             data['level'] ??= 1;
 *             return data;
 *           },
 *         },
 *       ],
 *     }),
 *   ],
 * });
 * ```
 */
export class SaveMigrationPlugin implements EnginePlugin {
  readonly namespace = 'saveMigration';
  readonly editorMeta = {
    displayName: 'Save Migration Plugin',
    icon: 'save',
    description: 'Applies versioned migration steps to save data during load.',
    events: [] as const,
  };

  private readonly _currentVersion: number;
  private readonly _migrations: ReadonlyMap<number, SaveMigrationStep>;

  constructor(options: SaveMigrationPluginOptions) {
    this._currentVersion = options.currentVersion;
    this._migrations = new Map(
      [...options.migrations].sort((a, b) => a.fromVersion - b.fromVersion).map((s) => [s.fromVersion, s]),
    );
  }

  // ---------------------------------------------------------------------------
  // EnginePlugin lifecycle
  // ---------------------------------------------------------------------------

  init(core: Core): void {
    const { events } = core;

    // ── Stamp version on save (after phase, priority 1 — runs before env adapter) ──

    events.on<Record<string, never>, SaveSlotSaveOutput>(
      this.namespace,
      'save/slot:save',
      (_params, output) => {
        if (output.data?.meta !== undefined) {
          output.data.meta.version = this._currentVersion;
        }
      },
      { phase: 'after', priority: 1 },
    );

    events.on<Record<string, never>, SaveGlobalSaveOutput>(
      this.namespace,
      'save/global:save',
      (_params, output) => {
        if (output.data !== undefined) {
          output.data.version = this._currentVersion;
        }
      },
      { phase: 'after', priority: 1 },
    );

    // ── Apply migrations on load (before phase, priority -1 — runs after env adapter) ──

    events.on<SaveSlotLoadParams, SaveSlotLoadOutput>(
      this.namespace,
      'save/slot:load',
      (_params, output) => {
        if (output.raw !== undefined) {
          output.raw = this._migrateSlot(output.raw);
        }
      },
      { phase: 'before', priority: -1 },
    );

    events.on<Record<string, never>, SaveGlobalLoadOutput>(
      this.namespace,
      'save/global:load',
      (_params, output) => {
        if (output.raw !== undefined) {
          output.raw = this._migrateGlobal(output.raw);
        }
      },
      { phase: 'before', priority: -1 },
    );
  }

  destroy(core: Core): void {
    core.events.removeNamespace(this.namespace);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Apply all pending slot migration steps from the data's stored version up
   * to `currentVersion`, returning a new (deep-cloned) `SlotData` object.
   */
  private _migrateSlot(data: SlotData): SlotData {
    let version = data.meta.version ?? 0;
    if (version >= this._currentVersion) return data;

    const cloned: SlotData = structuredClone(data);

    while (version < this._currentVersion) {
      const step = this._migrations.get(version);
      if (step?.slot) {
        const result = step.slot(cloned.data);
        if (result !== undefined) {
          cloned.data = result;
        }
      }
      version++;
    }

    cloned.meta.version = this._currentVersion;
    return cloned;
  }

  /**
   * Apply all pending global migration steps from the data's stored version up
   * to `currentVersion`, returning a new (deep-cloned) `GlobalSaveData` object.
   */
  private _migrateGlobal(data: GlobalSaveData): GlobalSaveData {
    let version = data.version ?? 0;
    if (version >= this._currentVersion) return data;

    const cloned: GlobalSaveData = structuredClone(data);

    while (version < this._currentVersion) {
      const step = this._migrations.get(version);
      if (step?.global) {
        const result = step.global(cloned.data);
        if (result !== undefined) {
          cloned.data = result;
        }
      }
      version++;
    }

    cloned.version = this._currentVersion;
    return cloned;
  }
}
