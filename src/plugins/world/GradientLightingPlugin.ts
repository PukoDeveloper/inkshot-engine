import { Graphics } from 'pixi.js';
import type { Container } from 'pixi.js';
import type { Core } from '../../core/Core.js';
import type { EnginePlugin } from '../../types/plugin.js';
import type { RendererPreRenderParams } from '../../types/rendering.js';
import type {
  GradientAmbientLight,
  GradientAmbientSetParams,
  GradientLight,
  GradientLightAddOutput,
  GradientLightAddParams,
  GradientLightGetOutput,
  GradientLightGetParams,
  GradientLightRemoveParams,
  GradientLightStateOutput,
  GradientLightUpdateParams,
  GradientLightingPluginOptions,
} from '../../types/gradient-lighting.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Decompose a hex colour into normalised `r`, `g`, `b` components (0–1). */
function hexToRgb(hex: number): { r: number; g: number; b: number } {
  return {
    r: ((hex >> 16) & 0xff) / 255,
    g: ((hex >> 8) & 0xff) / 255,
    b: (hex & 0xff) / 255,
  };
}

/** Clamp a value to [0, 1]. */
function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

// ---------------------------------------------------------------------------
// GradientLightingPlugin
// ---------------------------------------------------------------------------

/**
 * An advanced 2D lighting plugin offering smooth gradient falloff, spotlight
 * (cone) support, and optional per-light flicker — all without replacing or
 * conflicting with the basic {@link LightingPlugin}.
 *
 * Lights are composited over the scene using Pixi's **multiply** blend mode.
 * Each point light is rendered as a series of concentric filled circles whose
 * alpha follows a configurable power-law curve (`linear`, `quadratic`, or
 * `cubic`).  The step count is controlled by the `quality` option (16 / 32 /
 * 64 steps), producing a significantly smoother gradient than the basic plugin.
 *
 * **Spotlight** (cone) lights are drawn as a filled wedge that fades with the
 * same falloff curve.  Set `angle` (direction in radians) and `spread`
 * (half-cone angle in radians) on a light to activate spotlight mode.
 *
 * **Flicker** adds per-frame random intensity variation, ideal for candles,
 * torches, or magical effects.  Set `flicker: true` and optionally
 * `flickerAmount` (default `0.15`) on a light.
 *
 * ### Quick start
 * ```ts
 * import { createEngine, GradientLightingPlugin } from 'inkshot-engine';
 *
 * const lighting = new GradientLightingPlugin({
 *   quality: 'high',
 *   falloff: 'quadratic',
 *   ambientIntensity: 0.05,
 * });
 * const { core } = await createEngine({ plugins: [lighting] });
 *
 * // Add a warm flickering torch (point light)
 * const { output } = core.events.emitSync('gradient-lighting/light:add', {
 *   x: 200, y: 300, radius: 140, color: 0xffcc66,
 *   intensity: 0.9, flicker: true, flickerAmount: 0.2,
 * });
 *
 * // Add a blue magic spotlight (cone light)
 * core.events.emitSync('gradient-lighting/light:add', {
 *   x: 400, y: 250, radius: 200, color: 0x88aaff, intensity: 0.8,
 *   angle: Math.PI / 2,   // pointing down
 *   spread: Math.PI / 6,  // 60° wide cone
 * });
 * ```
 *
 * ### EventBus API
 *
 * | Event                           | Params / Output                              |
 * |---------------------------------|----------------------------------------------|
 * | `gradient-lighting/light:add`   | `GradientLightAddParams → GradientLightAddOutput`   |
 * | `gradient-lighting/light:remove`| `GradientLightRemoveParams`                  |
 * | `gradient-lighting/light:update`| `GradientLightUpdateParams`                  |
 * | `gradient-lighting/light:get`   | `GradientLightGetParams → GradientLightGetOutput`   |
 * | `gradient-lighting/ambient:set` | `GradientAmbientSetParams`                   |
 * | `gradient-lighting/state`       | `{} → GradientLightStateOutput`              |
 */
export class GradientLightingPlugin implements EnginePlugin {
  readonly namespace = 'gradient-lighting';
  readonly editorMeta = {
    displayName: 'Gradient Lighting Plugin',
    icon: 'lighting',
    description:
      'Advanced 2D lighting with smooth gradient falloff, spotlight (cone) support, and per-light flicker.',
    events: [
      'gradient-lighting/light:add',
      'gradient-lighting/light:remove',
      'gradient-lighting/light:update',
      'gradient-lighting/light:get',
      'gradient-lighting/ambient:set',
      'gradient-lighting/state',
    ] as const,
  };

