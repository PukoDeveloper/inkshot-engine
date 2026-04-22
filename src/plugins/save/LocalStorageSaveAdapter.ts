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
// Types
// ---------------------------------------------------------------------------

/**
 * A minimal subset of the Web Storage API required by this adapter.
 * Matches `window.localStorage` exactly — pass a custom object for testing.
 */
export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Options for {@link LocalStorageSaveAdapter}. */
export interface LocalStorageSaveAdapterOptions {
  /**
   * Prefix prepended to every storage key to avoid collisions with other apps.
   * Default: `'inkshot:'`.
   */
  keyPrefix?: string;
  /**
   * Custom storage backend.  Defaults to `globalThis.localStorage`.
   * Pass a plain object that implements {@link StorageLike} to use in tests or
   * environments where `localStorage` is not available.
   */
  storage?: StorageLike;
}

// ---------------------------------------------------------------------------
// LocalStorageSaveAdapter
// ---------------------------------------------------------------------------

/**
 * Browser-side persistence adapter for the {@link SaveManager}.
 *
 * `LocalStorageSaveAdapter` is the **storage layer** of the save system.  It
 * listens to the same events as `SaveManager` but in the complementary phases,
 * serialising and deserialising data to/from `localStorage`:
 *
 * | Phase  | Event             | What this adapter does                           |
 * |--------|-------------------|--------------------------------------------------|
 * | before | `save/slot:load`  | Reads JSON from storage → sets `output.raw`      |
 * | after  | `save/slot:save`  | Writes `output.data` as JSON to storage          |
 * | after  | `save/slot:delete`| Removes the slot key from storage               |
 * | before | `save/global:load`| Reads JSON from storage → sets `output.raw`      |
 * | after  | `save/global:save`| Writes `output.data` as JSON to storage          |
 *
 * ### Usage
 *
 * ```ts
 * import { createEngine, SaveManager, LocalStorageSaveAdapter } from 'inkshot-engine';
 *
 * const { core } = await createEngine({
 *   plugins: [
 *     new SaveManager(),
 *     new LocalStorageSaveAdapter({ keyPrefix: 'mygame:' }),
 *   ],
 * });
 *
 * // Persists to localStorage under the key 'mygame:slot:slot-1'
 * await core.events.emit('save/slot:set',  { id: 'slot-1', patch: { level: 3 } });
 * await core.events.emit('save/slot:save', { id: 'slot-1' });
 *
 * // Restores from localStorage automatically via the before-phase hook
 * await core.events.emit('save/slot:load', { id: 'slot-1' });
 * ```
 */
export class LocalStorageSaveAdapter implements EnginePlugin {
  readonly namespace = 'localStorageSave';
  readonly editorMeta = {
    displayName: 'LocalStorage Save Adapter',
    icon: 'save',
    description: 'Persists save data to the browser localStorage.',
    events: [
      'save/slot:save', 'save/slot:load', 'save/slot:delete',
      'save/global:save', 'save/global:load',
    ] as const,
  };

  private readonly _prefix: string;
  private readonly _storage: StorageLike;

  constructor(options: LocalStorageSaveAdapterOptions = {}) {
    this._prefix = options.keyPrefix ?? 'inkshot:';
    this._storage = options.storage ?? globalThis.localStorage;
  }

  // ---------------------------------------------------------------------------
  // EnginePlugin lifecycle
  // ---------------------------------------------------------------------------

  init(core: Core): void {
    const { events } = core;

    // ── Slot: save (after) ───────────────────────────────────────────────────

    events.on<SaveSlotSaveParams, SaveSlotSaveOutput>(
      this.namespace,
      'save/slot:save',
      (_params, output) => {
        if (output.data !== undefined) {
          try {
            this._storage.setItem(this._slotKey(output.data.meta.id), JSON.stringify(output.data));
            output.saved = true;
          } catch (err) {
            console.warn('[LocalStorageSaveAdapter] Failed to persist slot:', err);
          }
        }
      },
      { phase: 'after' },
    );

    // ── Slot: load (before) ──────────────────────────────────────────────────

    events.on<SaveSlotLoadParams, SaveSlotLoadOutput>(
      this.namespace,
      'save/slot:load',
      (params, output) => {
        const raw = this._storage.getItem(this._slotKey(params.id));
        if (raw !== null) {
          try {
            output.raw = JSON.parse(raw) as SlotData;
          } catch (err) {
            console.warn(`[LocalStorageSaveAdapter] Corrupt slot data for "${params.id}":`, err);
          }
        }
      },
      { phase: 'before' },
    );

    // ── Slot: delete (after) ─────────────────────────────────────────────────

    events.on<SaveSlotDeleteParams, SaveSlotDeleteOutput>(
      this.namespace,
      'save/slot:delete',
      (params) => {
        this._storage.removeItem(this._slotKey(params.id));
      },
      { phase: 'after' },
    );

    // ── Global: save (after) ─────────────────────────────────────────────────

    events.on<Record<string, never>, SaveGlobalSaveOutput>(
      this.namespace,
      'save/global:save',
      (_params, output) => {
        if (output.data !== undefined) {
          try {
            this._storage.setItem(this._globalKey(), JSON.stringify(output.data));
            output.saved = true;
          } catch (err) {
            console.warn('[LocalStorageSaveAdapter] Failed to persist global data:', err);
          }
        }
      },
      { phase: 'after' },
    );

    // ── Global: load (before) ────────────────────────────────────────────────

    events.on<Record<string, never>, SaveGlobalLoadOutput>(
      this.namespace,
      'save/global:load',
      (_params, output) => {
        const raw = this._storage.getItem(this._globalKey());
        if (raw !== null) {
          try {
            output.raw = JSON.parse(raw) as GlobalSaveData;
          } catch (err) {
            console.warn('[LocalStorageSaveAdapter] Corrupt global save data:', err);
          }
        }
      },
      { phase: 'before' },
    );
  }

  destroy(core: Core): void {
    core.events.removeNamespace(this.namespace);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private _slotKey(id: string): string {
    return `${this._prefix}slot:${id}`;
  }

  private _globalKey(): string {
    return `${this._prefix}global`;
  }
}
