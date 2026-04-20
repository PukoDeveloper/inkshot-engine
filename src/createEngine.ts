import { Core } from './core/Core.js';
import type { CoreOptions } from './core/Core.js';
import { Renderer } from './rendering/Renderer.js';
import type { EnginePlugin, PluginSource } from './types/plugin.js';
export { sortPluginsByDependency } from './core/sortPlugins.js';
import { sortPluginsByDependency } from './core/sortPlugins.js';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Full set of options accepted by {@link createEngine}.
 *
 * Extends {@link CoreOptions} with higher-level concerns such as the data-asset
 * root and the plugin list.
 */
export interface EngineOptions extends CoreOptions {
  /**
   * Root URL / path prefix for all game data assets (images, audio, JSON data
   * files, etc.).
   *
   * Asset-loading systems should resolve file paths relative to this base.
   * Defaults to `'/'`.
   *
   * @example
   * ```ts
   * createEngine({ dataRoot: '/assets/game/' });
   * ```
   */
  dataRoot?: string;

  /**
   * Plugins to load and initialise before the game loop starts.
   *
   * Each entry may be:
   * - An {@link EnginePlugin} object.
   * - A **URL string** to a remote ES module whose `default` export is an
   *   `EnginePlugin`.
   *
   * Plugins are initialised in the order they appear in the array.
   *
   * @example
   * ```ts
   * import { audioPlugin } from './plugins/audio.js';
   *
   * createEngine({
   *   plugins: [
   *     audioPlugin,
   *     'https://cdn.example.com/extra-plugin.js',
   *   ],
   * });
   * ```
   */
  plugins?: PluginSource[];

  /**
   * When `true`, the engine game loop will start automatically after all
   * plugins have been initialised.  Defaults to `true`.
   *
   * Set to `false` if you want to control the exact moment the loop begins
   * (call `core.start()` manually).
   */
  autoStart?: boolean;
}

/**
 * The object returned by {@link createEngine}.
 *
 * All engine sub-systems are accessible from here.  The recommended pattern is
 * to destructure only what each module needs and communicate with other systems
 * exclusively through `core.events`.
 */
export interface EngineInstance {
  /** The central engine core. Owns the event bus and the Pixi application. */
  core: Core;
  /** Thin stage/layer wrapper around the Pixi.js application. */
  renderer: Renderer;
  /**
   * The list of successfully loaded and initialized plugins, in init order.
   * `createEngine` automatically calls each plugin's `destroy()` (in reverse
   * order) when `core.destroy()` is invoked.
   */
  plugins: EnginePlugin[];
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * **Out-of-the-box engine startup function.**
 *
 * Creates, initializes, and (optionally) starts the Inkshot Engine in a single
 * call.  This is the primary public entry point for consuming applications.
 *
 * ### Minimal usage
 * ```ts
 * import { createEngine } from 'inkshot-engine';
 *
 * const { core, renderer } = await createEngine({
 *   container: '#app',
 *   width: 1280,
 *   height: 720,
 * });
 * ```
 *
 * ### With plugins and data root
 * ```ts
 * import { createEngine } from 'inkshot-engine';
 * import { audioPlugin } from './plugins/audio.js';
 *
 * const { core, renderer, plugins } = await createEngine({
 *   container: document.getElementById('game-canvas')!,
 *   dataRoot: '/assets/',
 *   plugins: [audioPlugin, 'https://cdn.example.com/my-plugin.js'],
 * });
 * ```
 *
 * @param options  Configuration for the engine, renderer and plugins.
 * @returns        A promise that resolves to the initialized {@link EngineInstance}.
 */
export async function createEngine(options: EngineOptions = {}): Promise<EngineInstance> {
  const { plugins: pluginSources = [], autoStart = true, ...coreOptions } = options;

  // ── 1. Initialize core (creates Pixi app, mounts canvas) ──────────────────
  const core = new Core();
  await core.init(coreOptions);

  // ── 2. Create renderer ────────────────────────────────────────────────────
  const renderer = new Renderer(core);

  // ── 3. Load & initialize plugins ─────────────────────────────────────────
  const loadedPlugins: EnginePlugin[] = [];

  // First resolve every source (dynamic import for URL entries) so we can
  // inspect `dependencies` declarations before starting any init() call.
  const resolved: EnginePlugin[] = [];
  for (const source of pluginSources) {
    resolved.push(await resolvePlugin(source));
  }

  // Sort by declared dependencies (topological) so init order is correct
  // regardless of the order the caller supplied plugins.
  const ordered = sortPluginsByDependency(resolved);

  for (const plugin of ordered) {
    await plugin.init(core);
    loadedPlugins.push(plugin);
  }

  // ── 4. Wire plugin teardown to the engine destroy lifecycle ───────────────
  // When core.destroy() is called, automatically call destroy() on each plugin
  // (in reverse initialization order) so plugins can clean up their resources.
  core.events.on('createEngine', 'core/destroy', async () => {
    for (let i = loadedPlugins.length - 1; i >= 0; i--) {
      await loadedPlugins[i].destroy?.(core);
    }
    renderer.destroy();
  });

  // ── 5. Start the game loop (unless opted out) ─────────────────────────────
  if (autoStart) {
    core.start();
  }

  return { core, renderer, plugins: loadedPlugins };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a {@link PluginSource} to a concrete {@link EnginePlugin}.
 *
 * String sources are treated as ES module URLs; the module is expected to
 * export a default value that satisfies the `EnginePlugin` interface.
 */
async function resolvePlugin(source: PluginSource): Promise<EnginePlugin> {
  if (typeof source !== 'string') {
    return source;
  }

  // Dynamic import of a remote / local ES module
  const mod = await import(/* @vite-ignore */ source) as Record<string, unknown>;
  const plugin = (mod.default ?? mod) as EnginePlugin;

  if (typeof plugin?.init !== 'function') {
    throw new Error(
      `[createEngine] Plugin loaded from "${source}" does not export a valid EnginePlugin ` +
      `(missing \`init\` method).`,
    );
  }

  return plugin;
}
