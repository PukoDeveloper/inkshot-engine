import type { Core } from '../../core/Core.js';
import type { EnginePlugin } from '../../types/plugin.js';
import type {
  LocaleData,
  I18nLoadParams,
  I18nLoadOutput,
  I18nSetLocaleParams,
  I18nSetLocaleOutput,
  I18nChangedParams,
  I18nTParams,
  I18nTOutput,
  I18nInterpolateParams,
  I18nInterpolateOutput,
  I18nLookupParams,
  I18nLookupOutput,
  I18nGetLocalesParams,
  I18nGetLocalesOutput,
} from '../../types/i18n.js';

/**
 * Built-in plugin that provides a full localisation (i18n) system.
 *
 * ### Overview
 *
 * `LocalizationManager` loads JSON translation files, manages the active
 * locale, and exposes translation lookup and string-interpolation capabilities
 * entirely through the engine event bus.
 *
 * ### Translation files
 *
 * Locale files are plain JSON objects.  Both flat and nested structures are
 * accepted; nested keys are always accessed using dot-notation:
 *
 * ```json
 * {
 *   "menu": {
 *     "start": "Start Game",
 *     "quit":  "Quit"
 *   },
 *   "hud.gold": "Gold: {{amount}}"
 * }
 * ```
 *
 * Accessing `"menu.start"` returns `"Start Game"` in either case.
 *
 * ### Variable substitution
 *
 * Use `{{varName}}` placeholders in translation strings and pass `vars` to
 * `i18n/t` to fill them in at runtime:
 *
 * ```ts
 * core.events.emitSync('i18n/t', { key: 'hud.gold', vars: { amount: '250' } });
 * // → "Gold: 250"
 * ```
 *
 * ### Token interpolation
 *
 * The `i18n/interpolate` event processes free-form strings containing
 * `{namespace:key}` tokens.  `LocalizationManager` handles `{i18n:key}`
 * tokens in the **`before`** phase.  Other plugins can register handlers on
 * the **`before`** (lower priority) or **`main`** phase to process their own
 * token namespaces using the provided `output.replace` helper:
 *
 * ```ts
 * core.events.on('settings', 'i18n/interpolate', (_params, output) => {
 *   output.replace('{setting:current-language}', settings.currentLanguage);
 * });
 * ```
 *
 * ### Event contract
 *
 * | Event               | Async? | Description |
 * |---------------------|--------|-------------|
 * | `i18n/load`         | ✓      | Load / merge a locale from a URL or inline data |
 * | `i18n/set-locale`   | ✓      | Switch the active locale (emits `i18n/changed`) |
 * | `i18n/changed`      | —      | Emitted after locale switches; subscribe to refresh UI |
 * | `i18n/t`            | ✗      | Synchronous translation key lookup with variable substitution |
 * | `i18n/interpolate`  | ✗      | Replace `{namespace:key}` tokens in a free-form string |
 * | `i18n/lookup`       | ✗      | Per-token lookup; register a handler to resolve your own `{key:value}` tokens |
 * | `i18n/get-locales`  | ✗      | Query all loaded locales and the currently active one |
 *
 * ### Usage
 *
 * ```ts
 * import { createEngine, LocalizationManager } from 'inkshot-engine';
 *
 * const { core } = await createEngine({
 *   dataRoot: '/assets/',
 *   plugins: [
 *     new LocalizationManager(),
 *     {
 *       namespace: 'myGame',
 *       async init(c) {
 *         await c.events.emit('i18n/load', { locale: 'en', url: 'i18n/en.json' });
 *         await c.events.emit('i18n/set-locale', { locale: 'en' });
 *       },
 *     },
 *   ],
 * });
 *
 * // Translate a key
 * const { output } = core.events.emitSync('i18n/t', { key: 'menu.start' });
 * label.text = output.value;
 *
 * // Interpolate a mixed string
 * const { output: o } = core.events.emitSync('i18n/interpolate', {
 *   text: 'Welcome! {i18n:menu.start}',
 * });
 * console.log(o.result);
 * ```
 */
