// ---------------------------------------------------------------------------
// SettingsManager — types
// ---------------------------------------------------------------------------

/**
 * Options accepted by the {@link SettingsManager} constructor.
 */
export interface SettingsManagerOptions {
  /**
   * Initial default values for all settings.
   *
   * These are used as the starting state when the engine boots and as the
   * target values when `settings/reset` is called.  The schema is completely
   * up to the developer — any JSON-serialisable key/value pairs are accepted.
   *
   * @example
   * ```ts
   * new SettingsManager({
   *   defaults: {
   *     'volume.master': 1,
   *     'volume.bgm': 0.8,
   *     'volume.sfx': 1,
   *     locale: 'en',
   *     keyBindings: { jump: ['Space'], attack: ['KeyZ'] },
   *   },
   * })
   * ```
   */
  defaults?: Record<string, unknown>;

  /**
   * Key used to store/retrieve settings inside `GlobalSaveData.data`.
   * Defaults to `'_settings'`.
   *
   * Change this only if `'_settings'` conflicts with another system writing
   * to the global save bag.
   */
  saveKey?: string;

  /**
   * Optional automatic integration bridges.
   *
   * When a bridge is enabled (all are `true` by default), `SettingsManager`
   * will forward the relevant setting changes to the appropriate engine system
   * after every `settings/set` or `settings/reset` call.  The bridges are
   * purely **convention-based** — they only fire when the settings key matches
   * the expected naming convention; no error is thrown if the targeted system
   * is not installed.
   *
   * Set a bridge to `false` to opt out and handle the forwarding yourself.
   */
  bridges?: {
    /**
     * When `true` (default), volume settings are forwarded to `AudioManager`.
     *
     * Convention:
     * - Key `'volume.master'` (number 0–1) → `audio/volume { volume }`
     * - Key `'volume.<category>'` (number 0–1) → `audio/volume { category, volume }`
     *   where `<category>` is any string (e.g. `bgm`, `sfx`, `vo`, `ambient`).
     */
    audio?: boolean;

    /**
     * When `true` (default), the `locale` setting is forwarded to
     * `LocalizationManager`.
     *
     * Convention:
     * - Key `'locale'` (string) → `i18n/set-locale { locale }`
     */
    locale?: boolean;

    /**
     * When `true` (default), key-binding settings are forwarded to
     * `InputManager`.
     *
     * Convention:
     * - Key `'keyBindings'` (object mapping action → string[]) →
     *   one `input/action:bind { action, codes }` call per entry.
     */
    inputBindings?: boolean;
  };
}

// ---------------------------------------------------------------------------
// settings/set
// ---------------------------------------------------------------------------

/**
 * Parameters for `settings/set`.
 *
 * Shallow-merges `patch` into the in-memory settings store.
 * Existing keys not present in `patch` are left unchanged.
 * After the merge `settings/changed` is emitted and any enabled bridges fire.
 *
 * @example
 * ```ts
 * core.events.emitSync('settings/set', {
 *   patch: { 'volume.bgm': 0.6, locale: 'zh-TW' },
 * });
 * ```
 */
export interface SettingsSetParams {
  /** Key/value pairs to merge into the current settings. */
  patch: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// settings/get
// ---------------------------------------------------------------------------

/** Parameters for `settings/get`. */
export interface SettingsGetParams {
  /** The settings key to look up. */
  key: string;
}

/** Output for `settings/get`. */
export interface SettingsGetOutput {
  /** The stored value, or `undefined` when the key has no value or default. */
  value: unknown;
  /** `true` when the key exists in the current settings (including defaults). */
  found: boolean;
}

// ---------------------------------------------------------------------------
// settings/get-all
// ---------------------------------------------------------------------------

/** Output for `settings/get-all`. */
export interface SettingsGetAllOutput {
  /**
   * A shallow copy of all current settings (defaults merged with any
   * developer-applied overrides).
   */
  settings: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// settings/reset
// ---------------------------------------------------------------------------

/**
 * Parameters for `settings/reset`.
 *
 * Resets settings to the defaults provided at construction time.
 * - If `key` is provided, only that key is reset.
 * - If `key` is omitted, **all** settings are reset to defaults.
 *
 * After the reset `settings/changed` is emitted and bridges fire for any
 * values that changed.
 */
export interface SettingsResetParams {
  /**
   * The specific key to reset.
   * When omitted all settings are reset to their defaults.
   */
  key?: string;
}

// ---------------------------------------------------------------------------
// settings/save  (memory → global save)
// ---------------------------------------------------------------------------

/**
 * Output for `settings/save`.
 *
 * Persists the current settings into the global save data via
 * `save/global:set` + `save/global:save`.  An environment plugin
 * (e.g. `LocalStorageSaveAdapter`) must handle the `after` phase of
 * `save/global:save` for the data to actually reach persistent storage.
 */
export interface SettingsSaveOutput {
  /**
   * `true` when the underlying `save/global:save` indicated successful
   * persistence (i.e. an env plugin set `saved = true` in its `after` phase).
   */
  saved: boolean;
}

// ---------------------------------------------------------------------------
// settings/load  (global save → memory)
// ---------------------------------------------------------------------------

/**
 * Output for `settings/load`.
 *
 * Triggers `save/global:load` so that an environment plugin can supply the
 * persisted global data, then extracts and applies the settings portion.
 */
export interface SettingsLoadOutput {
  /**
   * `true` when settings data was found in the global save and applied
   * to the in-memory store.
   */
  loaded: boolean;
}

// ---------------------------------------------------------------------------
// settings/changed  (notification)
// ---------------------------------------------------------------------------

/**
 * Parameters for the `settings/changed` notification event.
 *
 * Emitted after every `settings/set` or `settings/reset` call that results
 * in at least one value change.  Subscribe to this event to react to setting
 * changes (e.g. update a settings UI).
 *
 * @example
 * ```ts
 * core.events.on('myGame', 'settings/changed', (params) => {
 *   console.log('Settings changed:', params.changes);
 * });
 * ```
 */
export interface SettingsChangedParams {
  /**
   * Snapshot of the key/value pairs that were written during this operation.
   * For a `settings/reset` without a specific key this will be a full copy of
   * the defaults.
   */
  changes: Record<string, unknown>;
}
