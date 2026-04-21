// ---------------------------------------------------------------------------
// Data structures
// ---------------------------------------------------------------------------

/**
 * A dynamic point light in the 2D world.
 *
 * The light spreads radially from (`x`, `y`) out to `radius` pixels.
 * `color` is a hex RGB value (e.g. `0xffdd88` for warm yellow) and
 * `intensity` is a linear multiplier in the range `0`–`1`.
 */
export interface PointLight {
  /** Unique identifier assigned by {@link LightingPlugin}. */
  id: string;
  /** World-space X position of the light source. */
  x: number;
  /** World-space Y position of the light source. */
  y: number;
  /** Falloff radius in world-space pixels. */
  radius: number;
  /** Light colour as a 24-bit hex value (e.g. `0xffffff`). */
  color: number;
  /** Brightness multiplier in the range `0`–`1`. */
  intensity: number;
}

/**
 * Global ambient (fill) light applied uniformly to the entire scene.
 *
 * At `intensity = 0` the scene is fully dark (only lit by point lights).
 * At `intensity = 1` the scene is fully bright regardless of point lights.
 */
export interface AmbientLight {
  /** Ambient tint colour as a 24-bit hex value. Default `0xffffff`. */
  color: number;
  /** Ambient brightness in the range `0`–`1`. Default `0.1`. */
  intensity: number;
}

// ---------------------------------------------------------------------------
// Constructor options
// ---------------------------------------------------------------------------

/** Constructor options for {@link LightingPlugin}. */
export interface LightingPluginOptions {
  /**
   * Shadow / light-map resolution preset.
   *
   * - `'low'`    – half of the viewport size
   * - `'medium'` – full viewport size (default)
   * - `'high'`   – double the viewport size (sharper, higher GPU cost)
   */
  quality?: 'low' | 'medium' | 'high';
  /** Initial ambient light colour. Defaults to `0x000000`. */
  ambientColor?: number;
  /** Initial ambient intensity `0`–`1`. Defaults to `0.1`. */
  ambientIntensity?: number;
}

// ---------------------------------------------------------------------------
// Event params / outputs
// ---------------------------------------------------------------------------

/**
 * Params for `lighting/light:add`.
 * `id` is optional — omit to let the plugin generate a unique identifier.
 */
export type LightAddParams = Omit<PointLight, 'id'> & { id?: string };

/** Output for `lighting/light:add`. */
export interface LightAddOutput {
  /** The assigned (or provided) light identifier. */
  id: string;
}

/** Params for `lighting/light:remove`. */
export interface LightRemoveParams {
  id: string;
}

/** Params for `lighting/light:update`. Unspecified fields are left unchanged. */
export type LightUpdateParams = { id: string } & Partial<Omit<PointLight, 'id'>>;

/** Params for `lighting/ambient:set`. Unspecified fields are left unchanged. */
export interface AmbientSetParams {
  color?: number;
  intensity?: number;
}

/** Params for `lighting/light:get`. */
export interface LightGetParams {
  id: string;
}

/** Output for `lighting/light:get`. */
export interface LightGetOutput {
  light: PointLight | null;
}

/** Output for `lighting/state`. */
export interface LightStateOutput {
  lights: PointLight[];
  ambient: AmbientLight;
}
