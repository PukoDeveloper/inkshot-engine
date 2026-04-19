import type { Container } from 'pixi.js';
import type { Core } from '../core/Core.js';
import type { EnginePlugin } from '../types/plugin.js';
import type { RendererAnimateParams } from '../types/rendering.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface InterpolationState {
  /** Position / transform snapshot from the previous fixed update. */
  prevX: number;
  prevY: number;
  prevRotation: number;
  prevScaleX: number;
  prevScaleY: number;
  /** Position / transform snapshot from the current fixed update. */
  currX: number;
  currY: number;
  currRotation: number;
  currScaleX: number;
  currScaleY: number;
}

// ---------------------------------------------------------------------------
// Animation System plugin
// ---------------------------------------------------------------------------

/**
 * Provides per-object interpolation between fixed-step updates so that
 * movement appears smooth regardless of display refresh rate.
 *
 * ### Register objects
 * ```ts
 * animationSystem.track(sprite);    // start interpolating
 * animationSystem.untrack(sprite);  // stop
 * ```
 *
 * ### How it works
 * 1. During `core/update` (fixed step), the system snapshots every tracked
 *    object's transform into `prev` / `curr` slots.
 * 2. During `renderer/animate`, it linearly interpolates between `prev` and
 *    `curr` using the `alpha` factor and writes the result to the object's
 *    actual transform — producing smooth sub-frame positions.
 *
 * Objects that do NOT need interpolation (static UI, etc.) should simply
 * not be tracked.
 */
export class AnimationSystem implements EnginePlugin {
  readonly namespace = 'animationSystem';

  private _core: Core | null = null;

  /** Map of tracked display objects to their interpolation state. */
  private readonly _tracked: Map<Container, InterpolationState> = new Map();

  // ---------------------------------------------------------------------------
  // Plugin lifecycle
  // ---------------------------------------------------------------------------

  init(core: Core): void {
    this._core = core;

    // Snapshot current transforms at each fixed update.
    core.events.on(this.namespace, 'core/update', this._onUpdate, { priority: -50 });

    // Interpolate transforms each render frame.
    core.events.on(this.namespace, 'renderer/animate', this._onAnimate, { priority: 0 });
  }

  destroy(): void {
    this._tracked.clear();
    this._core?.events.removeNamespace(this.namespace);
    this._core = null;
  }

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Begin interpolating a display object.
   * Its current transform is captured as the initial snapshot.
   */
  track(obj: Container): void {
    if (this._tracked.has(obj)) return;
    this._tracked.set(obj, {
      prevX: obj.x,
      prevY: obj.y,
      prevRotation: obj.rotation,
      prevScaleX: obj.scale.x,
      prevScaleY: obj.scale.y,
      currX: obj.x,
      currY: obj.y,
      currRotation: obj.rotation,
      currScaleX: obj.scale.x,
      currScaleY: obj.scale.y,
    });
  }

  /** Stop interpolating a display object. */
  untrack(obj: Container): void {
    this._tracked.delete(obj);
  }

  /** Check whether an object is currently tracked. */
  isTracked(obj: Container): boolean {
    return this._tracked.has(obj);
  }

  /**
   * Manually snapshot the "current" transform.
   * Call this after teleporting an object so the interpolation doesn't
   * produce a visible glide from the old position.
   */
  snap(obj: Container): void {
    const state = this._tracked.get(obj);
    if (!state) return;
    state.prevX = obj.x;
    state.prevY = obj.y;
    state.prevRotation = obj.rotation;
    state.prevScaleX = obj.scale.x;
    state.prevScaleY = obj.scale.y;
    state.currX = obj.x;
    state.currY = obj.y;
    state.currRotation = obj.rotation;
    state.currScaleX = obj.scale.x;
    state.currScaleY = obj.scale.y;
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  /** Snapshot transforms at each fixed update. */
  private readonly _onUpdate = (): void => {
    for (const [obj, state] of this._tracked) {
      state.prevX = state.currX;
      state.prevY = state.currY;
      state.prevRotation = state.currRotation;
      state.prevScaleX = state.currScaleX;
      state.prevScaleY = state.currScaleY;

      state.currX = obj.x;
      state.currY = obj.y;
      state.currRotation = obj.rotation;
      state.currScaleX = obj.scale.x;
      state.currScaleY = obj.scale.y;
    }
  };

  /** Interpolate transforms each render frame. */
  private readonly _onAnimate = (params: RendererAnimateParams): void => {
    const { alpha } = params;

    for (const [obj, state] of this._tracked) {
      obj.x = state.prevX + (state.currX - state.prevX) * alpha;
      obj.y = state.prevY + (state.currY - state.prevY) * alpha;
      obj.rotation = state.prevRotation + (state.currRotation - state.prevRotation) * alpha;
      obj.scale.x = state.prevScaleX + (state.currScaleX - state.prevScaleX) * alpha;
      obj.scale.y = state.prevScaleY + (state.currScaleY - state.prevScaleY) * alpha;
    }
  };
}
