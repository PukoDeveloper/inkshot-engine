import type { Core } from '../../core/Core.js';
import type { EnginePlugin } from '../../types/plugin.js';
import type {
  SettingsManagerOptions,
  SettingsSetParams,
  SettingsGetParams,
  SettingsGetOutput,
  SettingsGetAllOutput,
  SettingsResetParams,
  SettingsSaveOutput,
  SettingsLoadOutput,
  SettingsChangedParams,
} from '../../types/settings.js';
import type { SaveGlobalGetOutput, SaveGlobalSaveOutput, SaveGlobalLoadOutput } from '../../types/save.js';

/**
 * Built-in plugin that manages player-preference **settings** in a
 * schema-free, bridge-ready way.
 *
 * `SettingsManager` deliberately has **no built-in schema**.  Every
 * key/value pair is defined entirely by the game developer via the
 * `defaults` constructor option.  This makes it suitable for any game —
 * a puzzle game might only store `{ 'volume.master': 1 }`, while a complex
 * RPG might store dozens of preferences.
 *
 * ---
 *
 * ### Event contract
 *
 * | Event               | Async? | Description |
 * |---------------------|--------|-------------|
 * | `settings/set`      | ✗      | Merge a patch into the in-memory settings store |
 * | `settings/get`      | ✗      | Read the value for a single key |
 * | `settings/get-all`  | ✗      | Read a shallow copy of all current settings |
 * | `settings/reset`    | ✗      | Reset one or all keys to the constructor defaults |
 * | `settings/save`     | ✓      | Persist settings to the global save via `SaveManager` |
 * | `settings/load`     | ✓      | Load settings from the global save via `SaveManager` |
 * | `settings/changed`  | —      | Notification emitted after every set/reset |
 *
 * ---
 *
 * ### Optional bridges
 *
 * When enabled (all are `true` by default), the manager automatically
 * forwards relevant setting changes to other engine systems:
 *
 * | Setting key               | Bridge action |
 * |---------------------------|---------------|
 * | `'volume.master'`         | `audio/volume { volume }` |
 * | `'volume.<category>'`     | `audio/volume { category, volume }` |
 * | `'locale'`                | `i18n/set-locale { locale }` |
 * | `'keyBindings'`           | `input/action:bind { action, codes }` per entry |
 *
 * Bridges are purely additive — they fire in addition to `settings/changed`.
 * Disable individual bridges via the `bridges` constructor option if you
 * prefer to forward changes yourself.
 *
 * ---
 *
 * ### Persistence
 *
 * Settings are stored inside `GlobalSaveData.data` under the key
 * `'_settings'` (configurable via `saveKey`).  Call `settings/save` to
 * persist and `settings/load` to restore.  A `SaveManager` instance and an
 * environment adapter (e.g. `LocalStorageSaveAdapter`) must be installed for
 * persistence to work; the events are safely no-ops if they are absent.
 *
 * ---
 *
 * ### Usage
 *
 * ```ts
 * import { createEngine, SettingsManager } from 'inkshot-engine';
 *
 * const { core } = await createEngine({
 *   plugins: [
 *     new SettingsManager({
 *       defaults: {
 *         'volume.master': 1,
 *         'volume.bgm': 0.8,
 *         'volume.sfx': 1,
 *         locale: 'en',
 *         keyBindings: { jump: ['Space'], attack: ['KeyZ'] },
 *       },
 *     }),
 *   ],
 * });
 *
 * // Change a value (also forwarded to AudioManager via the audio bridge)
 * core.events.emitSync('settings/set', { patch: { 'volume.bgm': 0.5 } });
 *
 * // Read a single key
 * const { output } = core.events.emitSync('settings/get', { key: 'locale' });
 * console.log(output.value); // 'en'
 *
 * // Persist settings (requires SaveManager + an env adapter)
 * await core.events.emit('settings/save');
 *
 * // Restore persisted settings on next boot
 * await core.events.emit('settings/load');
 * ```
 */
export class SettingsManager implements EnginePlugin {
  readonly namespace = 'settings';
  readonly editorMeta = {
    displayName: 'Settings Manager',
    icon: 'settings',
    description: 'Persists and bridges user-facing settings (audio volume, locale, key bindings, …).',
    commands: [
      'settings/set', 'settings/get', 'settings/get-all',
      'settings/reset', 'settings/save', 'settings/load',
    ] as const,
  };

  private readonly _defaults: Record<string, unknown>;
  private readonly _saveKey: string;
  private readonly _bridges: Required<NonNullable<SettingsManagerOptions['bridges']>>;

  /** Live in-memory settings (defaults deep-cloned at construction, mutated by set/reset/load). */
  private _settings: Record<string, unknown>;

  /** Reference to core, set during init() and used by bridges. */
  private _core!: Core;

  constructor(options: SettingsManagerOptions = {}) {
    this._defaults = options.defaults !== undefined ? structuredClone(options.defaults) : {};
    this._saveKey = options.saveKey ?? '_settings';
    this._bridges = {
      audio: options.bridges?.audio !== false,
      locale: options.bridges?.locale !== false,
      inputBindings: options.bridges?.inputBindings !== false,
    };
    // Start from a deep clone of the defaults so initial state is clean.
    this._settings = structuredClone(this._defaults);
  }

