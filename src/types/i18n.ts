/**
 * A flat or nested map of translation keys to string values.
 *
 * Supports arbitrary nesting depth — nested keys are always accessed using
 * dot-notation by the `LocalizationManager`:
 *
 * @example
 * ```json
 * // Flat
 * { "menu.start": "Start Game", "menu.quit": "Quit" }
 *
 * // Nested (dot-notation access still works: "menu.start")
 * { "menu": { "start": "Start Game", "quit": "Quit" } }
 * ```
 */
export interface LocaleData {
  [key: string]: string | LocaleData;
}

// ---------------------------------------------------------------------------
// i18n/load
// ---------------------------------------------------------------------------

/**
 * Parameters for `i18n/load`.
 *
 * Loads translation data for a given locale.  Supply either a `url` pointing
 * to a JSON file or an inline `data` object (useful in tests and SSR).
 *
 * When `url` is provided the file is fetched with the browser `fetch` API and
 * its path is resolved against `core.dataRoot` unless it is an absolute URL.
 *
 * @example
 * ```ts
 * // Load from a JSON file
 * await core.events.emit('i18n/load', { locale: 'en', url: 'i18n/en.json' });
 *
 * // Load from inline data
 * await core.events.emit('i18n/load', {
 *   locale: 'zh-TW',
 *   data: { 'menu.start': '開始遊戲', 'menu.quit': '離開' },
 * });
 * ```
 */
export interface I18nLoadParams {
  /** The locale identifier, e.g. `'en'`, `'zh-TW'`, `'ja'`. */
  locale: string;
  /**
   * URL or path of the JSON translation file.
   * Resolved relative to `dataRoot` unless it starts with `/` or a scheme.
   */
  url?: string;
  /**
   * Inline translation data.  Takes precedence over `url` when both are given.
   */
  data?: LocaleData;
}

/** Output for `i18n/load`. */
export interface I18nLoadOutput {
  /** `true` when translation data was successfully loaded or merged. */
  loaded: boolean;
  /** The locale that was loaded. */
  locale: string;
}

// ---------------------------------------------------------------------------
// i18n/set-locale
// ---------------------------------------------------------------------------

/**
 * Parameters for `i18n/set-locale`.
 *
 * Switches the active locale.  The locale must have been loaded first via
 * `i18n/load`.  After the switch completes the bus automatically emits
 * `i18n/changed` so other systems can refresh their displayed text.
 *
 * @example
 * ```ts
 * await core.events.emit('i18n/set-locale', { locale: 'zh-TW' });
 * ```
 */
export interface I18nSetLocaleParams {
  /** The locale to activate. */
  locale: string;
}

/** Output for `i18n/set-locale`. */
export interface I18nSetLocaleOutput {
  /** The locale that was active before the switch, or `null` if none. */
  previous: string | null;
  /** The locale that is now active. */
  current: string;
}

// ---------------------------------------------------------------------------
// i18n/changed
// ---------------------------------------------------------------------------

/**
 * Parameters for `i18n/changed`.
 *
 * Emitted by `LocalizationManager` after the active locale changes.
 * Subscribe to this event to re-render any text that depends on the locale.
 *
 * @example
 * ```ts
 * core.events.on('ui', 'i18n/changed', ({ locale }) => {
 *   titleLabel.text = core.events.emitSync('i18n/t', { key: 'menu.title' }).output.value;
 * });
 * ```
 */
export interface I18nChangedParams {
  /** The newly active locale identifier. */
  locale: string;
  /** The locale that was active before the change, or `null` if this is the first locale set. */
  previous: string | null;
}

// ---------------------------------------------------------------------------
// i18n/t
// ---------------------------------------------------------------------------

/**
 * Parameters for `i18n/t` (translate).
 *
 * Synchronous key lookup against the active locale.  Nested keys are accessed
 * via dot-notation (`'menu.start'`).  Optional named variables are substituted
 * into the resulting string using the `{{varName}}` placeholder syntax.
 *
 * Falls back to the key itself when no translation is found.
 *
 * @example
 * ```ts
 * // Simple lookup
 * const { output } = core.events.emitSync('i18n/t', { key: 'menu.start' });
 * label.text = output.value; // "Start Game"
 *
 * // With variable substitution
 * const { output } = core.events.emitSync('i18n/t', {
 *   key: 'hud.gold',
 *   vars: { amount: String(player.gold) },
 * });
 * label.text = output.value; // "Gold: 250"  (template: "Gold: {{amount}}")
 * ```
 */
export interface I18nTParams {
  /** The translation key to look up (supports dot-notation for nested keys). */
  key: string;
  /**
   * Named variable substitutions applied to the resolved string.
   * Each `{{varName}}` placeholder in the value is replaced with the
   * corresponding entry in this map.
   */
  vars?: Record<string, string>;
}

/** Output for `i18n/t`. */
export interface I18nTOutput {
  /**
   * The translated string.
   * Falls back to the original `key` when no translation exists.
   */
  value: string;
  /** `true` when a translation entry was found for the given key. */
  found: boolean;
}

