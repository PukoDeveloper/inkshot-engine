// ---------------------------------------------------------------------------
// Data structures
// ---------------------------------------------------------------------------

/**
 * A single parallax layer configuration.
 *
 * Each layer moves at a fraction of the camera speed defined by its
 * `factor`.  Values less than 1 create the illusion of depth (objects
 * appear farther away); values greater than 1 create a "foreground rush"
 * effect.
 */
export interface ParallaxLayerDef {
  /** Unique identifier for this layer. */
  id: string;
  /**
   * Scroll multiplier on the X axis.
   *
   * - `0` — layer stays completely still (pinned to screen).
   * - `0.5` — layer scrolls at half camera speed (appears far away).
   * - `1` — layer scrolls 1:1 with the camera (same as world layer).
   * - `2` — layer scrolls twice as fast (foreground rush).
   *
   * Default `0.5`.
   */
  factorX: number;
  /**
   * Scroll multiplier on the Y axis. Defaults to the same value as
   * `factorX` when not explicitly provided.
   */
  factorY: number;
  /** World-space origin X (position when camera is at 0, 0). */
  originX: number;
  /** World-space origin Y. */
  originY: number;
}

// ---------------------------------------------------------------------------
// Constructor options
// ---------------------------------------------------------------------------

/** Options for {@link ParallaxPlugin}. */
export interface ParallaxPluginOptions {
  /**
   * Name of the renderer layer that will parent all parallax containers.
   * Defaults to `'world'`.
   */
  parentLayer?: string;
}

// ---------------------------------------------------------------------------
// Event params / outputs
// ---------------------------------------------------------------------------

/** Params for `parallax/layer:add`. */
export interface ParallaxLayerAddParams {
  /** Optional id — generated if omitted. */
  id?: string;
  /**
   * X-axis parallax factor.  See {@link ParallaxLayerDef.factorX}.
   * Defaults to `0.5`.
   */
  factorX?: number;
  /**
   * Y-axis parallax factor.  Defaults to the value of `factorX`.
   */
  factorY?: number;
  /** Initial world-space X origin. Defaults to `0`. */
  originX?: number;
  /** Initial world-space Y origin. Defaults to `0`. */
  originY?: number;
}

/** Output for `parallax/layer:add`. */
export interface ParallaxLayerAddOutput {
  /** Assigned layer id. */
  id: string;
}

/** Params for `parallax/layer:remove`. */
export interface ParallaxLayerRemoveParams {
  id: string;
}

/** Params for `parallax/layer:get`. */
export interface ParallaxLayerGetParams {
  id: string;
}

/** Output for `parallax/layer:get`. */
export interface ParallaxLayerGetOutput {
  layer: ParallaxLayerDef | null;
}

/** Output for `parallax/layers`. */
export interface ParallaxLayersOutput {
  layers: ParallaxLayerDef[];
}

/** Params for `parallax/layer:update`. */
export type ParallaxLayerUpdateParams = { id: string } & Partial<Omit<ParallaxLayerDef, 'id'>>;
