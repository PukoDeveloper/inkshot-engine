// ---------------------------------------------------------------------------
// Data structures
// ---------------------------------------------------------------------------

/**
 * A dynamic light in the {@link GradientLightingPlugin}.
 *
 * Point lights spread radially in all directions.  Providing `angle` and
 * `spread` turns the light into a **spotlight**: a cone-shaped beam pointing
 * in the given direction with the given half-angle.
 *
 * Setting `flicker: true` enables a per-frame random intensity variation that
 * simulates candles, torches, or other flickering light sources.
 */
export interface GradientLight {
  /** Unique identifier assigned by {@link GradientLightingPlugin}. */
  id: string;
  /** World-space X position of the light source. */
  x: number;
  /** World-space Y position of the light source. */
  y: number;
  /** Falloff radius in world-space pixels. */
  radius: number;
  /** Light colour as a 24-bit hex value (e.g. `0xffdd88`). */
  color: number;
  /** Base brightness multiplier in the range `0`–`1`. */
  intensity: number;
  /**
   * Spotlight direction in **radians**, measured **counter-clockwise** from
   * the positive X axis following the standard canvas / PixiJS convention
   * (e.g. `0` = right, `Math.PI / 2` = up in screen space).
   * When omitted the light spreads in all directions (point light).
   */
  angle?: number;
  /**
   * **Half**-angle of the spotlight cone in radians.
   * E.g. `Math.PI / 6` produces a 60° wide cone.
   * Required when `angle` is provided; ignored for point lights.
   */
  spread?: number;
  /**
   * Enable per-frame random intensity variation for fire / candle effects.
   * Defaults to `false`.
   */
  flicker?: boolean;
  /**
   * Maximum intensity variance applied when `flicker` is `true`.
   * A value of `0.15` means the effective intensity can vary by up to ±15 % of
   * the `flickerAmount` each frame (randomly increases or decreases the base
   * intensity).  Defaults to `0.15`.
   */
  flickerAmount?: number;
}

/**
 * Global ambient (fill) light applied uniformly to the entire scene.
 *
 * At `intensity = 0` the scene is fully dark.
 * At `intensity = 1` the scene is fully bright regardless of point lights.
 */
export interface GradientAmbientLight {
  /** Ambient tint colour as a 24-bit hex value. Default `0x000000`. */
  color: number;
  /** Ambient brightness in the range `0`–`1`. Default `0.1`. */
  intensity: number;
}

// ---------------------------------------------------------------------------
// Constructor options
// ---------------------------------------------------------------------------

/** Constructor options for {@link GradientLightingPlugin}. */
export interface GradientLightingPluginOptions {
  /**
   * Controls the number of gradient steps used to render each light.
   *
   * - `'low'`    – 16 steps (fastest)
   * - `'medium'` – 32 steps (default, recommended for most games)
   * - `'high'`   – 64 steps (smoothest, higher GPU draw-call cost)
   */
  quality?: 'low' | 'medium' | 'high';
  /**
   * Intensity falloff curve applied to each light's radial gradient.
   *
   * - `'linear'`    – constant rate (same as the basic LightingPlugin)
   * - `'quadratic'` – squared falloff — brighter centre, quicker dimming at the edge (default)
   * - `'cubic'`     – cubed falloff — very bright centre with a sharp edge fall-off
   */
  falloff?: 'linear' | 'quadratic' | 'cubic';
  /** Initial ambient light colour. Defaults to `0x000000`. */
  ambientColor?: number;
  /** Initial ambient intensity `0`–`1`. Defaults to `0.1`. */
  ambientIntensity?: number;
}

// ---------------------------------------------------------------------------
// Event params / outputs
// ---------------------------------------------------------------------------

/**
 * Params for `gradient-lighting/light:add`.
 * `id` is optional — omit to let the plugin generate a unique identifier.
 */
export type GradientLightAddParams = Omit<GradientLight, 'id'> & { id?: string };

/** Output for `gradient-lighting/light:add`. */
export interface GradientLightAddOutput {
  /** The assigned (or provided) light identifier. */
  id: string;
}

/** Params for `gradient-lighting/light:remove`. */
export interface GradientLightRemoveParams {
  id: string;
}

/** Params for `gradient-lighting/light:update`. Unspecified fields are left unchanged. */
export type GradientLightUpdateParams = { id: string } & Partial<Omit<GradientLight, 'id'>>;

/** Params for `gradient-lighting/light:get`. */
export interface GradientLightGetParams {
  id: string;
}

/** Output for `gradient-lighting/light:get`. */
export interface GradientLightGetOutput {
  light: GradientLight | null;
}

/** Params for `gradient-lighting/ambient:set`. Unspecified fields are left unchanged. */
export interface GradientAmbientSetParams {
  color?: number;
  intensity?: number;
}

/** Output for `gradient-lighting/state`. */
export interface GradientLightStateOutput {
  lights: GradientLight[];
  ambient: GradientAmbientLight;
}
