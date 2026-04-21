import type { Core } from '../../core/Core.js';
import type { EnginePlugin } from '../../types/plugin.js';
import type {
  SlotData,
  GlobalSaveData,
  SaveSlotSaveParams,
  SaveSlotSaveOutput,
  SaveSlotLoadParams,
  SaveSlotLoadOutput,
  SaveSlotDeleteParams,
  SaveSlotDeleteOutput,
  SaveGlobalSaveOutput,
  SaveGlobalLoadOutput,
} from '../../types/save.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SLOT_STORE = 'slots';
const GLOBAL_STORE = 'global';
const GLOBAL_KEY = '__global__';

// ---------------------------------------------------------------------------
// IDBStoreLike interface
// ---------------------------------------------------------------------------

/**
 * A minimal async key/value store interface used by {@link IndexedDBSaveAdapter}.
 *
 * The real implementation wraps the browser `IndexedDB` API; pass a custom
 * object that implements this interface to use a different backend (e.g. an
 * in-memory store for unit tests).
 *
 * @example
 * ```ts
 * // In-memory mock for tests
 * const store = new Map<string, Map<string, unknown>>();
 * const mockIDBStore: IDBStoreLike = {
 *   async get(storeName, key) { return store.get(storeName)?.get(key); },
 *   async put(storeName, key, value) {
 *     if (!store.has(storeName)) store.set(storeName, new Map());
 *     store.get(storeName)!.set(key, value);
 *   },
 *   async delete(storeName, key) { store.get(storeName)?.delete(key); },
 * };
 * ```
 */
export interface IDBStoreLike {
  /**
   * Retrieve a value by key from the named object store.
   * Resolves with `undefined` when no entry exists for `key`.
   */
  get(storeName: string, key: string): Promise<unknown>;

  /**
   * Insert or replace a value in the named object store.
   */
  put(storeName: string, key: string, value: unknown): Promise<void>;

  /**
   * Remove the entry for `key` from the named object store.
   * Resolves without error even if the key does not exist.
   */
  delete(storeName: string, key: string): Promise<void>;
}

// ---------------------------------------------------------------------------
// Real IndexedDB implementation
// ---------------------------------------------------------------------------

/**
 * Opens a real browser IndexedDB database and exposes the two required object
 * stores (`slots` and `global`) through the {@link IDBStoreLike} interface.
 *
 * @internal
 */
class RealIDBStore implements IDBStoreLike {
  private _db: IDBDatabase | null = null;

  constructor(
    private readonly _name: string,
    private readonly _version: number,
  ) {}

