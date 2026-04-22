import type { Core } from '../../core/Core.js';
import type { EnginePlugin } from '../../types/plugin.js';
import type {
  StoreNamespace,
  StoreSnapshot,
  StoreSetParams,
  StoreGetParams,
  StoreGetOutput,
  StorePatchParams,
  StoreGetNamespaceParams,
  StoreGetNamespaceOutput,
  StoreClearNamespaceParams,
  StoreSnapshotOutput,
  StoreRestoreParams,
} from '../../types/store.js';
import type {
  SaveSlotSaveParams,
  SaveSlotSaveOutput,
  SaveSlotLoadOutput,
} from '../../types/save.js';
import type { ScriptRegisterCommandParams } from '../../types/script.js';

// ---------------------------------------------------------------------------
// VariableStoreManager
// ---------------------------------------------------------------------------

/**
 * Built-in plugin that provides a **namespaced, persistent variable store**
 * for game logic and plugins.
 *
 * The store is a two-level key-value map:
 *
 * ```
 * store
 * ├── 'player'   → { gold: 250, level: 4 }
 * ├── 'quest'    → { questA: true, questB: false }
 * └── 'audio'    → { volume: 80 }
 * ```
 *
 * Data lives in memory and is automatically saved/restored as part of the
 * `save/slot:save` / `save/slot:load` lifecycle: a deep-clone of the store
 * is embedded in the slot's `data._varStore` field.
 *
 * ---
 *
 * ### Namespace conventions
 *
 * Use short, lowercase, dot-free identifiers:
 *
 * | Use case           | Recommended namespace           |
 * |--------------------|---------------------------------|
 * | Core game state    | `'player'`, `'quest'`, `'world'`|
 * | Plugin-owned data  | The plugin's own namespace (e.g. `'audio'`) |
 * | Per-actor data     | `actorType` or `actorInstanceId` |
 *
 * Namespaces are strings chosen by the caller.  The engine does **not**
 * enforce ownership; the convention above is the encapsulation boundary.
 *
 * ---
 *
 * ### Events handled (main phase unless noted)
 *
 * | Event                | Params / Output                      | Description |
 * |----------------------|--------------------------------------|-------------|
 * | `store/set`          | {@link StoreSetParams}               | Write a single key |
 * | `store/get`          | {@link StoreGetParams} / {@link StoreGetOutput} | Read a single key |
 * | `store/patch`        | {@link StorePatchParams}             | Shallow-merge many keys |
 * | `store/get-namespace`| {@link StoreGetNamespaceParams} / {@link StoreGetNamespaceOutput} | Read all keys in a namespace |
 * | `store/clear-namespace` | {@link StoreClearNamespaceParams} | Delete all keys in a namespace |
 * | `store/snapshot`     | — / {@link StoreSnapshotOutput}      | Deep-clone the whole store |
 * | `store/restore`      | {@link StoreRestoreParams}           | Replace the store with a snapshot |
 * | `save/slot:save`     | — / {@link SaveSlotSaveOutput}       | **after** phase — embeds store snapshot in `output.data` |
 * | `save/slot:load`     | — / {@link SaveSlotLoadOutput}       | **after** phase — restores store from `output.slot.data._varStore` |
 *
 * ---
 *
 * ### Script commands registered
 *
 * | Command       | Fields                                     | Description |
 * |---------------|--------------------------------------------|-------------|
 * | `store-set`   | `ns` (string), `key` (string), `value`     | Write a value |
 * | `store-get`   | `ns` (string), `key` (string), `var` (string) | Read a value into a script variable |
 * | `store-patch` | `ns` (string), `patch` (object)            | Shallow-merge many values |
 *
 * Script usage example:
 * ```ts
 * { cmd: 'store-set',   ns: 'player', key: 'questA', value: true }
 * { cmd: 'store-get',   ns: 'player', key: 'gold',   var: 'myGold' }
 * { cmd: 'if',          var: 'myGold', value: 100, jump: 'enough' }
 * { cmd: 'store-patch', ns: 'quest',  patch: { chapter: 2, done: true } }
 * ```
 *
 * ---
 *
 * ### Save / load integration
 *
 * ```
 * save/slot:save
 *   main   → SaveManager   serialises the slot into output.data
 *   after  → VariableStoreManager  snapshots the store and patches
 *            output.data.data._varStore  with the snapshot
 *   after  → env plugin    writes output.data to storage
 *
 * save/slot:load
 *   before → env plugin    reads storage → output.raw
 *   main   → SaveManager   writes output.raw into memory slot
 *   after  → VariableStoreManager  reads output.slot.data._varStore
 *            and calls store/restore to hydrate the store
 *   after  → game          refreshes UI, etc.
 * ```
 *
 * @example
 * ```ts
 * import { createEngine, SaveManager, VariableStoreManager, ScriptManager } from 'inkshot-engine';
 *
 * const { core } = await createEngine({
 *   plugins: [new SaveManager(), new VariableStoreManager(), new ScriptManager()],
 * });
 *
 * // Write
 * core.events.emitSync('store/set', { ns: 'player', key: 'gold', value: 250 });
 *
 * // Read
 * const { output } = core.events.emitSync('store/get', { ns: 'player', key: 'gold' });
 * console.log(output.value); // 250
 *
 * // Persist (SaveManager + env adapter must also be present)
 * await core.events.emit('save/slot:set',  { id: 'slot-1', patch: {} });
 * await core.events.emit('save/slot:save', { id: 'slot-1' });
 * ```
 */
