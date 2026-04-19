import { Container } from 'pixi.js';
import type { Application } from 'pixi.js';
import type { Core } from '../core/Core.js';
import { type LayerName, LAYER_Z_INDEX } from './layers.js';

/**
 * Thin wrapper around the Pixi.js stage, providing named render layers and
 * helpers for display-object placement.
 *
 * `Renderer` is created by `createEngine` and registered with `Core` via the
 * event bus.  It does NOT construct the Pixi Application itself — that
 * responsibility belongs to `Core`.
 *
 * ### Built-in layers
 * On construction, `Renderer` creates four pre-sorted child containers on the
 * stage.  Retrieve them with {@link getLayer} or via the `renderer/layer`
 * event:
 *
 * | Layer    | Z-Index | Typical use                                  |
 * |----------|---------|----------------------------------------------|
 * | `world`  |       0 | Map tiles, entities, characters              |
 * | `fx`     |     100 | Particle effects, screen-space VFX           |
 * | `ui`     |     200 | HUD, menus, all plugin-provided UI           |
 * | `system` |     300 | Full-screen overlays, loading, transitions   |
 *
 * ### Custom layers
 * Create a new layer at any z-index with {@link createLayer}.  Layers are
 * sorted on the stage automatically.  Layers with the same z-index are drawn
 * in creation order.
 *
 * @example Direct access
 * ```ts
 * const uiLayer = renderer.getLayer('ui');
 * uiLayer.addChild(myPanel);
 * ```
 *
 * @example Create a custom layer
 * ```ts
 * renderer.createLayer('minimap', 250);
 * renderer.getLayer('minimap').addChild(minimapSprite);
 * ```
 *
 * @example Via event bus (plugin-friendly)
 * ```ts
 * // Get an existing layer
 * const { output } = core.events.emitSync('renderer/layer', { name: 'ui' });
 * output.layer.addChild(myPanel);
 *
 * // Create and get a new layer
 * const { output: out } = core.events.emitSync('renderer/layer:create', { name: 'minimap', zIndex: 250 });
 * out.layer.addChild(minimapSprite);
 * ```
 */
export class Renderer {
  private readonly _core: Core;
  /** All layers keyed by name (built-in and custom). */
  private readonly _layers: Map<string, Container>;

  constructor(core: Core) {
    this._core = core;

    // Stage must have sortableChildren enabled for z-index ordering.
    this._core.app.stage.sortableChildren = true;

    // Build the built-in named layers and add them to the stage in z-order.
    this._layers = new Map();
    for (const name of Object.keys(LAYER_Z_INDEX) as LayerName[]) {
      const layer = new Container();
      layer.label = `layer:${name}`;
      layer.zIndex = LAYER_Z_INDEX[name];
      this._core.app.stage.addChild(layer);
      this._layers.set(name, layer);
    }

    // Listen for the engine tick to synchronize render if needed.
    core.events.on('renderer', 'core/tick', this._onTick, { priority: -100 });

    // Expose layer lookup via the event bus so plugins never need a direct
    // reference to the Renderer instance.
    core.events.on(
      'renderer',
      'renderer/layer',
      (params: { name: string }, output: { layer: Container }) => {
        output.layer = this.getLayer(params.name);
      },
    );

    // Expose layer creation via the event bus.
    core.events.on(
      'renderer',
      'renderer/layer:create',
      (params: { name: string; zIndex: number }, output: { layer: Container }) => {
        output.layer = this.createLayer(params.name, params.zIndex);
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  /** The Pixi.js stage (root container). */
  get stage(): Container {
    return this._core.app.stage;
  }

  /** The Pixi.js Application. */
  get app(): Application {
    return this._core.app;
  }

  // ---------------------------------------------------------------------------
  // Layer management
  // ---------------------------------------------------------------------------

  /**
   * Return an existing layer container by name.
   *
   * Works for both built-in layers (`'world'`, `'fx'`, `'ui'`, `'system'`) and
   * any custom layer previously registered with {@link createLayer}.
   *
   * @param name  Layer name.
   * @throws If no layer with this name exists.
   *
   * @example
   * ```ts
   * renderer.getLayer('ui').addChild(myHUD);
   * ```
   */
  getLayer(name: string): Container {
    const layer = this._layers.get(name);
    if (!layer) {
      throw new Error(
        `[Renderer] Unknown layer: "${name}". ` +
        `Create it first with renderer.createLayer("${name}", zIndex).`,
      );
    }
    return layer;
  }

  /**
   * Create a new named layer at the given z-index and attach it to the stage.
   *
   * Layers with a higher `zIndex` are drawn on top of layers with a lower one.
   * Multiple layers may share the same `zIndex`; in that case they are drawn
   * in creation order.
   *
   * @param name    Unique layer identifier.
   * @param zIndex  Z-index used for stage-level sorting.
   * @returns       The newly created `Container`.
   * @throws        If a layer with the same name already exists.
   *
   * @example
   * ```ts
   * renderer.createLayer('minimap', 250);
   * renderer.getLayer('minimap').addChild(minimapSprite);
   * ```
   */
  createLayer(name: string, zIndex: number): Container {
    if (this._layers.has(name)) {
      throw new Error(
        `[Renderer] Layer "${name}" already exists. ` +
        `Use renderer.getLayer("${name}") to retrieve it.`,
      );
    }

    const layer = new Container();
    layer.label = `layer:${name}`;
    layer.zIndex = zIndex;
    this._core.app.stage.addChild(layer);
    this._layers.set(name, layer);

    return layer;
  }

  /**
   * Return `true` if a layer with the given name exists (built-in or custom).
   *
   * @example
   * ```ts
   * if (!renderer.hasLayer('minimap')) {
   *   renderer.createLayer('minimap', 250);
   * }
   * ```
   */
  hasLayer(name: string): boolean {
    return this._layers.has(name);
  }

  /**
   * Remove a layer from the stage and the internal registry.
   *
   * All children of the layer are **destroyed** (Pixi's default destroy
   * behaviour).  Built-in layers (`'world'`, `'fx'`, `'ui'`, `'system'`) can
   * also be removed, but doing so is discouraged unless you are replacing them.
   *
   * @param name  Layer name.
   * @throws If no layer with this name exists.
   */
  removeLayer(name: string): void {
    const layer = this._layers.get(name);
    if (!layer) {
      throw new Error(`[Renderer] Cannot remove unknown layer: "${name}".`);
    }
    this._core.app.stage.removeChild(layer);
    layer.destroy({ children: true });
    this._layers.delete(name);
  }

  /**
   * Add a display object directly to the stage at an optional z-index.
   * Prefer {@link getLayer} for structured placement within named layers.
   *
   * If `zIndex` is provided the stage's `sortableChildren` is enabled
   * automatically.
   */
  addToStage(child: Container, zIndex?: number): void {
    if (zIndex !== undefined) {
      this.stage.sortableChildren = true;
      child.zIndex = zIndex;
    }
    this.stage.addChild(child);
  }

  /** Remove a display object from the stage. */
  removeFromStage(child: Container): void {
    this.stage.removeChild(child);
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /** Unregister all renderer listeners from the event bus. */
  destroy(): void {
    this._core.events.removeNamespace('renderer');
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private readonly _onTick = (_params: { delta: number; elapsed: number }): void => {
    // Future: per-frame render hooks can be emitted here
  };
}