// ---------------------------------------------------------------------------
// i18n/interpolate
// ---------------------------------------------------------------------------

/**
 * Parameters for `i18n/interpolate`.
 *
 * Parses a free-form string and replaces all `{namespace:key}` tokens.
 * `LocalizationManager` registers a **`before`-phase** handler (with high
 * priority) that:
 *   1. Copies `params.text` into `output.result`.
 *   2. Populates `output.replace` with a convenience mutator function.
 *   3. Resolves all `{i18n:key}` tokens using the active locale.
 *
 * Other plugins can register their own **`before`-phase** handlers (at lower
 * priority, or on the **`main`** phase) and call `output.replace` to handle
 * their own token namespaces before the final string is consumed.
 *
 * @example
 * ```ts
 * // In a plugin that owns the "setting" namespace:
 * core.events.on('settings', 'i18n/interpolate', (params, output) => {
 *   output.replace('{setting:current-language}', settings.language);
 *   output.replace('{setting:volume}', String(settings.volume));
 * });
 *
 * // Caller:
 * const { output } = core.events.emitSync('i18n/interpolate', {
 *   text: 'Language: {setting:current-language} — {i18n:menu.start}',
 * });
 * console.log(output.result); // "Language: English — Start Game"
 * ```
 */
export interface I18nInterpolateParams {
  /** The raw string containing `{namespace:key}` tokens to replace. */
  text: string;
}

/** Output for `i18n/interpolate`. */
export interface I18nInterpolateOutput {
  /**
   * The string with all resolved tokens substituted.
   * Starts as a copy of `params.text` and is progressively updated by each
   * handler phase.
   */
  result: string;
  /**
   * Convenience mutator provided by `LocalizationManager` in the `before`
   * phase.  Replaces **all** occurrences of `token` in `output.result` with
   * `value`.
   *
   * @param token  The exact token string to replace (e.g. `'{setting:volume}'`).
   * @param value  The replacement string.
   */
  replace(token: string, value: string): void;
}

// ---------------------------------------------------------------------------
// i18n/lookup
// ---------------------------------------------------------------------------

/**
 * Parameters for `i18n/lookup`.
 *
 * Emitted **synchronously** by `LocalizationManager` during `i18n/interpolate`
 * for every `{key}` or `{key:value}` token found in the input string.
 * Other components register handlers for this event to resolve tokens that
 * belong to their own domain without having to parse the full string themselves.
 *
 * Token formats and the corresponding parameter values:
 * - `{key}`        → `params.key = key`,  `params.value = null`
 * - `{key:value}`  → `params.key = key`,  `params.value = value`
 *
 * `LocalizationManager` registers its own `before`-phase handler (priority
 * 1000) that resolves `{i18n:translationKey}` tokens using the active locale.
 *
 * @example
 * ```ts
 * // Resolve "{player:name}" and "{player:level}" tokens
 * core.events.on('playerPlugin', 'i18n/lookup', (params, output) => {
 *   if (params.key !== 'player') return;
 *   if (params.value === 'name')  { output.result = player.name;          return; }
 *   if (params.value === 'level') { output.result = String(player.level); return; }
 * });
 *
 * // Resolve bare "{score}" token (no colon — value is null)
 * core.events.on('hudPlugin', 'i18n/lookup', (params, output) => {
 *   if (params.key === 'score' && params.value === null) {
 *     output.result = String(hud.score);
 *   }
 * });
 *
 * // Use in an interpolated string
 * const { output } = core.events.emitSync('i18n/interpolate', {
 *   text: 'Player: {player:name} (Lv.{player:level}) — Score: {score}',
 * });
 * console.log(output.result); // "Player: Alice (Lv.5) — Score: 1200"
 * ```
 */
export interface I18nLookupParams {
  /** The token key (the part before `:`, or the full token if there is no `:`). */
  key: string;
  /**
   * The token value (the part after `:`), or `null` when the token has no
   * colon (i.e. the `{key}` format).
   */
  value: string | null;
}

/** Output for `i18n/lookup`. */
export interface I18nLookupOutput {
  /**
   * The resolved replacement string.
   * Set this to a non-null value to replace the token in the interpolated result.
   * Leave as `null` (the default) to keep the original token unchanged.
   */
  result: string | null;
}

// ---------------------------------------------------------------------------
// i18n/get-locales
// ---------------------------------------------------------------------------

/**
 * Parameters for `i18n/get-locales` (no parameters required).
 *
 * Synchronous query for all loaded locale identifiers and the currently active
 * one.
 *
 * @example
 * ```ts
 * const { output } = core.events.emitSync('i18n/get-locales', {});
 * console.log(output.available); // ['en', 'zh-TW', 'ja']
 * console.log(output.current);   // 'zh-TW'
 * ```
 */
export type I18nGetLocalesParams = Record<string, never>;

/** Output for `i18n/get-locales`. */
export interface I18nGetLocalesOutput {
  /** All locale identifiers that have been loaded. */
  available: string[];
  /** The currently active locale, or `null` if no locale has been set. */
  current: string | null;
}