  private readonly _steps: number;
  private readonly _falloff: 'linear' | 'quadratic' | 'cubic';
  private readonly _lights: Map<string, GradientLight> = new Map();
  private _ambient: GradientAmbientLight;

  /** Pixi Graphics used to draw the light map each frame. */
  private _gfx: Graphics | null = null;
  /** The container that holds the light map layer. */
  private _layer: Container | null = null;

  /** Per-instance light ID counter to avoid cross-instance collisions. */
  private _nextLightId = 0;

  private _generateLightId(): string {
    return `glight_${++this._nextLightId}`;
  }

  constructor(opts: GradientLightingPluginOptions = {}) {
    const quality = opts.quality ?? 'medium';
    this._steps = quality === 'low' ? 16 : quality === 'high' ? 64 : 32;
    this._falloff = opts.falloff ?? 'quadratic';
    this._ambient = {
      color: opts.ambientColor ?? 0x000000,
      intensity: opts.ambientIntensity ?? 0.1,
    };
  }

  // ---------------------------------------------------------------------------
  // EnginePlugin lifecycle
  // ---------------------------------------------------------------------------

  init(core: Core): void {
    // ── Obtain / create a dedicated lighting layer ───────────────────────
    const { output: layerResult } = core.events.emitSync<
      { name: string; zIndex: number },
      { layer: Container }
    >('renderer/layer:create', { name: 'gradient-lighting', zIndex: 51 });
    this._layer = layerResult.layer ?? null;

    if (this._layer) {
      (this._layer as unknown as { blendMode: string }).blendMode = 'multiply';
      this._gfx = new Graphics();
      this._layer.addChild(
        this._gfx as unknown as Parameters<typeof this._layer.addChild>[0],
      );
    }

    // ── EventBus API ─────────────────────────────────────────────────────
    core.events.on(
      'gradient-lighting',
      'gradient-lighting/light:add',
      (p: GradientLightAddParams, output: GradientLightAddOutput) => {
        const id = p.id ?? this._generateLightId();
        const light: GradientLight = {
          id,
          x: p.x,
          y: p.y,
          radius: p.radius,
          color: p.color ?? 0xffffff,
          intensity: clamp01(p.intensity ?? 1),
          angle: p.angle,
          spread: p.spread,
          flicker: p.flicker,
          flickerAmount: p.flickerAmount,
        };
        this._lights.set(id, light);
        output.id = id;
      },
    );

    core.events.on(
      'gradient-lighting',
      'gradient-lighting/light:remove',
      (p: GradientLightRemoveParams) => {
        this._lights.delete(p.id);
      },
    );

    core.events.on(
      'gradient-lighting',
      'gradient-lighting/light:update',
      (p: GradientLightUpdateParams) => {
        const light = this._lights.get(p.id);
        if (!light) return;
        if (p.x !== undefined) light.x = p.x;
        if (p.y !== undefined) light.y = p.y;
        if (p.radius !== undefined) light.radius = p.radius;
        if (p.color !== undefined) light.color = p.color;
        if (p.intensity !== undefined) light.intensity = clamp01(p.intensity);
        if (p.angle !== undefined) light.angle = p.angle;
        if (p.spread !== undefined) light.spread = p.spread;
        if (p.flicker !== undefined) light.flicker = p.flicker;
        if (p.flickerAmount !== undefined) light.flickerAmount = p.flickerAmount;
      },
    );

    core.events.on(
      'gradient-lighting',
      'gradient-lighting/light:get',
      (p: GradientLightGetParams, output: GradientLightGetOutput) => {
        output.light = this._lights.get(p.id) ?? null;
      },
    );

    core.events.on(
      'gradient-lighting',
      'gradient-lighting/ambient:set',
      (p: GradientAmbientSetParams) => {
        if (p.color !== undefined) this._ambient.color = p.color;
        if (p.intensity !== undefined) this._ambient.intensity = clamp01(p.intensity);
      },
    );

    core.events.on(
      'gradient-lighting',
      'gradient-lighting/state',
      (_p: Record<string, never>, output: GradientLightStateOutput) => {
        output.lights = Array.from(this._lights.values()).map((l) => ({ ...l }));
        output.ambient = { ...this._ambient };
      },
    );

    // ── Redraw the light map every render frame ───────────────────────────
    core.events.on('gradient-lighting', 'renderer/pre-render', (_p: RendererPreRenderParams) => {
      this._drawLightMap(core);
    });
  }

