import type { Core } from '../core/Core.js';
import type { EnginePlugin } from '../types/plugin.js';
import type {
  GlobalSaveData,
  SlotData,
  SlotMeta,
  SaveSlotSetParams,
  SaveSlotGetParams,
  SaveSlotGetOutput,
  SaveSlotListOutput,
  SaveSlotSaveParams,
  SaveSlotSaveOutput,
  SaveSlotLoadParams,
  SaveSlotLoadOutput,
  SaveSlotDeleteParams,
  SaveSlotDeleteOutput,
  SaveGlobalSetParams,
  SaveGlobalGetOutput,
  SaveGlobalSaveOutput,
  SaveGlobalLoadOutput,
} from '../types/save.js';

/**
 * Built-in plugin that manages in-memory save slots and global save data.
 *
 * `SaveManager` acts as the **memory layer** of the save system.  It never
 * touches persistent storage itself; that responsibility belongs to an
 * environment plugin (e.g. a filesystem or localStorage adapter) that listens
 * to the same events in the appropriate phase.
 *
 * ---
 *
 * ### Event contract
 *
 * #### Slot events
 *
 * | Event               | Params                  | Phase handled | What SaveManager does |
 * |---------------------|-------------------------|---------------|-----------------------|
 * | `save/slot:set`     | {@link SaveSlotSetParams}   | main | Shallow-merges `patch` into the slot's data bag; creates the slot if absent |
 * | `save/slot:get`     | {@link SaveSlotGetParams}   | main | Writes the live slot reference into `output.slot` |
 * | `save/slot:list`    | _(none)_                | main | Writes an array of slot metadata copies into `output.slots` |
 * | `save/slot:save`    | {@link SaveSlotSaveParams}  | main | Serialises a deep clone of the slot into `output.data`; environment plugin persists it in `after` |
 * | `save/slot:load`    | {@link SaveSlotLoadParams}  | main | Reads `output.raw` (set by env plugin in `before`) and writes it into memory |
 * | `save/slot:delete`  | {@link SaveSlotDeleteParams}| main | Removes the slot from memory; environment plugin deletes from storage in `after` |
 *
 * #### Global events
 *
 * | Event                | Params                   | Phase handled | What SaveManager does |
 * |----------------------|--------------------------|---------------|-----------------------|
 * | `save/global:set`    | {@link SaveGlobalSetParams}  | main | Shallow-merges `patch` into the global data bag |
 * | `save/global:get`    | _(none)_                 | main | Writes the live global data reference into `output.data` |
 * | `save/global:save`   | _(none)_                 | main | Serialises a deep clone of the global data into `output.data` |
 * | `save/global:load`   | _(none)_                 | main | Reads `output.raw` (set by env plugin in `before`) and replaces in-memory global data |
 *
 * ---
 *
 * ### Plan A — save/load phase responsibilities
 *
 * ```
 * save/slot:save
 *   before → game / middleware (validate or cancel)
 *   main   → SaveManager  serialises slot  →  output.data
 *   after  → env plugin   persists output.data to storage
 *
 * save/slot:load
 *   before → env plugin   reads storage    →  output.raw
 *   main   → SaveManager  writes output.raw into memory
 *   after  → game / middleware (refresh UI, etc.)
 * ```
 *
 * The same pattern applies to `save/global:save` and `save/global:load`.
 *
 * ---
 *
 * ### Usage
 *
 * ```ts
 * import { createEngine, SaveManager } from 'inkshot-engine';
 *
 * const { core } = await createEngine({
 *   plugins: [new SaveManager()],
 * });
 *
 * // Write data to a slot (stays in memory)
 * await core.events.emit('save/slot:set', { id: 'slot-1', patch: { gold: 100 } });
 *
 * // Persist the slot — an env plugin must handle the 'after' phase
 * await core.events.emit('save/slot:save', { id: 'slot-1' });
 *
 * // Restore a slot — an env plugin must handle the 'before' phase
 * const { output } = await core.events.emit<SaveSlotLoadParams, SaveSlotLoadOutput>(
 *   'save/slot:load',
 *   { id: 'slot-1' },
 * );
 * console.log(output.loaded); // true if env plugin provided output.raw
 * ```
 */
