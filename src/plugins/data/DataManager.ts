import type { Core } from '../../core/Core.js';
import type { EnginePlugin } from '../../types/plugin.js';
import type {
  DataLoadParams,
  DataLoadOutput,
  DataGetParams,
  DataGetOutput,
  DataGetAllParams,
  DataGetAllOutput,
  DataUnloadParams,
  DataUnloadOutput,
} from '../../types/data.js';

/**
 * Built-in plugin that loads and manages typed **JSON data collections**.
 *
 * While `ResourceManager` handles binary/texture assets through Pixi.js,
 * `DataManager` is dedicated to plain JSON data (items, skills, enemies,
 * quests, …).  Each collection lives under an **explicit name** so different
 * data types never collide:
 *
 * - `'items'`   → `data/items.json`
 * - `'skills'`  → `data/skills.json`
 * - `'enemies'` → `data/enemies.json`
 *
 * Collections are stored in memory as `Map<id, data>`.  Multiple
 * `data/load` calls for the **same collection name** merge their entries
 * (newer keys win), enabling split files or DLC additions.
 *
 * ---
 *
 * ### Event contract
 *
 * | Event          | Async?          | Description |
 * |----------------|-----------------|-------------|
 * | `data/load`    | ✓ async         | Load a named collection from a JSON file or inline object |
 * | `data/get`     | ✗ `emitSync`    | Retrieve a single entry by collection name + entry ID |
 * | `data/getAll`  | ✗ `emitSync`    | Retrieve all entries in a collection |
 * | `data/unload`  | ✗ `emitSync`    | Remove a collection from memory |
 *
 * ---
 *
 * ### Usage
 *
 * ```ts
 * import { createEngine, DataManager } from 'inkshot-engine';
 *
 * const { core } = await createEngine({
 *   dataRoot: '/assets/',
 *   plugins: [
 *     new DataManager(),
 *     {
 *       namespace: 'myGame',
 *       async init(c) {
 *         // Load different data types from different paths
 *         await c.events.emit('data/load', { collection: 'items',   file: 'data/items.json' });
 *         await c.events.emit('data/load', { collection: 'skills',  file: 'data/skills.json' });
 *         await c.events.emit('data/load', { collection: 'enemies', file: 'data/enemies.json' });
 *       },
 *     },
 *   ],
 * });
 *
 * // Retrieve a single entry (synchronous)
 * const { output } = core.events.emitSync('data/get', { collection: 'items', id: 'sword' });
 * if (output.found) console.log(output.data); // { name: 'Iron Sword', atk: 15, ... }
 *
 * // Retrieve all entries in a collection
 * const { output: all } = core.events.emitSync('data/getAll', { collection: 'skills' });
 * for (const [id, skill] of Object.entries(all.entries)) {
 *   console.log(id, skill);
 * }
 *
 * // Merge extra entries into an existing collection (e.g. DLC content)
 * await core.events.emit('data/load', {
 *   collection: 'items',
 *   file: 'data/dlc-items.json',
 * });
 *
 * // Release a collection when it is no longer needed
 * core.events.emitSync('data/unload', { collection: 'enemies' });
 * ```
 */
export class DataManager implements EnginePlugin {
  readonly namespace = 'data';
  readonly editorMeta = {
    displayName: 'Data Manager',
    icon: 'data',
    description: 'Loads and manages typed JSON data collections (items, skills, enemies, …).',
    events: ['data/load', 'data/get', 'data/getAll', 'data/unload'] as const,
    schemas: {
      data: {
        folder: 'data',
        displayName: 'Data Collection',
      },
    },
  };

  /**
   * Outer key: collection name (e.g. `'items'`, `'skills'`).
   * Inner key: entry ID (e.g. `'sword'`, `'fireball'`).
   */
  private readonly _store = new Map<string, Map<string, unknown>>();

  /** dataRoot resolved from Core during init(). */
  private _dataRoot = '/';

  // ---------------------------------------------------------------------------
  // EnginePlugin lifecycle
  // ---------------------------------------------------------------------------

  init(core: Core): void {
    this._dataRoot = core.dataRoot;
    const { events } = core;

    // ── data/load ────────────────────────────────────────────────────────────

    events.on<DataLoadParams, DataLoadOutput>(
      this.namespace,
      'data/load',
      async (params, output) => {
        output.collection = params.collection;

        try {
          let raw: Record<string, unknown>;

          if (params.entries !== undefined) {
            raw = params.entries;
          } else if (params.file !== undefined) {
            const url = this._resolve(params.file);
            const response = await fetch(url);
            if (!response.ok) {
              throw new Error(
                `[DataManager] Failed to fetch "${url}": ${response.status} ${response.statusText}`,
              );
            }
            raw = (await response.json()) as Record<string, unknown>;
          } else {
            throw new Error(
              '[DataManager] data/load requires either "file" or "entries".',
            );
          }

          // Merge into (or create) the collection map.
          const collection = this._store.get(params.collection) ?? new Map<string, unknown>();
          for (const [id, value] of Object.entries(raw)) {
            collection.set(id, value);
          }
          this._store.set(params.collection, collection);

          output.loaded = true;
          output.count = collection.size;
        } catch (err) {
          output.loaded = false;
          output.count = this._store.get(params.collection)?.size ?? 0;
          console.error(err);
        }
      },
    );

    // ── data/get ─────────────────────────────────────────────────────────────

    events.on<DataGetParams, DataGetOutput>(
      this.namespace,
      'data/get',
      (params, output) => {
        const collection = this._store.get(params.collection);
        if (collection === undefined || !collection.has(params.id)) {
          output.data = undefined;
          output.found = false;
          return;
        }
        output.data = collection.get(params.id);
        output.found = true;
      },
    );

    // ── data/getAll ──────────────────────────────────────────────────────────

    events.on<DataGetAllParams, DataGetAllOutput>(
      this.namespace,
      'data/getAll',
      (params, output) => {
        const collection = this._store.get(params.collection);
        if (collection === undefined) {
          output.entries = {};
          output.found = false;
          return;
        }
        output.entries = Object.fromEntries(collection.entries());
        output.found = true;
      },
    );

    // ── data/unload ──────────────────────────────────────────────────────────

    events.on<DataUnloadParams, DataUnloadOutput>(
      this.namespace,
      'data/unload',
      (params, output) => {
        output.unloaded = this._store.delete(params.collection);
      },
    );
  }

  destroy(core: Core): void {
    core.events.removeNamespace(this.namespace);
    this._store.clear();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Resolve a path relative to `dataRoot`.
   *
   * Absolute URLs (`http://`, `https://`, `data:`, `blob:`) and root-anchored
   * paths (`/…`) are returned unchanged.
   */
  private _resolve(url: string): string {
    if (/^(https?:|data:|blob:)\/\//i.test(url) || url.startsWith('/')) {
      return url;
    }
    const base = this._dataRoot.endsWith('/') ? this._dataRoot : `${this._dataRoot}/`;
    return `${base}${url}`;
  }
}