  destroy(core: Core): void {
    if (this._gfx) {
      this._gfx.destroy();
      this._gfx = null;
    }
    if (this._layer) {
      this._layer.parent?.removeChild(
        this._layer as Parameters<typeof this._layer.parent.removeChild>[0],
      );
      this._layer = null;
    }
    this._lights.clear();
    core.events.removeNamespace('gradient-lighting');
  }

  // ---------------------------------------------------------------------------
  // Direct accessors (pull API)
  // ---------------------------------------------------------------------------

  /** Return a snapshot of all active gradient lights. */
  getLights(): GradientLight[] {
    return Array.from(this._lights.values()).map((l) => ({ ...l }));
  }

  /** Return a copy of the current ambient light settings. */
  getAmbient(): GradientAmbientLight {
    return { ...this._ambient };
  }

  // ---------------------------------------------------------------------------
  // Private — light map rendering
  // ---------------------------------------------------------------------------

  /**
   * Compute the alpha for a given normalised ring index `t` (0 = outer edge,
   * approaching 1 = inner centre) using the configured falloff curve.
   *
   * The power-law exponent controls the shape of the gradient:
   * - `linear`    → exponent 1 — constant dimming rate
   * - `quadratic` → exponent 2 — brighter centre, sharper edge
   * - `cubic`     → exponent 3 — very bright centre with a pronounced edge
   */
  private _falloffAlpha(baseIntensity: number, t: number): number {
    const exp = this._falloff === 'cubic' ? 3 : this._falloff === 'quadratic' ? 2 : 1;
    return baseIntensity * Math.pow(1 - t, exp);
  }

  private _drawLightMap(core: Core): void {
    if (!this._gfx) return;

    const { output: camOut } = core.events.emitSync<
      object,
      { x: number; y: number; zoom: number; rotation: number; viewportWidth: number; viewportHeight: number }
    >('camera/state', {});

    const vw = camOut.viewportWidth ?? 800;
    const vh = camOut.viewportHeight ?? 600;
    const camX = camOut.x ?? 0;
    const camY = camOut.y ?? 0;
    const camZoom = camOut.zoom ?? 1;

    const gfx = this._gfx;
    gfx.clear();

    // Fill viewport with ambient darkness.
    const ambientDark = 1 - this._ambient.intensity;
    const { r: ar, g: ag, b: ab } = hexToRgb(this._ambient.color);
    gfx.rect(0, 0, vw, vh).fill({
      color:
        (Math.round(ar * 255) << 16) |
        (Math.round(ag * 255) << 8) |
        Math.round(ab * 255),
      alpha: ambientDark,
    });

    for (const light of this._lights.values()) {
      // Apply flicker: randomly shift intensity by up to ±flickerAmount each frame.
      const flickerVar = light.flicker
        ? (light.flickerAmount ?? 0.15) * (Math.random() * 2 - 1)
        : 0;
      const effectiveIntensity = clamp01(light.intensity + flickerVar);

      const { r, g, b } = hexToRgb(light.color);
      const col =
        (Math.round(r * 255) << 16) |
        (Math.round(g * 255) << 8) |
        Math.round(b * 255);

      const screenX = (light.x - camX) * camZoom + vw / 2;
      const screenY = (light.y - camY) * camZoom + vh / 2;
      const screenR = light.radius * camZoom;

      const isSpotlight = light.angle !== undefined && light.spread !== undefined;

      // Draw from outermost ring (large, transparent) to innermost (small, bright).
      for (let i = this._steps; i >= 1; i--) {
        const t = i / this._steps;
        const alpha = this._falloffAlpha(effectiveIntensity, t);

        if (isSpotlight) {
          // Render a cone (pie-slice wedge) for spotlight lights.
          const startAngle = light.angle! - light.spread!;
          const endAngle = light.angle! + light.spread!;
          gfx
            .moveTo(screenX, screenY)
            .arc(screenX, screenY, screenR * t, startAngle, endAngle)
            .closePath()
            .fill({ color: col, alpha });
        } else {
          // Render a full circle for point lights.
          gfx.circle(screenX, screenY, screenR * t).fill({ color: col, alpha });
        }
      }
    }
  }
}