export class LocalizationManager implements EnginePlugin {
  readonly namespace = 'i18n';
  readonly editorMeta = {
    displayName: 'Localization Manager',
    icon: 'i18n',
    description: 'Loads locale catalogues and provides runtime translation utilities.',
    events: [
      'i18n/load', 'i18n/set-locale', 'i18n/t',
      'i18n/lookup', 'i18n/interpolate', 'i18n/get-locales',
    ] as const,
    schemas: {
      i18n: {
        folder: 'i18n',
        displayName: 'Locale Catalogue',
      },
    },
  };

  /** Map of locale id → flattened key→value dictionary. */
  private readonly _catalogues = new Map<string, Map<string, string>>();

  /** Currently active locale identifier, or `null` when none has been set. */
  private _currentLocale: string | null = null;

  /** dataRoot resolved from Core during init(). */
  private _dataRoot = '/';

  // ---------------------------------------------------------------------------
  // EnginePlugin lifecycle
  // ---------------------------------------------------------------------------

  init(core: Core): void {
    this._dataRoot = core.dataRoot;
    const { events } = core;

    // ── i18n/load ──────────────────────────────────────────────────────────

    events.on<I18nLoadParams, I18nLoadOutput>(
      this.namespace,
      'i18n/load',
      async (params, output) => {
        try {
          let raw: LocaleData;

          if (params.data !== undefined) {
            raw = params.data;
          } else if (params.url !== undefined) {
            const url = this._resolve(params.url);
            const response = await fetch(url);
            if (!response.ok) {
              throw new Error(
                `[LocalizationManager] Failed to fetch locale file "${url}": ${response.status} ${response.statusText}`,
              );
            }
            raw = (await response.json()) as LocaleData;
          } else {
            throw new Error(
              '[LocalizationManager] i18n/load requires either "url" or "data".',
            );
          }

          const flat = this._flatten(raw);
          const existing = this._catalogues.get(params.locale) ?? new Map<string, string>();
          for (const [k, v] of flat) {
            existing.set(k, v);
          }
          this._catalogues.set(params.locale, existing);

          output.loaded = true;
          output.locale = params.locale;
        } catch (err) {
          output.loaded = false;
          output.locale = params.locale;
          console.error(err);
        }
      },
    );

    // ── i18n/set-locale ────────────────────────────────────────────────────

    events.on<I18nSetLocaleParams, I18nSetLocaleOutput>(
      this.namespace,
      'i18n/set-locale',
      async (params, output) => {
        if (!this._catalogues.has(params.locale)) {
          throw new Error(
            `[LocalizationManager] Locale "${params.locale}" has not been loaded. ` +
            `Call 'i18n/load' first.`,
          );
        }

        const previous = this._currentLocale;
        this._currentLocale = params.locale;

        output.previous = previous;
        output.current = params.locale;

        await events.emit<I18nChangedParams>('i18n/changed', {
          locale: params.locale,
          previous,
        });
      },
    );

    // ── i18n/t ─────────────────────────────────────────────────────────────

    events.on<I18nTParams, I18nTOutput>(
      this.namespace,
      'i18n/t',
      (params, output) => {
        const catalogue = this._currentLocale !== null
          ? (this._catalogues.get(this._currentLocale) ?? null)
          : null;

        const raw = catalogue?.get(params.key) ?? null;

        if (raw === null) {
          output.value = params.key;
          output.found = false;
          return;
        }

        output.value = params.vars !== undefined
          ? this._applyVars(raw, params.vars)
          : raw;
        output.found = true;
      },
    );

    // ── i18n/lookup (before phase) ─────────────────────────────────────────
    // Handles {i18n:translationKey} tokens — resolves the value part as a
    // translation key against the active locale catalogue.

    events.on<I18nLookupParams, I18nLookupOutput>(
      this.namespace,
      'i18n/lookup',
      (params, output) => {
        if (params.key !== 'i18n' || params.value === null) return;
        const catalogue = this._currentLocale !== null
          ? (this._catalogues.get(this._currentLocale) ?? null)
          : null;
        const found = catalogue?.get(params.value) ?? null;
        if (found !== null) {
          output.result = found;
        }
      },
      { phase: 'before', priority: 1000 },
    );

    // ── i18n/interpolate (before phase) ────────────────────────────────────
    // Register in the *before* phase with high priority so that:
    //   1. `output.result` and `output.replace` are available to any
    //      other before-phase handlers (at lower priority) and all
    //      main-phase handlers.
    //   2. All {key} / {key:value} tokens are resolved (via i18n/lookup)
    //      before any downstream handler runs.

    events.on<I18nInterpolateParams, I18nInterpolateOutput>(
      this.namespace,
      'i18n/interpolate',
      (params, output) => {
        // Initialise the mutable result and the replace helper.
        output.result = params.text;
        output.replace = (token: string, value: string): void => {
          output.result = output.result.split(token).join(value);
        };

        // Resolve all {key} and {key:value} tokens by dispatching a
        // synchronous i18n/lookup event for each one.
        output.result = output.result.replace(
          /\{([^{}:]+)(?::([^{}]*))?\}/g,
          (match, key: string, value: string | undefined) => {
            const { output: lookupOutput } = events.emitSync<I18nLookupParams, I18nLookupOutput>(
              'i18n/lookup',
              { key, value: value ?? null },
              { result: null },
            );
            return lookupOutput.result ?? match;
          },
        );
      },
      { phase: 'before', priority: 1000 },
    );

    // ── i18n/get-locales ───────────────────────────────────────────────────

    events.on<I18nGetLocalesParams, I18nGetLocalesOutput>(
      this.namespace,
      'i18n/get-locales',
      (_params, output) => {
        output.available = Array.from(this._catalogues.keys());
        output.current = this._currentLocale;
      },
    );
  }

