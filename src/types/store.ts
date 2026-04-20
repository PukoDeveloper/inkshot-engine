import type { Core } from '../core/Core.js';

// ---------------------------------------------------------------------------
// Core data structures
// ---------------------------------------------------------------------------

/**
 * A single namespace within the variable store: a flat key-value map.
 *
 * Keys are strings; values are any serialisable type.  Every namespace is
 * isolated from every other namespace, so two plugins can both use the key
 * `'volume'` without collision as long as they use different namespace names.
 */
export type StoreNamespace = Record<string, unknown>;

/**
 * A snapshot of the entire variable store: a mapping from namespace name to
 * its key-value data.  Used when serialising to / restoring from save data.
 */
export type StoreSnapshot = Record<string, StoreNamespace>;

// ---------------------------------------------------------------------------
// Event params / output
// ---------------------------------------------------------------------------

/** Parameters for `store/set`. */
export interface StoreSetParams {
  /** Namespace to write into, e.g. `'player'`, `'quest'`, `'audio'`. */
  readonly ns: string;
  /** Key within the namespace. */
  readonly key: string;
  /** Value to store. */
  readonly value: unknown;
}

/** Parameters for `store/get`. */
export interface StoreGetParams {
  /** Namespace to read from. */
  readonly ns: string;
  /** Key within the namespace. */
  readonly key: string;
}

/** Output for `store/get`. */
export interface StoreGetOutput {
  /**
   * The stored value, or `undefined` if the namespace or key does not exist.
   */
  value: unknown;
}

/** Parameters for `store/patch`. */
export interface StorePatchParams {
  /** Namespace to patch. */
  readonly ns: string;
  /**
   * An object whose entries are written into the namespace.
   * Existing keys not present in `patch` are left unchanged.
   */
  readonly patch: Record<string, unknown>;
}

/** Parameters for `store/get-namespace`. */
export interface StoreGetNamespaceParams {
  /** Namespace to retrieve. */
  readonly ns: string;
}

/** Output for `store/get-namespace`. */
export interface StoreGetNamespaceOutput {
  /**
   * A **live reference** to the namespace's data object, or `undefined` if
   * the namespace has never been written to.
   *
   * > **Warning**: Mutating this object directly bypasses encapsulation.
   * > Prefer `store/set` / `store/patch` for all writes.
   */
  data: StoreNamespace | undefined;
}

/** Parameters for `store/clear-namespace`. */
export interface StoreClearNamespaceParams {
  /** Namespace to clear.  All keys in this namespace are deleted. */
  readonly ns: string;
}

/**
 * Output for `store/snapshot`.
 *
 * A **deep-cloned** copy of the entire variable store, safe to serialise as
 * part of a save slot.
 */
export interface StoreSnapshotOutput {
  /** Deep-cloned snapshot of the full store. */
  snapshot: StoreSnapshot;
}

/** Parameters for `store/restore`. */
export interface StoreRestoreParams {
  /**
   * A snapshot previously produced by `store/snapshot` (or a compatible
   * object read back from a save slot).  The current store is **replaced** by
   * a deep clone of this snapshot.
   */
  readonly snapshot: StoreSnapshot;
}

// ---------------------------------------------------------------------------
// Script-command context helper type (for store-get / store-set / store-patch)
// ---------------------------------------------------------------------------

/**
 * Minimal subset of {@link import('./script.js').ScriptContext} that the
 * store script-commands need.  Used only internally by VariableStoreManager.
 */
export interface StoreScriptCtx {
  readonly core: Core;
  readonly node: Record<string, unknown>;
  readonly vars: Record<string, unknown>;
}
