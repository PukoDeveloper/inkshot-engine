import { Assets } from 'pixi.js';
import type { Core } from '../../core/Core.js';
import type { EnginePlugin } from '../../types/plugin.js';
import type {
  AssetBundleDefinition,
  AssetsPreloadParams,
  AssetsPreloadOutput,
  AssetsLoadParams,
  AssetsLoadOutput,
  AssetsPrefetchParams,
  AssetsGetParams,
  AssetsGetOutput,
  AssetsUnloadParams,
  AssetsUnloadOutput,
  AssetsProgressParams,
  AssetsErrorParams,
} from '../../types/assets.js';

/**
 * Built-in plugin that manages game asset loading with transparent caching.
 *
 * Wraps the Pixi.js `Assets` API and exposes all loading modes through the
 * engine event bus, so plugins and game code never need to import Pixi
 * directly for asset management.
 *
 * ### Cache-first guarantee
 * Every loading path checks the Pixi `Assets` cache before issuing a network
 * request.  Calling any load event for an already-loaded asset returns
 * instantly without a duplicate fetch:
 * - `assets/preload` and `assets/load` delegate to `Assets.loadBundle()` /
 *   `Assets.load()`, both of which are cache-first by design.
 * - `assets/prefetch` skips the background download entirely if the asset or
 *   bundle is already in cache.
 * - `assets/get` is a pure synchronous cache lookup; it never fetches.
 *
 * ---
 *
 * ### Event contract
 *
 * | Event             | Async?     | Description |
 * |-------------------|------------|-------------|
 * | `assets/preload`  | ✓ async    | Register & load bundles before the game loop starts |
 * | `assets/load`     | ✓ async    | Cache-first load: single URL, named bundle, or inline definition |
 * | `assets/prefetch` | ✗ sync     | Fire-and-forget background download (skipped if cached) |
 * | `assets/get`      | ✗ sync     | Retrieve a cached asset — never triggers a fetch |
 * | `assets/unload`   | ✓ async    | Release assets from cache and GPU memory |
 * | `assets/progress` | — emitted  | Fires during load; subscribe to drive a progress bar |
 * | `assets/error`    | — emitted  | Fires on load failure; subscribe to handle retries |
 *
 * ---
 *
 * ### Usage
 *
 * ```ts
 * import { createEngine, ResourceManager } from 'inkshot-engine';
 *
 * const { core } = await createEngine({
 *   dataRoot: '/assets/',
 *   plugins: [
 *     new ResourceManager(),
 *     {
 *       namespace: 'myGame',
 *       async init(c) {
 *         // Preload — blocks before core.start() thanks to plugin init order
 *         await c.events.emit('assets/preload', {
 *           bundles: [{ name: 'ui', assets: { font: 'fonts/main.woff2' } }],
 *         });
 *
 *         // Background-prefetch the first scene while the main menu is shown
 *         c.events.emitSync('assets/prefetch', { bundle: 'scene:town' });
 *       },
 *     },
 *   ],
 * });
 *
 * // Eager / lazy load — cache-first, so subsequent calls are instant
 * await core.events.emit('assets/load', { bundle: 'scene:town' });
 *
 * // Synchronous cache get (after load completes)
 * const { output } = core.events.emitSync('assets/get', { key: 'tileset' });
 * if (output.cached) worldLayer.addChild(new Sprite(output.asset as Texture));
 *
 * // Release assets when leaving a scene
 * await core.events.emit('assets/unload', { bundle: 'scene:town' });
 * ```
 */
export class ResourceManager implements EnginePlugin {
  readonly namespace = 'assets';

  private _dataRoot = '/';

  /**
   * Bundle names that have been registered with `Assets.addBundle()`.
   * Re-registration is skipped; loading is always attempted (cache-first).
   */
  private readonly _registeredBundles = new Set<string>();

  // ---------------------------------------------------------------------------
  // EnginePlugin lifecycle
  // ---------------------------------------------------------------------------