export class VariableStoreManager implements EnginePlugin {
  readonly namespace = 'store';

  /**
   * `VariableStoreManager` optionally registers script commands into
   * `ScriptManager`.  When both plugins are used together, list
   * `ScriptManager` **before** `VariableStoreManager` in the plugins array so
   * that `ScriptManager` is initialised first and is ready to receive
   * `script/register-command` events.
   *
   * The script commands (`store-set`, `store-get`, `store-patch`) are only
   * available when `ScriptManager` is present; the rest of the store API works
   * independently.
   */
  readonly dependencies: readonly string[] = [];
  readonly editorMeta = {
    displayName: 'Variable Store Manager',
    icon: 'store',
    description: 'Namespaced key-value variable store with save/load integration.',
    events: [
      'store/set', 'store/get', 'store/patch',
      'store/get-namespace', 'store/clear-namespace',
      'store/snapshot', 'store/restore',
    ] as const,
  };

  /** Two-level store: namespace → (key → value). */
  private readonly _store = new Map<string, StoreNamespace>();

  // ---------------------------------------------------------------------------
  // EnginePlugin lifecycle
  // ---------------------------------------------------------------------------

  init(core: Core): void {
    const { events } = core;

    // ── store/set ─────────────────────────────────────────────────────────
    events.on<StoreSetParams>(this.namespace, 'store/set', (params) => {
      this._getOrCreate(params.ns)[params.key] = params.value;
    });

    // ── store/get ─────────────────────────────────────────────────────────
    events.on<StoreGetParams, StoreGetOutput>(
      this.namespace,
      'store/get',
      (params, output) => {
        output.value = this._store.get(params.ns)?.[params.key];
      },
    );

    // ── store/patch ───────────────────────────────────────────────────────
    events.on<StorePatchParams>(this.namespace, 'store/patch', (params) => {
      Object.assign(this._getOrCreate(params.ns), params.patch);
    });

    // ── store/get-namespace ───────────────────────────────────────────────
    events.on<StoreGetNamespaceParams, StoreGetNamespaceOutput>(
      this.namespace,
      'store/get-namespace',
      (params, output) => {
        output.data = this._store.get(params.ns);
      },
    );

    // ── store/clear-namespace ─────────────────────────────────────────────
    events.on<StoreClearNamespaceParams>(
      this.namespace,
      'store/clear-namespace',
      (params) => {
        this._store.delete(params.ns);
      },
    );

    // ── store/snapshot ────────────────────────────────────────────────────
    events.on<Record<string, never>, StoreSnapshotOutput>(
      this.namespace,
      'store/snapshot',
      (_params, output) => {
        output.snapshot = this._deepCloneStore();
      },
    );

    // ── store/restore ─────────────────────────────────────────────────────
    events.on<StoreRestoreParams>(this.namespace, 'store/restore', (params) => {
      this._store.clear();
      const clone = structuredClone(params.snapshot) as StoreSnapshot;
      for (const [ns, data] of Object.entries(clone)) {
        this._store.set(ns, data);
      }
    });

    // ── save/slot:save — after phase — embed snapshot in output.data ──────
    events.on<SaveSlotSaveParams, SaveSlotSaveOutput>(
      this.namespace,
      'save/slot:save',
      (_params, output) => {
        if (!output.data) return;
        output.data.data['_varStore'] = this._deepCloneStore();
      },
      { phase: 'after' },
    );

    // ── save/slot:load — after phase — restore snapshot from slot data ────
    events.on<Record<string, never>, SaveSlotLoadOutput>(
      this.namespace,
      'save/slot:load',
      (_params, output) => {
        if (!output.loaded || !output.raw) return;
        const raw = output.raw.data['_varStore'];
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
          events.emitSync<StoreRestoreParams>('store/restore', {
            snapshot: raw as StoreSnapshot,
          });
        }
      },
      { phase: 'after' },
    );