export class SaveManager implements EnginePlugin {
  readonly namespace = 'save';

  private readonly _slots = new Map<string, SlotData>();
  private _global: GlobalSaveData = { data: {}, updatedAt: 0 };

  // ---------------------------------------------------------------------------
  // EnginePlugin lifecycle
  // ---------------------------------------------------------------------------

  init(core: Core): void {
    const { events } = core;

    // ── Slot events ───────────────────────────────────────────────────────────

    events.on<SaveSlotSetParams>(this.namespace, 'save/slot:set', (params) => {
      this._setSlot(params);
    });

    events.on<SaveSlotGetParams, SaveSlotGetOutput>(
      this.namespace,
      'save/slot:get',
      (params, output) => {
        output.slot = this._slots.get(params.id);
      },
    );

    events.on<Record<string, never>, SaveSlotListOutput>(
      this.namespace,
      'save/slot:list',
      (_params, output) => {
        output.slots = Array.from(this._slots.values()).map((s) => ({ ...s.meta }));
      },
    );

    events.on<SaveSlotSaveParams, SaveSlotSaveOutput>(
      this.namespace,
      'save/slot:save',
      (params, output) => {
        const slot = this._slots.get(params.id);
        if (!slot) {
          output.data = undefined;
          output.saved = false;
          return;
        }
        if (params.name !== undefined) {
          slot.meta.name = params.name;
          slot.meta.updatedAt = Date.now();
        }
        // Deep-clone so the env plugin receives a stable, serialisable snapshot.
        output.data = structuredClone(slot);
        output.saved = false;
      },
    );

    events.on<SaveSlotLoadParams, SaveSlotLoadOutput>(
      this.namespace,
      'save/slot:load',
      (_params, output) => {
        if (!output.raw) {
          output.loaded = false;
          return;
        }
        // Deep-clone so internal state is isolated from whatever the env plugin
        // placed into output.raw.
        this._slots.set(output.raw.meta.id, structuredClone(output.raw));
        output.loaded = true;
      },
    );

    events.on<SaveSlotDeleteParams, SaveSlotDeleteOutput>(
      this.namespace,
      'save/slot:delete',
      (params, output) => {
        output.deleted = this._slots.delete(params.id);
      },
    );

    // ── Global events ─────────────────────────────────────────────────────────

    events.on<SaveGlobalSetParams>(this.namespace, 'save/global:set', (params) => {
      Object.assign(this._global.data, params.patch);
      this._global.updatedAt = Date.now();
    });

    events.on<Record<string, never>, SaveGlobalGetOutput>(
      this.namespace,
      'save/global:get',
      (_params, output) => {
        output.data = this._global;
      },
    );

    events.on<Record<string, never>, SaveGlobalSaveOutput>(
      this.namespace,
      'save/global:save',
      (_params, output) => {
        // Deep-clone so the env plugin receives a stable, serialisable snapshot.
        output.data = structuredClone(this._global);
        output.saved = false;
      },
    );

    events.on<Record<string, never>, SaveGlobalLoadOutput>(
      this.namespace,
      'save/global:load',
      (_params, output) => {
        if (!output.raw) {
          output.loaded = false;
          return;
        }
        // Deep-clone to isolate internal state from the env plugin's object.
        this._global = structuredClone(output.raw);
        output.loaded = true;
      },
    );
  }

  destroy(core: Core): void {
    core.events.removeNamespace(this.namespace);
    this._slots.clear();
    this._global = { data: {}, updatedAt: 0 };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Create or update a slot with a shallow-merged data patch.
   * When creating a new slot the `meta.name` defaults to `params.id`.
   */
  private _setSlot(params: SaveSlotSetParams): void {
    const now = Date.now();
    const existing = this._slots.get(params.id);

    if (existing) {
      Object.assign(existing.data, params.patch);
      existing.meta.updatedAt = now;
      if (params.name !== undefined) {
        existing.meta.name = params.name;
      }
    } else {
      const meta: SlotMeta = {
        id: params.id,
        name: params.name ?? params.id,
        createdAt: now,
        updatedAt: now,
      };
      this._slots.set(params.id, { meta, data: { ...params.patch } });
    }
  }
}
