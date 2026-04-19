/**
 * The pre-defined render layers that Inkshot Engine creates on the stage.
 *
 * Layers are stacked in ascending z-order:
 *
 * | Name       | Z-Index | Purpose                                          |
 * |------------|---------|--------------------------------------------------|
 * | `world`    |       0 | Game world, map tiles, entities, characters      |
 * | `fx`       |     100 | Visual effects and particle systems              |
 * | `ui`       |     200 | HUD, menus, and all plugin-provided UI           |
 * | `system`   |     300 | Full-screen overlays: loading, transitions, etc. |
 *
 * Obtain a layer via the renderer directly:
 * ```ts
 * const uiLayer = renderer.getLayer('ui');
 * uiLayer.addChild(myPanel);
 * ```
 *
 * Or via the event bus (plugin-friendly):
 * ```ts
 * core.events.on('myPlugin', 'renderer/layer', (params, output) => {
 *   output.layer = // resolved inside Renderer
 * });
 * // actually emit to get the layer:
 * const { output } = core.events.emitSync('renderer/layer', { name: 'ui' });
 * output.layer.addChild(myPanel);
 * ```
 */
export type LayerName = 'world' | 'fx' | 'ui' | 'system';

/**
 * The z-index assigned to each named layer on the Pixi stage.
 * Higher values are rendered on top.
 */
export const LAYER_Z_INDEX: Readonly<Record<LayerName, number>> = {
  world: 0,
  fx: 100,
  ui: 200,
  system: 300,
};
