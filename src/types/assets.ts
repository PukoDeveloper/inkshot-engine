/**
 * A map of asset aliases to their source URLs/paths.
 *
 * Keys become the aliases used to retrieve assets via `assets/get`.
 * Values are file paths resolved relative to `dataRoot`.
 *
 * @example
 * ```ts
 * const assets: AssetRecord = {
 *   logo:    'images/logo.png',
 *   bgm:     'audio/intro.ogg',
 *   tileset: 'sprites/town.json',
 * };
 * ```
 */
export type AssetRecord = Record<string, string>;

/**
 * A named group of assets that can be loaded and unloaded as a unit.
 *
 * Bundles enable scene-scoped asset management: load everything a scene needs
 * on entry and release the whole group on exit.
 *
 * @example
 * ```ts
 * const introBundle: AssetBundleDefinition = {
 *   name:   'scene:intro',
 *   assets: { logo: 'images/logo.png', bgm: 'audio/intro.ogg' },
 * };
 * ```
 */
export interface AssetBundleDefinition {
  /** Unique bundle identifier (e.g. `'scene:intro'`, `'ui:hud'`). */
  name: string;
  /** The assets belonging to this bundle, keyed by alias. */
  assets: AssetRecord;
}

// ---------------------------------------------------------------------------
// assets/preload
// ---------------------------------------------------------------------------

/**
 * Parameters for `assets/preload`.
 *
 * Registers and fully loads every provided bundle before the game loop
 * starts.  Because `createEngine` awaits each plugin's `init()`, emitting
 * this event inside another plugin's `init()` guarantees all assets are
 * available prior to `core.start()`.
 *
 * Assets already in the Pixi cache are skipped — no duplicate fetch occurs.
 *
 * @example
 * ```ts
 * await core.events.emit('assets/preload', {
 *   bundles: [
 *     { name: 'ui',         assets: { font: 'fonts/main.woff2' } },
 *     { name: 'scene:intro', assets: { logo: 'images/logo.png' } },
 *   ],
 * });
 * ```
 */
export interface AssetsPreloadParams {
  /** Bundles to register and fully load. */
  bundles: AssetBundleDefinition[];
}

/** Output for `assets/preload`. */
export interface AssetsPreloadOutput {
  /** Number of bundles successfully loaded. */
  loaded: number;
}

// ---------------------------------------------------------------------------
// assets/load
// ---------------------------------------------------------------------------

/**
 * Parameters for `assets/load`.
 *
 * Cache-first async load.  If the requested asset or bundle is already cached
 * the call returns instantly without re-fetching.
 *
 * Exactly **one** of `url`, `bundle`, or `definition` must be provided.
 *
 * @example
 * ```ts
 * // Single asset
 * const { output } = await core.events.emit<AssetsLoadParams, AssetsLoadOutput>(
 *   'assets/load', { url: 'sprites/hero.png' },
 * );
 * const texture = output.asset as Texture;
 *
 * // Named bundle (must have been registered via assets/preload or assets/load)
 * await core.events.emit('assets/load', { bundle: 'scene:town' });
 *
 * // Inline definition (register + load in one call)
 * await core.events.emit('assets/load', {
 *   definition: { name: 'scene:forest', assets: { tileset: 'forest.json' } },
 * });
 * ```
 */
export interface AssetsLoadParams {
  /**
   * URL or path of a single asset to load.
   * Resolved relative to `dataRoot` unless the path is absolute.
   */
  url?: string;

  /**
   * Name of a bundle previously declared via `assets/preload` or
   * `assets/load` with `definition`.
   */
  bundle?: string;

  /**
   * Inline bundle definition: registers the bundle if not already registered
   * and then loads all its assets.
   */
  definition?: AssetBundleDefinition;
}

/** Output for `assets/load`. */
export interface AssetsLoadOutput {
  /** `true` when loading completed without error. */
  loaded: boolean;
  /**
   * The loaded asset.  Only populated when loading a single `url`.
   * `undefined` for bundle loads — use `assets/get` to retrieve
   * individual assets by alias after a bundle load.
   */
  asset: unknown;
}

// ---------------------------------------------------------------------------
// assets/prefetch
// ---------------------------------------------------------------------------