  init(core: Core): void {
    this._dataRoot = core.dataRoot;
    const { events } = core;

    // ── assets/preload ────────────────────────────────────────────────────────

    events.on<AssetsPreloadParams, AssetsPreloadOutput>(
      this.namespace,
      'assets/preload',
      async (params, output) => {
        let loaded = 0;
        for (const def of params.bundles) {
          await this._loadBundle(core, def);
          loaded++;
        }
        output.loaded = loaded;
      },
    );

    // ── assets/load ───────────────────────────────────────────────────────────

    events.on<AssetsLoadParams, AssetsLoadOutput>(
      this.namespace,
      'assets/load',
      async (params, output) => {
        try {
          if (params.definition !== undefined) {
            // Inline definition: register (if new) then load.
            await this._loadBundle(core, params.definition);
            output.loaded = true;
          } else if (params.bundle !== undefined) {
            // Named bundle: must have been previously registered.
            this._assertBundleRegistered(params.bundle);
            await this._loadBundleByName(core, params.bundle);
            output.loaded = true;
          } else if (params.url !== undefined) {
            // Single asset: Pixi Assets.load() is cache-first.
            const resolved = this._resolve(params.url);
            output.asset = await Assets.load(resolved);
            // Emit a synthetic progress=1 so loading-screen listeners always
            // receive a completion signal for single-asset loads.
            events.emitSync<AssetsProgressParams>('assets/progress', {
              progress: 1,
              bundle: undefined,
            });
            output.loaded = true;
          } else {
            throw new Error(
              '[ResourceManager] assets/load requires one of: url, bundle, or definition.',
            );
          }
        } catch (err) {
          output.loaded = false;
          const source =
            params.bundle ?? params.url ?? params.definition?.name ?? 'unknown';
          // Emit error asynchronously so subscribers get the full context.
          await events.emit<AssetsErrorParams>('assets/error', {
            message: String(err),
            source,
            error: err,
          });
        }
      },
    );

    // ── assets/prefetch ───────────────────────────────────────────────────────

    events.on<AssetsPrefetchParams>(
      this.namespace,
      'assets/prefetch',
      (params) => {
        if (params.bundle !== undefined) {
          // Only start background load if the bundle has been registered;
          // silently ignore unknown bundle names.
          if (this._registeredBundles.has(params.bundle)) {
            Assets.backgroundLoadBundle(params.bundle);
          }
        } else if (params.url !== undefined) {
          const resolved = this._resolve(params.url);
          // Skip if already in cache — no need to schedule a background fetch.
          if (!Assets.cache.has(resolved)) {
            Assets.backgroundLoad(resolved);
          }
        }
      },
    );

    // ── assets/get ────────────────────────────────────────────────────────────

    events.on<AssetsGetParams, AssetsGetOutput>(
      this.namespace,
      'assets/get',
      (params, output) => {
        // Step 1: try the key exactly as given.
        //   - Matches bundle aliases (e.g. 'logo', 'tileset').
        //   - Matches absolute URLs registered directly.
        if (Assets.cache.has(params.key)) {
          output.asset = Assets.get(params.key);
          output.cached = true;
          return;
        }

        // Step 2: try the dataRoot-resolved path.
        //   - Matches relative file paths (e.g. 'sprites/hero.png').
        const resolved = this._resolve(params.key);
        if (resolved !== params.key && Assets.cache.has(resolved)) {
          output.asset = Assets.get(resolved);
          output.cached = true;
          return;
        }

        // Not in cache.
        output.asset = undefined;
        output.cached = false;
      },
    );

    // ── assets/unload ─────────────────────────────────────────────────────────

    events.on<AssetsUnloadParams, AssetsUnloadOutput>(
      this.namespace,
      'assets/unload',
      async (params, output) => {
        try {
          if (params.bundle !== undefined) {
            await Assets.unloadBundle(params.bundle);
            this._registeredBundles.delete(params.bundle);
            output.unloaded = true;
          } else if (params.url !== undefined) {
            await Assets.unload(this._resolve(params.url));
            output.unloaded = true;
          } else {
            output.unloaded = false;
          }
        } catch {
          output.unloaded = false;
        }
      },
    );
  }

  destroy(core: Core): void {
    core.events.removeNamespace(this.namespace);
    this._registeredBundles.clear();
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Resolve a path relative to `dataRoot`.
   *
   * Absolute URLs (`http://`, `https://`, `data:`, `blob:`) and paths that
   * already start with `/` are returned unchanged.  All other values are
   * prefixed with `dataRoot`.
   */
  private _resolve(url: string): string {
    if (/^(https?:|data:|blob:)\/\//i.test(url) || url.startsWith('/')) {
      return url;
    }
    const base = this._dataRoot.endsWith('/') ? this._dataRoot : `${this._dataRoot}/`;
    return `${base}${url}`;
  }

  /**
   * Register a bundle with Pixi (once) and load all its assets.
   *
   * Asset URLs within the definition are resolved against `dataRoot` before
   * being handed to Pixi, so callers always use relative paths.
   *
   * Cache-first: `Assets.loadBundle()` resolves each asset through
   * `Assets.load()` internally, which returns from cache immediately if the
   * asset is already loaded — no duplicate network requests are issued.
   */
  private async _loadBundle(core: Core, def: AssetBundleDefinition): Promise<void> {
    if (!this._registeredBundles.has(def.name)) {
      const resolvedAssets: Record<string, string> = {};
      for (const [alias, url] of Object.entries(def.assets)) {
        resolvedAssets[alias] = this._resolve(url);
      }
      Assets.addBundle(def.name, resolvedAssets);
      this._registeredBundles.add(def.name);
    }
    await this._loadBundleByName(core, def.name);
  }

  /**
   * Load an already-registered bundle by name, forwarding progress events to
   * the bus so loading-screen subscribers stay informed.
   *
   * A final `progress === 1` event is always emitted after the await, even
   * when all assets were already cached and Pixi completed the call instantly.
   */
  private async _loadBundleByName(core: Core, name: string): Promise<void> {
    await Assets.loadBundle(name, (progress: number) => {
      core.events.emitSync<AssetsProgressParams>('assets/progress', {
        progress,
        bundle: name,
      });
    });
    // Guarantee a completion signal regardless of whether the callback fired.
    core.events.emitSync<AssetsProgressParams>('assets/progress', {
      progress: 1,
      bundle: name,
    });
  }

  /**
   * Throw a descriptive error when a caller references a bundle that has not
   * yet been declared via `assets/preload` or `assets/load` with `definition`.
   */
  private _assertBundleRegistered(bundle: string): void {
    if (!this._registeredBundles.has(bundle)) {
      throw new Error(
        `[ResourceManager] Bundle "${bundle}" is not registered. ` +
          `Declare it first via 'assets/preload' or 'assets/load' with a definition.`,
      );
    }
  }
}
