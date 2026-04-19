/**
 * Metadata attached to every save slot.
 */
export interface SlotMeta {
  /** Unique identifier for this slot (e.g. `'slot-1'`, `'autosave'`). */
  readonly id: string;
  /** Human-readable name shown in the save/load UI. */
  name: string;
  /** Unix timestamp (ms) when the slot was first created in memory. */
  readonly createdAt: number;
  /** Unix timestamp (ms) when the slot data was last modified. */
  updatedAt: number;
}

/**
 * Full in-memory representation of a single save slot.
 */
export interface SlotData {
  /** Slot metadata (id, name, timestamps). */
  meta: SlotMeta;
  /** Arbitrary game data stored in this slot. */
  data: Record<string, unknown>;
}

/**
 * The global (cross-slot) persistent save data.
 * Useful for storing settings, achievements, or any data shared across slots.
 */
export interface GlobalSaveData {
  /** Arbitrary data shared across all save slots. */
  data: Record<string, unknown>;
  /** Unix timestamp (ms) when the global data was last modified. */
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// save/slot:set
// ---------------------------------------------------------------------------

/**
 * Parameters for `save/slot:set`.
 *
 * This event performs a **create-or-update** (upsert) on the in-memory slot:
 * - If a slot with the given `id` already exists, `patch` is shallow-merged
 *   into its data bag and `meta.updatedAt` is refreshed.
 * - If no slot with that `id` exists, a new slot is created with `patch` as
 *   its initial data and `name` (or `id` if omitted) as its display name.
 *
 * The save slot is only modified in memory.  Call `save/slot:save` to persist
 * the changes to storage.
 */
export interface SaveSlotSetParams {
  /** ID of the slot to update.  The slot will be created if it does not exist. */
  id: string;
  /** Partial data to shallow-merge into the slot's data bag. */
  patch: Record<string, unknown>;
  /**
   * Optional: set or update the slot's human-readable display name.
   * When omitted the existing name (or the ID for new slots) is preserved.
   */
  name?: string;
}

// ---------------------------------------------------------------------------
// save/slot:get
// ---------------------------------------------------------------------------

/** Parameters for `save/slot:get`. */
export interface SaveSlotGetParams {
  /** ID of the slot to retrieve. */
  id: string;
}

/** Output for `save/slot:get`. */
export interface SaveSlotGetOutput {
  /**
   * The live in-memory slot, or `undefined` if no slot with that ID exists.
   *
   * > **Warning**: This is a direct reference to the internal state.
   * > Mutating it will mutate the live save data.  Clone it if you need a
   * > safe snapshot.
   */
  slot: SlotData | undefined;
}

// ---------------------------------------------------------------------------
// save/slot:list
// ---------------------------------------------------------------------------

/** Output for `save/slot:list`. */
export interface SaveSlotListOutput {
  /** Metadata for every slot currently held in memory, in insertion order. */
  slots: SlotMeta[];
}

// ---------------------------------------------------------------------------
// save/slot:save  (memory → storage)
// ---------------------------------------------------------------------------

/** Parameters for `save/slot:save`. */
export interface SaveSlotSaveParams {
  /** ID of the slot to persist. */
  id: string;
  /**
   * Optional: rename the slot before persisting.
   * When provided, `SaveManager` updates `meta.name` (and `meta.updatedAt`)
   * prior to serialising.
   */
  name?: string;
}

/**
 * Output for `save/slot:save`.
 *
 * ### Phase responsibilities (Plan A)
 * | Phase  | Responsible party  | Action |
 * |--------|--------------------|--------|
 * | before | game / middleware   | Validate or cancel the save (call `control.break()` to abort) |
 * | main   | `SaveManager`      | Serialises the slot into `output.data` |
 * | after  | environment plugin | Reads `output.data` and writes it to persistent storage |
 */
export interface SaveSlotSaveOutput {
  /**
   * A deep-cloned, serialisable snapshot of the slot, populated by
   * `SaveManager` during the **main** phase.
   *
   * An environment plugin should read this in the **after** phase and persist
   * it to storage (filesystem, localStorage, cloud, etc.).
   *
   * `undefined` when the requested slot ID does not exist in memory.
   */
  data: SlotData | undefined;
  /**
   * Set to `true` by the environment plugin (in the **after** phase) to
   * signal that the data was successfully written to persistent storage.
   */
  saved: boolean;
}

// ---------------------------------------------------------------------------
// save/slot:load  (storage → memory)
// ---------------------------------------------------------------------------

/** Parameters for `save/slot:load`. */
export interface SaveSlotLoadParams {
  /** ID of the slot to restore from persistent storage. */
  id: string;
}

/**
 * Output for `save/slot:load`.
 *
 * ### Phase responsibilities (Plan A)
 * | Phase  | Responsible party  | Action |
 * |--------|--------------------|--------|
 * | before | environment plugin | Reads the slot from storage and sets `output.raw` |
 * | main   | `SaveManager`      | Reads `output.raw` and writes it into in-memory state |
 * | after  | game / middleware  | React to the completed load (e.g. refresh UI) |
 */
export interface SaveSlotLoadOutput {
  /**
   * Raw slot data read from persistent storage.
   * Must be set by the environment plugin in the **before** phase.
   *
   * Leave as `undefined` (or do not set) if the slot could not be found in
   * storage; `SaveManager` will then leave the in-memory state unchanged and
   * set `loaded` to `false`.
   */
  raw: SlotData | undefined;
  /**
   * Set to `true` by `SaveManager` (in the **main** phase) once the slot has
   * been successfully written into memory.
   */
  loaded: boolean;
}

// ---------------------------------------------------------------------------
// save/slot:delete
// ---------------------------------------------------------------------------

/** Parameters for `save/slot:delete`. */
export interface SaveSlotDeleteParams {
  /** ID of the slot to remove. */
  id: string;
}

/**
 * Output for `save/slot:delete`.
 *
 * ### Phase responsibilities
 * | Phase | Responsible party  | Action |
 * |-------|--------------------|--------|
 * | main  | `SaveManager`      | Removes the slot from memory; sets `deleted` |
 * | after | environment plugin | Deletes the slot from persistent storage |
 */
export interface SaveSlotDeleteOutput {
  /**
   * `true` when the slot was found and removed from memory, `false` when no
   * slot with that ID existed.
   */
  deleted: boolean;
}

// ---------------------------------------------------------------------------
// save/global:set
// ---------------------------------------------------------------------------

/** Parameters for `save/global:set`. */
export interface SaveGlobalSetParams {
  /** Partial data to shallow-merge into the global save bag. */
  patch: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// save/global:get
// ---------------------------------------------------------------------------

/** Output for `save/global:get`. */
export interface SaveGlobalGetOutput {
  /**
   * The live in-memory global save data.
   *
   * > **Warning**: This is a direct reference to the internal state.
   * > Mutating it will mutate the live save data.  Clone if needed.
   */
  data: GlobalSaveData;
}

// ---------------------------------------------------------------------------
// save/global:save  (memory → storage)
// ---------------------------------------------------------------------------

/**
 * Output for `save/global:save`.
 *
 * ### Phase responsibilities (Plan A)
 * | Phase  | Responsible party  | Action |
 * |--------|--------------------|--------|
 * | before | game / middleware   | Validate or cancel |
 * | main   | `SaveManager`      | Serialises global data into `output.data` |
 * | after  | environment plugin | Writes `output.data` to persistent storage |
 */
export interface SaveGlobalSaveOutput {
  /**
   * A deep-cloned, serialisable snapshot of the global save data, populated
   * by `SaveManager` during the **main** phase.
   *
   * `undefined` only if SaveManager has not yet been initialised (should not
   * happen in normal use).
   */
  data: GlobalSaveData | undefined;
  /**
   * Set to `true` by the environment plugin (in the **after** phase) to
   * signal successful persistence.
   */
  saved: boolean;
}

// ---------------------------------------------------------------------------
// save/global:load  (storage → memory)
// ---------------------------------------------------------------------------

/**
 * Output for `save/global:load`.
 *
 * ### Phase responsibilities (Plan A)
 * | Phase  | Responsible party  | Action |
 * |--------|--------------------|--------|
 * | before | environment plugin | Reads global data from storage and sets `output.raw` |
 * | main   | `SaveManager`      | Reads `output.raw` and replaces in-memory global data |
 * | after  | game / middleware  | React to the completed load |
 */
export interface SaveGlobalLoadOutput {
  /**
   * Raw global save data read from persistent storage.
   * Must be set by the environment plugin in the **before** phase.
   *
   * Leave as `undefined` if global data could not be found in storage;
   * `SaveManager` will then leave the in-memory state unchanged and set
   * `loaded` to `false`.
   */
  raw: GlobalSaveData | undefined;
  /**
   * Set to `true` by `SaveManager` (in the **main** phase) once the global
   * data has been successfully written into memory.
   */
  loaded: boolean;
}