/**
 * Parameters for `assets/prefetch`.
 *
 * Starts a **non-blocking** background download.  The game loop is never
 * paused and the event resolves immediately (fire-and-forget).
 * Assets already in cache are silently skipped.
 *
 * Exactly **one** of `url` or `bundle` must be provided.
 *
 * @example
 * ```ts
 * // While the player is in scene:intro, silently pre-download scene:town
 * core.events.emitSync('assets/prefetch', { bundle: 'scene:town' });
 * ```
 */
export interface AssetsPrefetchParams {
  /**
   * URL or path of a single asset to fetch in the background.
   * Resolved relative to `dataRoot` unless the path is absolute.
   */
  url?: string;

  /** Name of a previously-registered bundle to prefetch in the background. */
  bundle?: string;
}

// ---------------------------------------------------------------------------
// assets/get
// ---------------------------------------------------------------------------

/**
 * Parameters for `assets/get`.
 *
 * Synchronous cache lookup (`emitSync`).  Never triggers a network request.
 * Returns `undefined` when the asset has not yet been loaded.
 *
 * @example
 * ```ts
 * const { output } = core.events.emitSync<AssetsGetParams, AssetsGetOutput>(
 *   'assets/get', { key: 'logo' },
 * );
 * if (output.cached) sprite.texture = output.asset as Texture;
 * ```
 */
export interface AssetsGetParams {
  /**
   * Alias or URL of the asset to retrieve from cache.
   * Bundle aliases (e.g. `'logo'`) are checked before resolving as a path.
   */
  key: string;
}

/** Output for `assets/get`. */
export interface AssetsGetOutput {
  /** The cached asset, or `undefined` if not yet loaded. */
  asset: unknown;
  /** `true` when the asset was found in cache. */
  cached: boolean;
}

// ---------------------------------------------------------------------------
// assets/unload
// ---------------------------------------------------------------------------

/**
 * Parameters for `assets/unload`.
 *
 * Releases assets from the Pixi cache and frees associated GPU/memory.
 * Useful at scene transitions to reclaim VRAM.
 *
 * Exactly **one** of `url` or `bundle` must be provided.
 *
 * @example
 * ```ts
 * // On leaving the intro scene
 * await core.events.emit('assets/unload', { bundle: 'scene:intro' });
 * ```
 */
export interface AssetsUnloadParams {
  /**
   * URL or path of a single asset to unload.
   * Resolved relative to `dataRoot` unless the path is absolute.
   */
  url?: string;

  /** Name of a bundle to unload (releases every asset in the bundle). */
  bundle?: string;
}

/** Output for `assets/unload`. */
export interface AssetsUnloadOutput {
  /** `true` when the unload completed without error. */
  unloaded: boolean;
}

// ---------------------------------------------------------------------------
// assets/progress
// ---------------------------------------------------------------------------

/**
 * Parameters for `assets/progress`.
 *
 * Emitted (`emitSync`) by `ResourceManager` while `assets/load` and
 * `assets/preload` are running.  Subscribe to this event to drive a
 * loading-screen progress bar.
 *
 * At least one event with `progress === 1` is always fired when loading
 * finishes, even when all assets were already cached.
 *
 * @example
 * ```ts
 * core.events.on('loadingScreen', 'assets/progress', (params) => {
 *   progressBar.fill = params.progress;
 * });
 * ```
 */
export interface AssetsProgressParams {
  /** Loading progress from `0` (not started) to `1` (all assets complete). */
  progress: number;
  /**
   * Name of the bundle being loaded.
   * `undefined` when loading a single asset by URL.
   */
  bundle: string | undefined;
}

// ---------------------------------------------------------------------------
// assets/error
// ---------------------------------------------------------------------------

/**
 * Parameters for `assets/error`.
 *
 * Emitted when any load operation fails.  Subscribers can implement retry
 * logic, show an error screen, or fall back to a placeholder asset.
 *
 * @example
 * ```ts
 * core.events.on('errorHandler', 'assets/error', (params) => {
 *   console.error(`Failed to load "${params.source}": ${params.message}`);
 * });
 * ```
 */
export interface AssetsErrorParams {
  /** Human-readable description of the failure. */
  message: string;
  /** The URL or bundle name that caused the failure. */
  source: string;
  /** The original error thrown by the underlying loader, if available. */
  error: unknown;
}
