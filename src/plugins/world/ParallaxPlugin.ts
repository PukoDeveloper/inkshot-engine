import { Container } from 'pixi.js';
import type { Core } from '../../core/Core.js';
import type { EnginePlugin } from '../../types/plugin.js';
import type { RendererPreRenderParams } from '../../types/rendering.js';
import type {
  ParallaxLayerAddOutput,
  ParallaxLayerAddParams,
  ParallaxLayerDef,
  ParallaxLayerGetOutput,
  ParallaxLayerGetParams,
  ParallaxLayerRemoveParams,
  ParallaxLayerUpdateParams,
  ParallaxLayersOutput,
  ParallaxPluginOptions,
} from '../../types/parallax.js';

// ---------------------------------------------------------------------------
// Minimal structural interface
// ---------------------------------------------------------------------------

/**
 * Minimal interface that a parallax host container must satisfy.
 *
 * In production this is fulfilled by a Pixi.js `Container`.
 * In tests a plain-object stub can be injected via `ParallaxPluginOptions`.
 */
export interface ParallaxContainer {
  x: number;
  y: number;
  addChild(child: { x: number; y: number }): void;
  removeChild(child: { x: number; y: number }): void;
  destroy?(): void;
}

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

let _nextParallaxId = 0;
function generateParallaxId(): string {
  return `parallax_${++_nextParallaxId}`;
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

interface ParallaxLayerState {
  def: ParallaxLayerDef;
  /** The Pixi Container (or stub) representing this layer's display group. */
  container: ParallaxContainer;
}

// ---------------------------------------------------------------------------
// ParallaxPlugin
// ---------------------------------------------------------------------------

/**
 * Plugin that provides **multi-layer parallax scrolling**.
 *
 * Each registered layer has a configurable `factorX` / `factorY` that
 * controls how fast it moves relative to the camera.  Layers with a factor
 * close to `0` appear to be in the far background; layers with a factor
 * greater than `1` rush past the camera as foreground elements.
 *
 * The plugin listens to `renderer/pre-render` and computes the correct
 * offset for every layer based on the current camera position retrieved
 * from `camera/state`.
 *
 * ### Quick start
 * ```ts
 * import { createEngine, ParallaxPlugin } from 'inkshot-engine';
 *
 * const parallax = new ParallaxPlugin();
 * const { core } = await createEngine({ plugins: [parallax] });
 *
 * // Add two background layers
 * core.events.emitSync('parallax/layer:add', { factorX: 0.2, factorY: 0 });
 * core.events.emitSync('parallax/layer:add', { factorX: 0.5, factorY: 0 });
 * ```
 *
 * ### EventBus API
 *
 * | Event                   | Params / Output                                          |
 * |-------------------------|----------------------------------------------------------|
 * | `parallax/layer:add`    | `ParallaxLayerAddParams → ParallaxLayerAddOutput`        |
 * | `parallax/layer:remove` | `ParallaxLayerRemoveParams`                              |
 * | `parallax/layer:update` | `ParallaxLayerUpdateParams`                              |
 * | `parallax/layer:get`    | `ParallaxLayerGetParams → ParallaxLayerGetOutput`        |
 * | `parallax/layers`       | `{} → ParallaxLayersOutput`                              |
 */
export class ParallaxPlugin implements EnginePlugin {
  readonly namespace = 'parallax';
  readonly editorMeta = {
    displayName: 'Parallax Plugin',
    icon: 'parallax',
    description: 'Manages multi-layer parallax scrolling backgrounds driven by the camera.',
    commands: [
      'parallax/layer:add', 'parallax/layer:remove', 'parallax/layer:update',
      'parallax/layer:get', 'parallax/layers',
    ] as const,
  };

  private readonly _opts: Required<ParallaxPluginOptions>;
  private readonly _layers: Map<string, ParallaxLayerState> = new Map();

  constructor(opts: ParallaxPluginOptions = {}) {
    this._opts = {
      parentLayer: opts.parentLayer ?? 'world',
    };
  }

  // ---------------------------------------------------------------------------
  // EnginePlugin lifecycle
  // ---------------------------------------------------------------------------

  init(core: Core): void {
    // ── EventBus API ─────────────────────────────────────────────────────
    core.events.on(
      'parallax',
      'parallax/layer:add',
      (p: ParallaxLayerAddParams, output: ParallaxLayerAddOutput) => {
        const id = p.id ?? generateParallaxId();
        const factorX = p.factorX ?? 0.5;
        const factorY = p.factorY ?? factorX;

        const def: ParallaxLayerDef = {
          id,
          factorX,
          factorY,
          originX: p.originX ?? 0,
          originY: p.originY ?? 0,
        };

        // Create the Pixi Container and add it to the parent layer.
        const container = new Container() as unknown as ParallaxContainer;
        const { output: parentLayerResult } = core.events.emitSync<{ name: string }, { layer: ParallaxContainer }>(
          'renderer/layer',
          { name: this._opts.parentLayer },
        );
        if (parentLayerResult.layer) {
          parentLayerResult.layer.addChild(container as unknown as Parameters<typeof parentLayerResult.layer.addChild>[0]);
        }

        this._layers.set(id, { def, container });
        output.id = id;
      },
    );

    core.events.on('parallax', 'parallax/layer:remove', (p: ParallaxLayerRemoveParams) => {
      const state = this._layers.get(p.id);
      if (!state) return;
      state.container.destroy?.();
      this._layers.delete(p.id);
    });

    core.events.on('parallax', 'parallax/layer:update', (p: ParallaxLayerUpdateParams) => {
      const state = this._layers.get(p.id);
      if (!state) return;
      const def = state.def;
      if (p.factorX !== undefined) def.factorX = p.factorX;
      if (p.factorY !== undefined) def.factorY = p.factorY;
      if (p.originX !== undefined) def.originX = p.originX;
      if (p.originY !== undefined) def.originY = p.originY;
    });

    core.events.on(
      'parallax',
      'parallax/layer:get',
      (p: ParallaxLayerGetParams, output: ParallaxLayerGetOutput) => {
        const state = this._layers.get(p.id);
        output.layer = state ? { ...state.def } : null;
      },
    );

    core.events.on('parallax', 'parallax/layers', (_p: Record<string, never>, output: ParallaxLayersOutput) => {
      output.layers = Array.from(this._layers.values()).map((s) => ({ ...s.def }));
    });

    // ── Update layer positions every render frame ─────────────────────────
    core.events.on('parallax', 'renderer/pre-render', (_p: RendererPreRenderParams) => {
      this._applyOffsets(core);
    });
  }

  destroy(core: Core): void {
    for (const state of this._layers.values()) {
      state.container.destroy?.();
    }
    this._layers.clear();
    core.events.removeNamespace('parallax');
  }

  // ---------------------------------------------------------------------------
  // Direct accessors (pull API)
  // ---------------------------------------------------------------------------

  /**
   * Return a snapshot of all registered parallax layer definitions.
   * Useful when you need to enumerate layers without going through the event bus.
   */
  getLayers(): ParallaxLayerDef[] {
    return Array.from(this._layers.values()).map((s) => ({ ...s.def }));
  }

  /**
   * Return the live Pixi container for a given layer id, or `null` if not found.
   * This container should be used to add display objects to the layer.
   */
  getContainer(id: string): ParallaxContainer | null {
    return this._layers.get(id)?.container ?? null;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private _applyOffsets(core: Core): void {
    if (this._layers.size === 0) return;

    const { output: camOut } = core.events.emitSync<object, { x: number; y: number; zoom: number; rotation: number; viewportWidth: number; viewportHeight: number }>(
      'camera/state',
      {},
    );
    const camX = camOut.x ?? 0;
    const camY = camOut.y ?? 0;

    for (const { def, container } of this._layers.values()) {
      // Offset = -(cameraPos * factor) so the layer shifts in the correct direction.
      container.x = def.originX - camX * def.factorX;
      container.y = def.originY - camY * def.factorY;
    }
  }
}