  destroy(core: Core): void {
    core.events.removeNamespace(this.namespace);
    this._catalogues.clear();
    this._currentLocale = null;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Resolve a path relative to `dataRoot`.
   *
   * Absolute URLs (`http://`, `https://`, `data:`, `blob:`) and root-anchored
   * paths (`/…`) are returned unchanged.
   */
  private _resolve(url: string): string {
    if (/^(https?:|data:|blob:)\/\//i.test(url) || url.startsWith('/')) {
      return url;
    }
    const base = this._dataRoot.endsWith('/') ? this._dataRoot : `${this._dataRoot}/`;
    return `${base}${url}`;
  }

  /**
   * Flatten a (potentially nested) `LocaleData` object into a `Map<string, string>`
   * using dot-notation for nested keys.
   *
   * @example
   * Input:  `{ menu: { start: 'Start Game' }, 'hud.gold': 'Gold' }`
   * Output: `Map { 'menu.start' → 'Start Game', 'hud.gold' → 'Gold' }`
   */
  private _flatten(
    data: LocaleData,
    prefix = '',
    result = new Map<string, string>(),
  ): Map<string, string> {
    for (const [rawKey, value] of Object.entries(data)) {
      const key = prefix ? `${prefix}.${rawKey}` : rawKey;
      if (typeof value === 'string') {
        result.set(key, value);
      } else {
        // value is a nested object — recurse one level (or two for the union type)
        this._flatten(value as LocaleData, key, result);
      }
    }
    return result;
  }

  /**
   * Replace all `{{varName}}` placeholders in `template` with the
   * corresponding entries in `vars`.  Unknown placeholders are left as-is.
   */
  private _applyVars(template: string, vars: Record<string, string>): string {
    return template.replace(/\{\{([^}]+)\}\}/g, (_match, name: string) => {
      return name in vars ? vars[name] as string : _match;
    });
  }
}