  /** Open the database and create object stores if needed. */
  open(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const req = globalThis.indexedDB.open(this._name, this._version);

      req.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(SLOT_STORE)) {
          db.createObjectStore(SLOT_STORE);
        }
        if (!db.objectStoreNames.contains(GLOBAL_STORE)) {
          db.createObjectStore(GLOBAL_STORE);
        }
      };

      req.onsuccess = () => {
        this._db = req.result;
        resolve();
      };

      req.onerror = () => reject(req.error);
    });
  }

  /** Close the underlying database connection. */
  close(): void {
    this._db?.close();
    this._db = null;
  }

  get(storeName: string, key: string): Promise<unknown> {
    return new Promise<unknown>((resolve, reject) => {
      const tx = this._db!.transaction(storeName, 'readonly');
      const req = tx.objectStore(storeName).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  put(storeName: string, key: string, value: unknown): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const tx = this._db!.transaction(storeName, 'readwrite');
      const req = tx.objectStore(storeName).put(value, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  delete(storeName: string, key: string): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const tx = this._db!.transaction(storeName, 'readwrite');
      const req = tx.objectStore(storeName).delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/** Options for {@link IndexedDBSaveAdapter}. */
export interface IndexedDBSaveAdapterOptions {
  /**
   * Name of the IndexedDB database.
   * Default: `'inkshot-saves'`.
   */
  dbName?: string;

  /**
   * Schema version passed to `indexedDB.open()`.
   * Increment this when the object-store layout changes.
   * Default: `1`.
   */
  dbVersion?: number;

  /**
   * Custom async store backend.  Defaults to opening a real browser IndexedDB.
   * Pass a {@link IDBStoreLike} implementation to use a different backend
   * (e.g. an in-memory mock for unit tests).
   */
  idbStore?: IDBStoreLike;
}

// ---------------------------------------------------------------------------
// IndexedDBSaveAdapter
// ---------------------------------------------------------------------------

/**
 * Browser-side persistence adapter for the {@link SaveManager} that uses
 * **IndexedDB** as the backing store.
 *
 * IndexedDB serialises values via the _Structured Clone_ algorithm, so it
 * supports binary data (`ArrayBuffer`, `Blob`, `TypedArray`) and complex
 * objects in addition to plain JSON-compatible values, making it better suited
 * than `localStorage` for large or binary save data.
 *
 * `IndexedDBSaveAdapter` mirrors the event contract of
 * {@link LocalStorageSaveAdapter}:
 *
 * | Phase  | Event             | What this adapter does                                   |
 * |--------|-------------------|----------------------------------------------------------|
 * | before | `save/slot:load`  | Reads entry from IDB → sets `output.raw`                 |
 * | after  | `save/slot:save`  | Writes `output.data` to IDB                              |
 * | after  | `save/slot:delete`| Removes the slot entry from IDB                         |
 * | before | `save/global:load`| Reads entry from IDB → sets `output.raw`                 |
 * | after  | `save/global:save`| Writes `output.data` to IDB                              |
 *
 * ### Usage
 *
 * ```ts
 * import { createEngine, SaveManager, IndexedDBSaveAdapter } from 'inkshot-engine';
 *
 * const { core } = await createEngine({
 *   plugins: [
 *     new SaveManager(),
 *     new IndexedDBSaveAdapter({ dbName: 'my-game' }),
 *   ],
 * });
 *
 * // Persists to IndexedDB
 * await core.events.emit('save/slot:set',  { id: 'slot-1', patch: { level: 3 } });
 * await core.events.emit('save/slot:save', { id: 'slot-1' });
 *
 * // Restores from IndexedDB
 * await core.events.emit('save/slot:load', { id: 'slot-1' });
 * ```
 */
export class IndexedDBSaveAdapter implements EnginePlugin {
  readonly namespace = 'indexedDbSave';

  private readonly _dbName: string;
  private readonly _dbVersion: number;
  private readonly _injectedStore: IDBStoreLike | undefined;

  private _store: IDBStoreLike | null = null;
  private _realStore: RealIDBStore | null = null;

  constructor(options: IndexedDBSaveAdapterOptions = {}) {
    this._dbName = options.dbName ?? 'inkshot-saves';
    this._dbVersion = options.dbVersion ?? 1;
    this._injectedStore = options.idbStore;
  }

  // ---------------------------------------------------------------------------
  // EnginePlugin lifecycle
  // ---------------------------------------------------------------------------

  async init(core: Core): Promise<void> {
    if (this._injectedStore) {
      this._store = this._injectedStore;
    } else {
      const real = new RealIDBStore(this._dbName, this._dbVersion);
      await real.open();
      this._realStore = real;
      this._store = real;
    }

    const store = this._store;
    const { events } = core;

    // ── Slot: save (after) ───────────────────────────────────────────────────

    events.on<SaveSlotSaveParams, SaveSlotSaveOutput>(
      this.namespace,
      'save/slot:save',
      async (_params, output) => {
        if (output.data !== undefined) {
          try {
            await store.put(SLOT_STORE, output.data.meta.id, output.data);
            output.saved = true;
          } catch (err) {
            console.warn('[IndexedDBSaveAdapter] Failed to persist slot:', err);
          }
        }
      },
      { phase: 'after' },
    );

    // ── Slot: load (before) ──────────────────────────────────────────────────

    events.on<SaveSlotLoadParams, SaveSlotLoadOutput>(
      this.namespace,
      'save/slot:load',
      async (params, output) => {
        try {
          const data = await store.get(SLOT_STORE, params.id);
          if (data !== undefined) {
            output.raw = data as SlotData;
          }
        } catch (err) {
          console.warn(`[IndexedDBSaveAdapter] Failed to read slot "${params.id}":`, err);
        }
      },
      { phase: 'before' },
    );

    // ── Slot: delete (after) ─────────────────────────────────────────────────

    events.on<SaveSlotDeleteParams, SaveSlotDeleteOutput>(
      this.namespace,
      'save/slot:delete',
      async (params) => {
        try {
          await store.delete(SLOT_STORE, params.id);
        } catch (err) {
          console.warn(`[IndexedDBSaveAdapter] Failed to delete slot "${params.id}":`, err);
        }
      },
      { phase: 'after' },
    );

    // ── Global: save (after) ─────────────────────────────────────────────────

    events.on<Record<string, never>, SaveGlobalSaveOutput>(
      this.namespace,
      'save/global:save',
      async (_params, output) => {
        if (output.data !== undefined) {
          try {
            await store.put(GLOBAL_STORE, GLOBAL_KEY, output.data);
            output.saved = true;
          } catch (err) {
            console.warn('[IndexedDBSaveAdapter] Failed to persist global data:', err);
          }
        }
      },
      { phase: 'after' },
    );

    // ── Global: load (before) ────────────────────────────────────────────────

    events.on<Record<string, never>, SaveGlobalLoadOutput>(
      this.namespace,
      'save/global:load',
      async (_params, output) => {
        try {
          const data = await store.get(GLOBAL_STORE, GLOBAL_KEY);
          if (data !== undefined) {
            output.raw = data as GlobalSaveData;
          }
        } catch (err) {
          console.warn('[IndexedDBSaveAdapter] Failed to read global data:', err);
        }
      },
      { phase: 'before' },
    );
  }

  destroy(core: Core): void {
    core.events.removeNamespace(this.namespace);
    this._realStore?.close();
    this._realStore = null;
    this._store = null;
  }
}
