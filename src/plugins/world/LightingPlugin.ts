import { Graphics } from 'pixi.js';
import type { Container } from 'pixi.js';
import type { Core } from '../../core/Core.js';
import type { EnginePlugin } from '../../types/plugin.js';
import type { RendererPreRenderParams } from '../../types/rendering.js';
import type {
  AmbientLight,
  AmbientSetParams,
  LightAddOutput,
  LightAddParams,
  LightGetOutput,
  LightGetParams,
  LightRemoveParams,
  LightStateOutput,
  LightUpdateParams,
  LightingPluginOptions,
  PointLight,
} from '../../types/lighting.js';

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// LightingPlugin
// ---------------------------------------------------------------------------

/**
 * Plugin that provides a 2D dynamic lighting system.
 *
 * The plugin maintains a collection of {@link PointLight} objects and an
 * {@link AmbientLight}.  Each render frame it redraws the light map onto a
 * dedicated screen-space `Graphics` layer that is composited over the world
 * using Pixi's **multiply** blend mode, darkening areas that are not lit.
 *
 * ### Quick start
 * ```ts
 * import { createEngine, LightingPlugin } from 'inkshot-engine';
 *
 * const lighting = new LightingPlugin({ ambientIntensity: 0.05 });
 * const { core } = await createEngine({ plugins: [lighting] });
 *
 * // Add a warm torch light at world position (200, 300)
 * const { output } = core.events.emitSync('lighting/light:add', {
 *   x: 200, y: 300, radius: 120, color: 0xffdd88, intensity: 0.9,
 * });
 * const torchId = (output as LightAddOutput).id;
 *
 * // Move it every frame (e.g. follow the player)
 * core.events.emitSync('lighting/light:update', { id: torchId, x: player.x, y: player.y });
 * ```
 *
 * ### EventBus API
 *
 * | Event                  | Params / Output                                      |
 * |------------------------|------------------------------------------------------|
 * | `lighting/light:add`   | `LightAddParams → LightAddOutput`                   |
 * | `lighting/light:remove`| `LightRemoveParams`                                  |
 * | `lighting/light:update`| `LightUpdateParams`                                  |
 * | `lighting/light:get`   | `LightGetParams → LightGetOutput`                   |
 * | `lighting/ambient:set` | `AmbientSetParams`                                   |
 * | `lighting/state`       | `{} → LightStateOutput`                              |
 */
export class LightingPlugin implements EnginePlugin {
  readonly namespace = 'lighting';
  readonly editorMeta = {
    displayName: 'Lighting Plugin',
    icon: 'lighting',
    description: 'Renders a dynamic 2D lighting layer with point lights and ambient control.',
    events: [
      'lighting/light:add', 'lighting/light:remove', 'lighting/light:update',
      'lighting/light:get', 'lighting/ambient:set', 'lighting/state',
    ] as const,
  };

  private readonly _opts: Required<LightingPluginOptions>;
  private readonly _lights: Map<string, PointLight> = new Map();
  private _ambient: AmbientLight;

  /** Pixi Graphics used to draw the light map each frame. */
  private _gfx: Graphics | null = null;
  /** The container that holds the light map layer. */
  private _layer: Container | null = null;

  /** Per-instance light ID counter to avoid cross-instance collisions. */
  private _nextLightId = 0;

  private _generateLightId(): string {
    return `light_${++this._nextLightId}`;
  }

  constructor(opts: LightingPluginOptions = {}) {
    this._opts = {
      quality: opts.quality ?? 'medium',
      ambientColor: opts.ambientColor ?? 0x000000,
      ambientIntensity: opts.ambientIntensity ?? 0.1,
    };
    this._ambient = {
      color: this._opts.ambientColor,
      intensity: this._opts.ambientIntensity,
    };
  }

  // ---------------------------------------------------------------------------
  // EnginePlugin lifecycle
  // ---------------------------------------------------------------------------

