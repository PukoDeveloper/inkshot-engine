// ---------------------------------------------------------------------------
// data/load
// ---------------------------------------------------------------------------

/**
 * Parameters for `data/load`.
 *
 * Loads a **named JSON collection** into memory.  Exactly **one** of `file`
 * or `entries` must be provided:
 *
 * - `file` — URL (resolved against `dataRoot`) to a JSON file whose
 *   top-level keys become entry IDs.
 * - `entries` — inline object whose top-level keys become entry IDs.
 *
 * If a collection with the same `collection` name already exists in memory,
 * its entries are **merged** (new keys win over existing ones).  This allows
 * loading the same logical collection from multiple files.
 *
 * @example
 * ```ts
 * // Load from file
 * await core.events.emit('data/load', {
 *   collection: 'items',
 *   file: 'data/items.json',
 * });
 *
 * // Load from multiple files into the same collection
 * await core.events.emit('data/load', {
 *   collection: 'items',
 *   file: 'data/dlc-items.json',
 * });
 *
 * // Load from inline data (useful in tests or for hardcoded config)
 * await core.events.emit('data/load', {
 *   collection: 'skills',
 *   entries: { fireball: { cost: 10, dmg: 50 }, heal: { cost: 8, restore: 40 } },
 * });
 * ```
 */
export interface DataLoadParams {
  /**
   * Explicit name that identifies this collection.
   *
   * Used as the first-dimension key for all subsequent `data/get` and
   * `data/getAll` calls.  Must be unique per logical data type in your game
   * (e.g. `'items'`, `'skills'`, `'enemies'`).
   */
  collection: string;

  /**
   * URL or path to a JSON file.
   * Resolved against `core.dataRoot` unless already absolute or root-anchored.
   *
   * The file must be a JSON **object** whose top-level keys are entry IDs.
   *
   * @example `'data/items.json'`
   */
  file?: string;

  /**
   * Inline data object whose top-level keys are entry IDs.
   *
   * Takes precedence over `file` when both are provided.
   *
   * @example `{ sword: { atk: 15 }, shield: { def: 10 } }`
   */
  entries?: Record<string, unknown>;
}

/** Output for `data/load`. */
export interface DataLoadOutput {
  /** `true` when all entries were loaded without error. */
  loaded: boolean;
  /** Name of the collection that was loaded. */
  collection: string;
  /** Number of entries now stored in the collection (after merge). */
  count: number;
}

// ---------------------------------------------------------------------------
// data/get
// ---------------------------------------------------------------------------

/**
 * Parameters for `data/get`.
 *
 * Synchronous (`emitSync`) lookup of a **single entry** within a named
 * collection.  Never triggers a network request.
 *
 * @example
 * ```ts
 * const { output } = core.events.emitSync<DataGetParams, DataGetOutput>(
 *   'data/get', { collection: 'items', id: 'sword' },
 * );
 * if (output.found) console.log(output.data); // { atk: 15, ... }
 * ```
 */
export interface DataGetParams {
  /** Name of the collection to search. */
  collection: string;
  /** ID of the entry to retrieve. */
  id: string;
}

/** Output for `data/get`. */
export interface DataGetOutput {
  /** The entry data, or `undefined` if not found. */
  data: unknown;
  /** `true` when the entry was found in the collection. */
  found: boolean;
}

// ---------------------------------------------------------------------------
// data/getAll
// ---------------------------------------------------------------------------

/**
 * Parameters for `data/getAll`.
 *
 * Synchronous (`emitSync`) retrieval of **all entries** in a named
 * collection.
 *
 * @example
 * ```ts
 * const { output } = core.events.emitSync<DataGetAllParams, DataGetAllOutput>(
 *   'data/getAll', { collection: 'skills' },
 * );
 * for (const [id, skill] of Object.entries(output.entries)) {
 *   console.log(id, skill);
 * }
 * ```
 */
export interface DataGetAllParams {
  /** Name of the collection to retrieve. */
  collection: string;
}

/** Output for `data/getAll`. */
export interface DataGetAllOutput {
  /**
   * All entries in the collection keyed by their ID.
   * Empty object (`{}`) when the collection does not exist.
   */
  entries: Record<string, unknown>;
  /** `true` when the collection was found (even if it has zero entries). */
  found: boolean;
}

// ---------------------------------------------------------------------------
// data/unload
// ---------------------------------------------------------------------------

/**
 * Parameters for `data/unload`.
 *
 * Removes a named collection from memory.  Useful at scene transitions to
 * free references that are no longer needed.
 *
 * @example
 * ```ts
 * core.events.emitSync('data/unload', { collection: 'level-1-enemies' });
 * ```
 */
export interface DataUnloadParams {
  /** Name of the collection to remove. */
  collection: string;
}

/** Output for `data/unload`. */
export interface DataUnloadOutput {
  /**
   * `true` when a collection with the given name existed and was removed.
   * `false` when the collection was not found (no-op).
   */
  unloaded: boolean;
}
