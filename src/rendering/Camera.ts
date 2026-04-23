import type { Container } from 'pixi.js';
import type { Core } from '../core/Core.js';
import type {
  CameraRect,
  CameraTarget,
  CameraFollowOptions,
  CameraShakeOptions,
  CameraFollowParams,
  CameraShakeParams,
  CameraMoveParams,
  CameraZoomParams,
  CameraStateOutput,
  RendererPreRenderParams,
  CoreUpdateParams,
} from '../types/rendering.js';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------

/**
 * 2D camera that manipulates a world container's transform to simulate
 * viewport movement, zooming, rotation, and screen shake.
 *
 * The camera works by moving the **world layer** in the opposite direction
 * of the logical camera position, so the coordinate system for game objects
 * remains unchanged.
 *
 * ### Quick start
 * ```ts
 * const camera = new Camera(core, renderer.getLayer('world'), {
 *   viewportWidth: 1280,
 *   viewportHeight: 720,
 * });
 *
 * camera.follow(player, { lerp: 0.08, deadzone: { width: 64, height: 64 } });
 * camera.setBounds({ x: 0, y: 0, width: 4096, height: 4096 });
 * ```
 *
 * ### EventBus API
 * | Event               | Params                   | Description              |
 * |---------------------|--------------------------|--------------------------|
 * | `camera/follow`     | `CameraFollowParams`     | Set or clear follow      |
 * | `camera/shake`      | `CameraShakeParams`      | Trigger screen shake     |
 * | `camera/move`       | `CameraMoveParams`       | Move to / offset by      |
 * | `camera/zoom`       | `CameraZoomParams`       | Set zoom level           |
 * | `camera/state`      | `{}`                     | Read current state (output) |
 */
export class Camera {
  private readonly _core: Core;
  private readonly _worldContainer: Container;

  // Viewport dimensions (screen space).
  private _viewportW: number;
  private _viewportH: number;

  // Logical camera position (world-space centre).
  private _x = 0;
  private _y = 0;
  private _zoom = 1;
  private _rotation = 0;

  // Follow target.
  private _target: CameraTarget | null = null;
  private _followLerp = 0.1;
  private _deadzone: { width: number; height: number } | null = null;
  private _followOffset = { x: 0, y: 0 };

  // World bounds (null = unconstrained).
  private _bounds: CameraRect | null = null;

  // Screen shake state.
  private _shakeIntensity = 0;
  private _shakeDuration = 0;
  private _shakeElapsed = 0;
  private _shakeDecay: 'linear' | 'exponential' = 'exponential';
  private _shakeOffsetX = 0;
  private _shakeOffsetY = 0;

  constructor(
    core: Core,
    worldContainer: Container,
    opts: {
      viewportWidth: number;
      viewportHeight: number;
      /**
       * Initial camera X position in world coordinates.
       *
       * The camera displays whatever world-space point `(initialX, initialY)`
       * sits at the **centre** of the viewport.  Defaults to `0`.
       *
       * **Tip — top-left origin games**: if your game treats the top-left corner
       * of the world as `(0, 0)` (most non-tilemap games), pass
       * `initialX: viewportWidth / 2, initialY: viewportHeight / 2`.  This
       * ensures world `(0, 0)` appears at the top-left corner of the screen
       * when the game starts.
       */
      initialX?: number;
      /**
       * Initial camera Y position in world coordinates.  See `initialX`.
       * Defaults to `0`.
       */
      initialY?: number;
    },
  ) {
    this._core = core;
    this._worldContainer = worldContainer;
    this._viewportW = opts.viewportWidth;
    this._viewportH = opts.viewportHeight;
    this._x = opts.initialX ?? 0;
    this._y = opts.initialY ?? 0;

    // Subscribe to fixed update (follow + shake advance).
    core.events.on('camera', 'core/update', this._onUpdate, { priority: 0 });

    // Subscribe to pre-render (apply transform with interpolation-friendly timing).
    core.events.on('camera', 'renderer/pre-render', this._onPreRender, { priority: 0 });

    // ── EventBus public API ──────────────────────────────────────────────
    core.events.on('camera', 'camera/follow', (p: CameraFollowParams) => {
      if (p.target) {
        this.follow(p.target, p.options);
      } else {
        this.unfollow();
      }
    });

    core.events.on('camera', 'camera/shake', (p: CameraShakeParams) => {
      this.shake(p);
    });

    core.events.on('camera', 'camera/move', (p: CameraMoveParams) => {
      if (p.relative) {
        this.moveBy(p.x, p.y);
      } else {
        this.moveTo(p.x, p.y);
      }
    });

    core.events.on('camera', 'camera/zoom', (p: CameraZoomParams) => {
      this.setZoom(p.zoom);
    });

    core.events.on(
      'camera',
      'camera/state',
      (_p: Record<string, never>, output: CameraStateOutput) => {
        output.x = this._x;
        output.y = this._y;
        output.zoom = this._zoom;
        output.rotation = this._rotation;
        output.viewportWidth = this._viewportW;
        output.viewportHeight = this._viewportH;
      },
    );
  }

  // ---------------------------------------------------------------------------
  // Public API — position
  // ---------------------------------------------------------------------------

  get x(): number { return this._x; }
  get y(): number { return this._y; }

  moveTo(x: number, y: number): void {
    this._x = x;
    this._y = y;
    this._clampToBounds();
  }

  moveBy(dx: number, dy: number): void {
    this._x += dx;
    this._y += dy;
    this._clampToBounds();
  }

  // ---------------------------------------------------------------------------
  // Public API — zoom & rotation
  // ---------------------------------------------------------------------------