  init(core: Core): void {
    // ── Obtain / create a dedicated lighting layer ───────────────────────
    const { output: layerResult } = core.events.emitSync<{ name: string; zIndex: number }, { layer: Container }>(
      'renderer/layer:create',
      { name: 'lighting', zIndex: 50 },
    );
    this._layer = layerResult.layer ?? null;

    if (this._layer) {
      // MULTIPLY blending on the whole layer darkens areas not covered by lights.
      (this._layer as unknown as { blendMode: string }).blendMode = 'multiply';
      this._gfx = new Graphics();
      this._layer.addChild(this._gfx as unknown as Parameters<typeof this._layer.addChild>[0]);
    }

    // ── EventBus API ─────────────────────────────────────────────────────
    core.events.on('lighting', 'lighting/light:add', (p: LightAddParams, output: LightAddOutput) => {
      const id = p.id ?? this._generateLightId();
      const light: PointLight = {
        id,
        x: p.x,
        y: p.y,
        radius: p.radius,
        color: p.color ?? 0xffffff,
        intensity: Math.max(0, Math.min(1, p.intensity ?? 1)),
      };
      this._lights.set(id, light);
      output.id = id;
    });

    core.events.on('lighting', 'lighting/light:remove', (p: LightRemoveParams) => {
      this._lights.delete(p.id);
    });

    core.events.on('lighting', 'lighting/light:update', (p: LightUpdateParams) => {
      const light = this._lights.get(p.id);
      if (!light) return;
      if (p.x !== undefined) light.x = p.x;
      if (p.y !== undefined) light.y = p.y;
      if (p.radius !== undefined) light.radius = p.radius;
      if (p.color !== undefined) light.color = p.color;
      if (p.intensity !== undefined) light.intensity = Math.max(0, Math.min(1, p.intensity));
    });

    core.events.on('lighting', 'lighting/light:get', (p: LightGetParams, output: LightGetOutput) => {
      output.light = this._lights.get(p.id) ?? null;
    });

    core.events.on('lighting', 'lighting/ambient:set', (p: AmbientSetParams) => {
      if (p.color !== undefined) this._ambient.color = p.color;
      if (p.intensity !== undefined) this._ambient.intensity = Math.max(0, Math.min(1, p.intensity));
    });

    core.events.on('lighting', 'lighting/state', (_p: Record<string, never>, output: LightStateOutput) => {
      output.lights = Array.from(this._lights.values()).map((l) => ({ ...l }));
      output.ambient = { ...this._ambient };
    });

    // ── Redraw the light map every render frame ───────────────────────────
    core.events.on('lighting', 'renderer/pre-render', (_p: RendererPreRenderParams) => {
      this._drawLightMap(core);
    });
  }

  destroy(core: Core): void {
    if (this._gfx) {
      this._gfx.destroy();
      this._gfx = null;
    }
    if (this._layer) {
      this._layer.parent?.removeChild(this._layer as Parameters<typeof this._layer.parent.removeChild>[0]);
      this._layer = null;
    }
    this._lights.clear();
    core.events.removeNamespace('lighting');
  }

  // ---------------------------------------------------------------------------
  // Direct accessors (pull API)
  // ---------------------------------------------------------------------------

  /** Return a snapshot of all active point lights. */
  getLights(): PointLight[] {
    return Array.from(this._lights.values()).map((l) => ({ ...l }));
  }

  /** Return a copy of the current ambient light settings. */
  getAmbient(): AmbientLight {
    return { ...this._ambient };
  }

  // ---------------------------------------------------------------------------
  // Private — light map rendering
  // ---------------------------------------------------------------------------

  private _drawLightMap(core: Core): void {
    if (!this._gfx) return;

    // Determine viewport size from the camera state.
    const { output: camOut } = core.events.emitSync<object, { x: number; y: number; zoom: number; rotation: number; viewportWidth: number; viewportHeight: number }>(
      'camera/state',
      {},
    );
    const vw = camOut.viewportWidth ?? 800;
    const vh = camOut.viewportHeight ?? 600;
    const camX = camOut.x ?? 0;
    const camY = camOut.y ?? 0;
    const camZoom = camOut.zoom ?? 1;

    const gfx = this._gfx;
    gfx.clear();

    // Fill the entire viewport with the ambient colour at (1 - ambientIntensity)
    // darkness.  When intensity = 1 the fill is transparent (no darkness).
    // When intensity = 0 the fill is opaque black (completely dark).
    const ambientDark = 1 - this._ambient.intensity;
    const { r: ar, g: ag, b: ab } = hexToRgb(this._ambient.color);
    gfx.rect(0, 0, vw, vh).fill({
      color: (Math.round(ar * 255) << 16) | (Math.round(ag * 255) << 8) | Math.round(ab * 255),
      alpha: ambientDark,
    });

    // Draw each point light as a soft circle in ADD blend mode.
    for (const light of this._lights.values()) {
      const { r, g, b } = hexToRgb(light.color);
      const col =
        (Math.round(r * 255) << 16) |
        (Math.round(g * 255) << 8) |
        Math.round(b * 255);

      // Offset from world-space to screen-space.
      const screenX = (light.x - camX) * camZoom + vw / 2;
      const screenY = (light.y - camY) * camZoom + vh / 2;
      const screenR = light.radius * camZoom;

      // Draw concentric rings for a simple radial falloff effect.
      const steps = 8;
      for (let i = steps; i >= 1; i--) {
        const t = i / steps;
        const alpha = light.intensity * (1 - t);
        gfx.circle(screenX, screenY, screenR * t).fill({ color: col, alpha });
      }
    }
  }
}