  // ---------------------------------------------------------------------------
  // EnginePlugin lifecycle
  // ---------------------------------------------------------------------------

  init(core: Core): void {
    this._core = core;
    const { events } = core;

    // ── settings/set ─────────────────────────────────────────────────────────

    events.on<SettingsSetParams>(this.namespace, 'settings/set', (params) => {
      Object.assign(this._settings, params.patch);
      this._notifyChanged(params.patch);
      this._applyBridges(params.patch);
    });

    // ── settings/get ─────────────────────────────────────────────────────────

    events.on<SettingsGetParams, SettingsGetOutput>(
      this.namespace,
      'settings/get',
      (params, output) => {
        if (Object.prototype.hasOwnProperty.call(this._settings, params.key)) {
          output.value = this._settings[params.key];
          output.found = true;
        } else {
          output.value = undefined;
          output.found = false;
        }
      },
    );

    // ── settings/get-all ─────────────────────────────────────────────────────

    events.on<Record<string, never>, SettingsGetAllOutput>(
      this.namespace,
      'settings/get-all',
      (_params, output) => {
        output.settings = { ...this._settings };
      },
    );

    // ── settings/reset ───────────────────────────────────────────────────────

    events.on<SettingsResetParams>(this.namespace, 'settings/reset', (params) => {
      if (params.key !== undefined) {
        // Reset a single key.
        if (Object.prototype.hasOwnProperty.call(this._defaults, params.key)) {
          this._settings[params.key] = structuredClone(this._defaults[params.key]);
        } else {
          delete this._settings[params.key];
        }
        const changes: Record<string, unknown> = {
          [params.key]: this._settings[params.key],
        };
        this._notifyChanged(changes);
        this._applyBridges(changes);
      } else {
        // Reset everything.
        this._settings = structuredClone(this._defaults);
        const changes = { ...this._settings };
        this._notifyChanged(changes);
        this._applyBridges(changes);
      }
    });

    // ── settings/save ─────────────────────────────────────────────────────────

    events.on<Record<string, never>, SettingsSaveOutput>(
      this.namespace,
      'settings/save',
      async (_params, output) => {
        // Write settings into the global save bag.
        events.emitSync('save/global:set', {
          patch: { [this._saveKey]: structuredClone(this._settings) },
        });

        // Persist the global save.  An env plugin must handle the after phase.
        const { output: saveOut } = await events.emit<Record<string, never>, SaveGlobalSaveOutput>(
          'save/global:save',
          {},
        );
        output.saved = saveOut.saved ?? false;
      },
    );

    // ── settings/load ─────────────────────────────────────────────────────────

    events.on<Record<string, never>, SettingsLoadOutput>(
      this.namespace,
      'settings/load',
      async (_params, output) => {
        // Ask the env plugin to populate the global save from storage.
        await events.emit<Record<string, never>, SaveGlobalLoadOutput>('save/global:load', {});

        // Read the now-populated global data.
        const { output: globalOut } = events.emitSync<Record<string, never>, SaveGlobalGetOutput>(
          'save/global:get',
          {},
        );

        const stored = globalOut.data?.data?.[this._saveKey];
        if (stored !== null && stored !== undefined && typeof stored === 'object' && !Array.isArray(stored)) {
          const patch = stored as Record<string, unknown>;
          Object.assign(this._settings, patch);
          output.loaded = true;
          this._notifyChanged(patch);
          this._applyBridges(patch);
        } else {
          output.loaded = false;
        }
      },
    );
  }

  destroy(core: Core): void {
    core.events.removeNamespace(this.namespace);
    this._settings = structuredClone(this._defaults);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Emit `settings/changed` with the given change set.
   */
  private _notifyChanged(changes: Record<string, unknown>): void {
    this._core.events.emitSync<SettingsChangedParams>('settings/changed', { changes });
  }

  /**
   * Forward relevant setting changes to other engine systems when the
   * corresponding bridge is enabled.
   */
  private _applyBridges(patch: Record<string, unknown>): void {
    const { audio, locale, inputBindings } = this._bridges;

    if (audio) {
      for (const [key, value] of Object.entries(patch)) {
        if (typeof value !== 'number') continue;
        if (key === 'volume.master') {
          this._core.events.emitSync('audio/volume', { volume: value });
        } else if (key.startsWith('volume.')) {
          const category = key.slice('volume.'.length);
          this._core.events.emitSync('audio/volume', { category, volume: value });
        }
      }
    }

    if (locale && 'locale' in patch && typeof patch.locale === 'string') {
      void this._core.events.emit('i18n/set-locale', { locale: patch.locale });
    }

    if (inputBindings && 'keyBindings' in patch) {
      const bindings = patch.keyBindings;
      if (bindings !== null && bindings !== undefined && typeof bindings === 'object' && !Array.isArray(bindings)) {
        for (const [action, codes] of Object.entries(bindings as Record<string, unknown>)) {
          if (Array.isArray(codes)) {
            this._core.events.emitSync('input/action:bind', { action, codes });
          }
        }
      }
    }
  }
}