  get zoom(): number { return this._zoom; }

  setZoom(value: number): void {
    this._zoom = Math.max(0.01, value);
    this._clampToBounds();
  }

  get rotation(): number { return this._rotation; }

  setRotation(radians: number): void {
    this._rotation = radians;
  }

  // ---------------------------------------------------------------------------
  // Public API — viewport
  // ---------------------------------------------------------------------------

  get viewportWidth(): number { return this._viewportW; }
  get viewportHeight(): number { return this._viewportH; }

  setViewport(width: number, height: number): void {
    this._viewportW = width;
    this._viewportH = height;
    this._clampToBounds();
  }

  // ---------------------------------------------------------------------------
  // Public API — follow
  // ---------------------------------------------------------------------------

  follow(target: CameraTarget, options?: CameraFollowOptions): void {
    this._target = target;
    this._followLerp = options?.lerp ?? 0.1;
    this._deadzone = options?.deadzone ?? null;
    this._followOffset = options?.offset ?? { x: 0, y: 0 };
  }

  unfollow(): void {
    this._target = null;
  }

  // ---------------------------------------------------------------------------
  // Public API — bounds
  // ---------------------------------------------------------------------------

  setBounds(rect: CameraRect | null): void {
    this._bounds = rect;
    if (rect) this._clampToBounds();
  }

  get bounds(): Readonly<CameraRect> | null {
    return this._bounds;
  }

  // ---------------------------------------------------------------------------
  // Public API — shake
  // ---------------------------------------------------------------------------

  shake(opts: CameraShakeOptions): void {
    this._shakeIntensity = opts.intensity;
    this._shakeDuration = opts.duration;
    this._shakeElapsed = 0;
    this._shakeDecay = opts.decay ?? 'exponential';
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  destroy(): void {
    this._core.events.removeNamespace('camera');
  }

  // ---------------------------------------------------------------------------
  // Private — game logic (fixed step)
  // ---------------------------------------------------------------------------

  private readonly _onUpdate = (params: CoreUpdateParams): void => {
    // ── Follow target ────────────────────────────────────────────────────
    if (this._target) {
      const goalX = this._target.x + this._followOffset.x;
      const goalY = this._target.y + this._followOffset.y;

      if (this._deadzone) {
        const halfW = this._deadzone.width / 2;
        const halfH = this._deadzone.height / 2;
        const dx = goalX - this._x;
        const dy = goalY - this._y;

        // Only move when target exits the deadzone.
        if (Math.abs(dx) > halfW) {
          const edge = dx > 0 ? goalX - halfW : goalX + halfW;
          this._x = lerp(this._x, edge, this._followLerp);
        }
        if (Math.abs(dy) > halfH) {
          const edge = dy > 0 ? goalY - halfH : goalY + halfH;
          this._y = lerp(this._y, edge, this._followLerp);
        }
      } else {
        this._x = lerp(this._x, goalX, this._followLerp);
        this._y = lerp(this._y, goalY, this._followLerp);
      }

      this._clampToBounds();
    }

    // ── Shake advance ────────────────────────────────────────────────────
    if (this._shakeDuration > 0 && this._shakeElapsed < this._shakeDuration) {
      this._shakeElapsed += params.dt;
      const progress = clamp(this._shakeElapsed / this._shakeDuration, 0, 1);
      const factor = this._shakeDecay === 'exponential'
        ? 1 - progress * progress
        : 1 - progress;
      const magnitude = this._shakeIntensity * factor;
      this._shakeOffsetX = (Math.random() * 2 - 1) * magnitude;
      this._shakeOffsetY = (Math.random() * 2 - 1) * magnitude;

      if (this._shakeElapsed >= this._shakeDuration) {
        this._shakeOffsetX = 0;
        this._shakeOffsetY = 0;
      }
    }
  };

  // ---------------------------------------------------------------------------
  // Private — apply transform (render frame)
  // ---------------------------------------------------------------------------

  private readonly _onPreRender = (_params: RendererPreRenderParams): void => {
    const hw = this._viewportW / 2;
    const hh = this._viewportH / 2;

    // Translate so that the camera centre maps to the viewport centre,
    // then apply zoom and rotation around the centre.
    this._worldContainer.x = -this._x * this._zoom + hw + this._shakeOffsetX;
    this._worldContainer.y = -this._y * this._zoom + hh + this._shakeOffsetY;
    this._worldContainer.scale.set(this._zoom);
    this._worldContainer.rotation = -this._rotation;

    // Set the pivot to the camera position so rotation & zoom are relative to
    // the centre of the viewport.
    this._worldContainer.pivot.set(0, 0);
  };

  // ---------------------------------------------------------------------------
  // Private — bounds clamping
  // ---------------------------------------------------------------------------

  private _clampToBounds(): void {
    if (!this._bounds) return;

    const halfViewW = (this._viewportW / this._zoom) / 2;
    const halfViewH = (this._viewportH / this._zoom) / 2;

    const minX = this._bounds.x + halfViewW;
    const maxX = this._bounds.x + this._bounds.width - halfViewW;
    const minY = this._bounds.y + halfViewH;
    const maxY = this._bounds.y + this._bounds.height - halfViewH;

    // If the viewport is larger than the bounds, centre on the bounds.
    if (minX >= maxX) {
      this._x = this._bounds.x + this._bounds.width / 2;
    } else {
      this._x = clamp(this._x, minX, maxX);
    }

    if (minY >= maxY) {
      this._y = this._bounds.y + this._bounds.height / 2;
    } else {
      this._y = clamp(this._y, minY, maxY);
    }
  }
}
