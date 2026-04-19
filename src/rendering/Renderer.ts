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
 * ### Named layers
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
 * @example Direct access
 * ```ts
 * const uiLayer = renderer.getLayer('ui');
 * uiLayer.addChild(myPanel);
 * ```
 *
 * @example Via event bus (plugin-friendly)
 * ```ts
 * const { output } = core.events.emitSync('renderer/layer', { name: 'ui' });
 * output.layer.addChild(myPanel);
 * ```
 */
export class Renderer {
  private readonly _core: Core;
  private readonly _layers: Map<LayerName, Container>;

  constructor(core: Core) {
    this._core = core;

    // Build the named layers and add them to the stage in z-order.
    this._layers = new Map();
    this._core.app.stage.sortableChildren = true;

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
      (params: { name: LayerName }, output: { layer: Container }) => {
        output.layer = this.getLayer(params.name);
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
  // Layer helpers
  // ---------------------------------------------------------------------------

  /**
   * Return the named render layer container.
   *
   * @param name  One of `'world'`, `'fx'`, `'ui'`, or `'system'`.
   * @throws If an unknown layer name is provided.
   *
   * @example
   * ```ts
   * renderer.getLayer('ui').addChild(myHUD);
   * ```
   */
  getLayer(name: LayerName): Container {
    const layer = this._layers.get(name);
    if (!layer) {
      throw new Error(`[Renderer] Unknown layer: "${name}".`);
    }
    return layer;
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
