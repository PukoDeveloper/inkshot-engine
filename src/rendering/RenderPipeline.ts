import type { Core } from '../core/Core.js';
import type {
  CoreRenderParams,
  RendererPreRenderParams,
  RendererAnimateParams,
  RendererPostProcessParams,
} from '../types/rendering.js';

/**
 * Event-driven render pipeline that converts each `core/render` frame into
 * three ordered sub-phases:
 *
 * 1. **`renderer/pre-render`** – camera update, visibility culling, sorting.
 * 2. **`renderer/animate`**    – sprite interpolation, skeletal/frame animation.
 * 3. **`renderer/post-process`** – shader pass execution, debug overlays.
 *
 * Plugins subscribe to the phase they care about; the pipeline dispatches
 * the same `{ alpha, delta }` payload to each.
 */
export class RenderPipeline {
  private readonly _core: Core;

  constructor(core: Core) {
    this._core = core;

    // Drive the sub-phases from the main render event.
    core.events.on('renderPipeline', 'core/render', this._onRender, { priority: 0 });
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  destroy(): void {
    this._core.events.removeNamespace('renderPipeline');
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private readonly _onRender = (params: CoreRenderParams): void => {
    const payload: RendererPreRenderParams & RendererAnimateParams & RendererPostProcessParams = {
      alpha: params.alpha,
      delta: params.delta,
    };

    this._core.events.emitSync('renderer/pre-render', payload as RendererPreRenderParams);
    this._core.events.emitSync('renderer/animate', payload as RendererAnimateParams);
    this._core.events.emitSync('renderer/post-process', payload as RendererPostProcessParams);
  };
}