    // ── Script commands ───────────────────────────────────────────────────
    this._registerScriptCommands(core);
  }

  destroy(core: Core): void {
    core.events.removeNamespace(this.namespace);
    this._store.clear();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Return the namespace map, creating it on first access. */
  private _getOrCreate(ns: string): StoreNamespace {
    let data = this._store.get(ns);
    if (!data) {
      data = {};
      this._store.set(ns, data);
    }
    return data;
  }

  /** Deep-clone the entire store into a plain object. */
  private _deepCloneStore(): StoreSnapshot {
    const plain: StoreSnapshot = {};
    for (const [ns, data] of this._store) {
      plain[ns] = structuredClone(data) as StoreNamespace;
    }
    return plain;
  }

  /**
   * Register the three store-* script commands via `script/register-command`.
   *
   * This is called from `init()` so the commands are available as soon as
   * `VariableStoreManager` is initialised, regardless of the order plugins are
   * loaded.  If `ScriptManager` is not present the events are simply ignored.
   */
  private _registerScriptCommands(core: Core): void {
    // store-set: write a single value into the store
    core.events.emitSync<ScriptRegisterCommandParams>('script/register-command', {
      cmd: 'store-set',
      handler: (ctx) => {
        const ns  = ctx.node['ns']  as string | undefined;
        const key = ctx.node['key'] as string | undefined;
        if (!ns || !key) {
          console.warn('[VariableStoreManager] store-set: requires "ns" and "key" fields.');
          return;
        }
        core.events.emitSync<StoreSetParams>('store/set', {
          ns,
          key,
          value: ctx.node['value'],
        });
      },
    });

    // store-get: read a single value from the store into a script variable
    core.events.emitSync<ScriptRegisterCommandParams>('script/register-command', {
      cmd: 'store-get',
      handler: (ctx) => {
        const ns      = ctx.node['ns']  as string | undefined;
        const key     = ctx.node['key'] as string | undefined;
        const varName = ctx.node['var'] as string | undefined;
        if (!ns || !key) {
          console.warn('[VariableStoreManager] store-get: requires "ns" and "key" fields.');
          return;
        }
        const { output } = core.events.emitSync<StoreGetParams, StoreGetOutput>(
          'store/get',
          { ns, key },
        );
        if (varName) {
          ctx.vars[varName] = output.value;
        }
      },
    });

    // store-patch: shallow-merge many values into a namespace
    core.events.emitSync<ScriptRegisterCommandParams>('script/register-command', {
      cmd: 'store-patch',
      handler: (ctx) => {
        const ns    = ctx.node['ns']    as string | undefined;
        const patch = ctx.node['patch'] as Record<string, unknown> | undefined;
        if (!ns || !patch || typeof patch !== 'object' || Array.isArray(patch)) {
          console.warn(
            '[VariableStoreManager] store-patch: requires "ns" (string) and "patch" (object) fields.',
          );
          return;
        }
        core.events.emitSync<StorePatchParams>('store/patch', { ns, patch });
      },
    });
  }
}
