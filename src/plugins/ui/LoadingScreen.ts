import { Graphics } from 'pixi.js';
import type { Core } from '../../core/Core.js';
import type { EnginePlugin } from '../../types/plugin.js';
import type { SceneLoadParams } from '../../types/scene.js';
import type { RendererLayerParams, RendererLayerOutput } from '../../types/rendering.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Options for {@link LoadingScreen}. */
export interface LoadingScreenOptions {
  /**
   * Duration of each fade transition in milliseconds.
   * - `0` snaps the overlay in/out instantly (no animation).
   * Default: `300`.
   */
  duration?: number;
  /**
   * Overlay fill colour as a hex number (e.g. `0x000000` for black).
   * Default: `0x000000`.
   */
  color?: number;
}

// ---------------------------------------------------------------------------
// LoadingScreen
// ---------------------------------------------------------------------------

/**
 * Built-in plugin that provides a simple fade-to-black loading overlay during
 * scene transitions.
 *
 * `LoadingScreen` hooks into the three-phase `scene/load` pipeline:
 * - **`before`** — fades the overlay **in** (to opaque) to hide the outgoing scene.
 * - **`after`**  — fades the overlay **out** (to transparent) to reveal the incoming scene.
 *
 * The overlay is rendered on the `system` layer (z-index 300) so it always
 * appears above game content, effects, and HUD.
 *
 * If the renderer is not available (e.g. headless or test environment), the
 * plugin registers its hooks but performs no visual work — the scene transition
 * proceeds normally.
 *
 * ### Customisation
 *
 * `LoadingScreen` intentionally does the minimum — it is the **integration
 * point** for custom transitions.  Developers who want a more elaborate effect
 * (e.g. a spinning logo, a wipe, or a shader) should either:
 * 1. Replace `LoadingScreen` with a custom plugin that listens to the same
 *    `scene/load` phases.
 * 2. Add additional `scene/load` `before`/`after` listeners with a higher
 *    priority than `LoadingScreen` to layer effects on top.
 *
 * ### Usage
 *
 * ```ts
 * import { createEngine, SceneManager, LoadingScreen } from 'inkshot-engine';
 *
 * const { core } = await createEngine({
 *   plugins: [
 *     new SceneManager(),
 *     new LoadingScreen({ duration: 500, color: 0x000000 }),
 *   ],
 * });
 * ```
 */
export class LoadingScreen implements EnginePlugin {
  readonly namespace = 'loadingScreen';
  readonly editorMeta = {
    displayName: 'Loading Screen',
    icon: 'loadingScreen',
    description: 'Displays a fade-in/out overlay during scene transitions.',
    commands: [] as const,
  };

  private readonly _duration: number;
  private readonly _color: number;
  private _overlay: Graphics | null = null;

  constructor(options: LoadingScreenOptions = {}) {
    this._duration = options.duration ?? 300;
    this._color = options.color ?? 0x000000;
  }

  // ---------------------------------------------------------------------------
  // EnginePlugin lifecycle
  // ---------------------------------------------------------------------------

  init(core: Core): void {
    // Attempt to create the full-screen overlay on the system layer.
    // This will silently no-op when no renderer/layer handler is registered
    // (e.g. during unit tests or server-side execution).
    this._tryCreateOverlay(core);

    // Before the scene transition: fade overlay IN (opaque) to hide the swap.
    core.events.on<SceneLoadParams>(
      this.namespace,
      'scene/load',
      async () => {
        await this._fade(1);
      },
      { phase: 'before' },
    );

    // After the scene transition: fade overlay OUT (transparent) to reveal the new scene.
    core.events.on<SceneLoadParams>(
      this.namespace,
      'scene/load',
      async () => {
        await this._fade(0);
      },
      { phase: 'after' },
    );
  }

  destroy(core: Core): void {
    core.events.removeNamespace(this.namespace);

    if (this._overlay) {
      this._overlay.destroy();
      this._overlay = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Query the renderer for the `system` layer and create the overlay `Graphics`
   * object.  Fails silently when the renderer is not registered.
   */
  private _tryCreateOverlay(core: Core): void {
    try {
      const { output } = core.events.emitSync<RendererLayerParams, RendererLayerOutput>(
        'renderer/layer',
        { name: 'system' },
      );
      if (!output.layer) return;

      const { width, height } = core.app.screen;
      const g = new Graphics();
      g.rect(0, 0, width, height).fill(this._color);
      g.alpha = 0;
      g.eventMode = 'none';
      output.layer.addChild(g);
      this._overlay = g;
    } catch {
      // Renderer is not available — visual fade will be skipped.
    }
  }

  /**
   * Animate the overlay alpha to `targetAlpha` over `this._duration` ms.
   *
   * - If there is no overlay (headless / no renderer), resolves immediately.
   * - If `duration` is `0`, snaps to the target alpha without animation.
   * - Otherwise, uses `requestAnimationFrame` for a smooth per-frame animation.
   */
  private _fade(targetAlpha: number): Promise<void> {
    const overlay = this._overlay;

    if (!overlay) {
      return Promise.resolve();
    }

    if (this._duration <= 0) {
      overlay.alpha = targetAlpha;
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      const startAlpha = overlay.alpha;
      const startTime = performance.now();
      const duration = this._duration;

      const tick = (now: number): void => {
        const elapsed = now - startTime;
        const t = Math.min(elapsed / duration, 1);
        overlay.alpha = startAlpha + (targetAlpha - startAlpha) * t;

        if (t < 1) {
          requestAnimationFrame(tick);
        } else {
          resolve();
        }
      };

      requestAnimationFrame(tick);
    });
  }
}
