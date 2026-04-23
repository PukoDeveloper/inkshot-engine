import type { Container, Filter } from 'pixi.js';

// ---------------------------------------------------------------------------
// Core loop event params
// ---------------------------------------------------------------------------

/** Params emitted with `core/update` (fixed time-step). */
export interface CoreUpdateParams {
  /** Fixed delta in milliseconds (constant per tick, e.g. ~16.67 ms at 60 Hz). */
  dt: number;
  /** Monotonically increasing tick counter. */
  tick: number;
}

/** Params emitted with `core/render` (every display frame). */
export interface CoreRenderParams {
  /** Interpolation factor between previous and current fixed update (0–1). */
  alpha: number;
  /** Raw frame delta in milliseconds (variable). */
  delta: number;
}

// ---------------------------------------------------------------------------
// Render pipeline events
// ---------------------------------------------------------------------------

export interface RendererPreRenderParams {
  alpha: number;
  delta: number;
}

export interface RendererAnimateParams {
  alpha: number;
  delta: number;
}

export interface RendererPostProcessParams {
  alpha: number;
  delta: number;
}

// ---------------------------------------------------------------------------
// Shader / Post-processing
// ---------------------------------------------------------------------------

export interface ShaderPassOptions {
  /** Unique pass name. */
  readonly name: string;
  /** Execution order within the pipeline (lower runs first). */
  readonly order: number;
  /** The Pixi `Filter` instance. */
  filter: Filter;
  /** Whether this pass is enabled. */
  enabled?: boolean;
}

/** Event bus params for `renderer/shader:add`. */
export interface ShaderAddParams {
  pass: ShaderPassOptions;
  /** Target layer name, or `'screen'` for the full stage. */
  target?: string;
}

/** Event bus params for `renderer/shader:remove`. */
export interface ShaderRemoveParams {
  name: string;
  target?: string;
}

/** Event bus params for `renderer/shader:toggle`. */
export interface ShaderToggleParams {
  name: string;
  enabled: boolean;
  target?: string;
}

// ---------------------------------------------------------------------------
// Layer events (already partially in Renderer, typed here for export)
// ---------------------------------------------------------------------------

export interface RendererLayerParams {
  name: string;
}

export interface RendererLayerOutput {
  layer: Container;
}

export interface RendererLayerCreateParams {
  name: string;
  zIndex: number;
}

// ---------------------------------------------------------------------------
// Animation
// ---------------------------------------------------------------------------

export interface SpriteAnimationDef {
  /** Ordered list of texture keys (resolved via ResourceManager). */
  frames: string[];
  /** Duration of each frame in fixed ticks. */
  frameDuration: number;
  /** Whether to loop. */
  loop: boolean;
}

export interface AnimationPlayParams {
  /** Target display object label or ref key. */
  target: string;
  /** Animation definition name. */
  animation: string;
}

export interface AnimationStopParams {
  target: string;
}

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------

/** Rectangle used for world bounds clamping and viewport calculations. */
export interface CameraRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Target that the camera can follow. Must expose x/y coordinates. */
export interface CameraTarget {
  x: number;
  y: number;
}

/** Configuration for camera follow behaviour. */
export interface CameraFollowOptions {
  /** Lerp speed (0–1). 1 = instant snap, smaller = smoother. Default `0.1`. */
  lerp?: number;
  /** Deadzone rectangle centred on the viewport. Camera won't move while the target is inside. */
  deadzone?: { width: number; height: number };
  /** Offset added to the follow target position (e.g. look-ahead). */
  offset?: { x: number; y: number };
}

/** Screen shake configuration. */
export interface CameraShakeOptions {
  /** Shake intensity in pixels. */
  intensity: number;
  /** Duration in milliseconds. */
  duration: number;
  /** Decay function. `'linear'` fades evenly; `'exponential'` decays quickly. Default `'exponential'`. */
  decay?: 'linear' | 'exponential';
}

/** EventBus params for `camera/follow`. */
export interface CameraFollowParams {
  target: CameraTarget | null;
  options?: CameraFollowOptions;
}

/** EventBus params for `camera/shake`. */
export interface CameraShakeParams extends CameraShakeOptions {}

/** EventBus params for `camera/move`. */
export interface CameraMoveParams {
  x: number;
  y: number;
  /** If `true`, values are relative offsets rather than absolute. */
  relative?: boolean;
}

/** EventBus params for `camera/zoom`. */
export interface CameraZoomParams {
  zoom: number;
}

/** EventBus output for `camera/state`. */
export interface CameraStateOutput {
  x: number;
  y: number;
  zoom: number;
  rotation: number;
  viewportWidth: number;
  viewportHeight: number;
}

// ---------------------------------------------------------------------------
// Resize
// ---------------------------------------------------------------------------

/**
 * Params emitted with `renderer/resize` whenever the canvas is resized.
 *
 * Plugins that need to react to viewport size changes (e.g. re-anchoring UI
 * widgets, adjusting effect buffers) should subscribe to this event.
 *
 * @example
 * ```ts
 * core.events.on('myPlugin', 'renderer/resize', ({ width, height }) => {
 *   myOverlay.resize(width, height);
 * });
 * ```
 */
export interface RendererResizeParams {
  /** New canvas width in CSS pixels. */
  width: number;
  /** New canvas height in CSS pixels. */
  height: number;
}
