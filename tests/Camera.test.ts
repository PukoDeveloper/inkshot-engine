import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { Camera } from '../src/rendering/Camera.js';
import type { CameraStateOutput } from '../src/types/rendering.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createContainerStub() {
  return {
    x: 0,
    y: 0,
    rotation: 0,
    scale: { x: 1, y: 1, set(v: number) { this.x = v; this.y = v; } },
    pivot: { x: 0, y: 0, set(px: number, py: number) { this.x = px; this.y = py; } },
  } as unknown as import('pixi.js').Container;
}

function createCoreStub() {
  const events = new EventBus();
  return { events } as unknown as import('../src/core/Core.js').Core;
}

function makeCamera(overrides?: { vpW?: number; vpH?: number }) {
  const core = createCoreStub();
  const world = createContainerStub();
  const camera = new Camera(core, world, {
    viewportWidth: overrides?.vpW ?? 800,
    viewportHeight: overrides?.vpH ?? 600,
  });
  return { core, world, camera };
}

/** Trigger a fixed update. */
function tick(core: ReturnType<typeof createCoreStub>, dt = 16.67) {
  core.events.emitSync('core/update', { dt, tick: 0 });
}

/** Trigger a pre-render. */
function render(core: ReturnType<typeof createCoreStub>) {
  core.events.emitSync('renderer/pre-render', { alpha: 1, delta: 16 });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Camera', () => {
  describe('moveTo / moveBy', () => {
    it('moves to an absolute position', () => {
      const { camera } = makeCamera();
      camera.moveTo(100, 200);
      expect(camera.x).toBe(100);
      expect(camera.y).toBe(200);
    });

    it('moves by a relative offset', () => {
      const { camera } = makeCamera();
      camera.moveTo(50, 50);
      camera.moveBy(10, -20);
      expect(camera.x).toBe(60);
      expect(camera.y).toBe(30);
    });
  });

  describe('zoom', () => {
    it('sets zoom level', () => {
      const { camera } = makeCamera();
      camera.setZoom(2);
      expect(camera.zoom).toBe(2);
    });

    it('clamps zoom to a minimum of 0.01', () => {
      const { camera } = makeCamera();
      camera.setZoom(-5);
      expect(camera.zoom).toBe(0.01);
    });
  });

  describe('rotation', () => {
    it('sets rotation in radians', () => {
      const { camera } = makeCamera();
      camera.setRotation(Math.PI / 4);
      expect(camera.rotation).toBeCloseTo(Math.PI / 4);
    });
  });

  describe('viewport', () => {
    it('reports viewport dimensions', () => {
      const { camera } = makeCamera({ vpW: 1280, vpH: 720 });
      expect(camera.viewportWidth).toBe(1280);
      expect(camera.viewportHeight).toBe(720);
    });

    it('setViewport updates dimensions', () => {
      const { camera } = makeCamera();
      camera.setViewport(1920, 1080);
      expect(camera.viewportWidth).toBe(1920);
      expect(camera.viewportHeight).toBe(1080);
    });
  });

  // -------------------------------------------------------------------------
  // Transform application
  // -------------------------------------------------------------------------

  describe('pre-render transform', () => {
    it('centres the world container at (0, 0) camera position', () => {
      const { core, world } = makeCamera({ vpW: 800, vpH: 600 });
      render(core);

      // Camera at (0, 0), viewport 800×600, zoom 1
      // world.x = -0 * 1 + 400 = 400
      // world.y = -0 * 1 + 300 = 300
      expect(world.x).toBe(400);
      expect(world.y).toBe(300);
    });

    it('translates world opposite to camera movement', () => {
      const { core, world, camera } = makeCamera({ vpW: 800, vpH: 600 });
      camera.moveTo(100, 50);
      render(core);

      expect(world.x).toBe(-100 + 400); // 300
      expect(world.y).toBe(-50 + 300);  // 250
    });

    it('applies zoom scaling', () => {
      const { core, world, camera } = makeCamera({ vpW: 800, vpH: 600 });
      camera.setZoom(2);
      camera.moveTo(100, 50);
      render(core);

      // world.x = -100 * 2 + 400 = 200
      expect(world.x).toBe(200);
      expect(world.scale.x).toBe(2);
      expect(world.scale.y).toBe(2);
    });

    it('applies negative rotation to the container', () => {
      const { core, world, camera } = makeCamera();
      camera.setRotation(Math.PI / 2);
      render(core);
      expect(world.rotation).toBeCloseTo(-Math.PI / 2);
    });
  });

  // -------------------------------------------------------------------------
  // Bounds clamping
  // -------------------------------------------------------------------------

  describe('bounds clamping', () => {
    it('clamps camera position within world bounds', () => {
      const { camera } = makeCamera({ vpW: 800, vpH: 600 });
      camera.setBounds({ x: 0, y: 0, width: 1600, height: 1200 });

      // halfViewW = 400, halfViewH = 300
      // minX=400, maxX=1200, minY=300, maxY=900
      camera.moveTo(0, 0);
      expect(camera.x).toBe(400);
      expect(camera.y).toBe(300);

      camera.moveTo(9999, 9999);
      expect(camera.x).toBe(1200);
      expect(camera.y).toBe(900);
    });

    it('centres when viewport is larger than bounds', () => {
      const { camera } = makeCamera({ vpW: 800, vpH: 600 });
      camera.setBounds({ x: 0, y: 0, width: 400, height: 300 });
      // bounds centre = 200, 150
      camera.moveTo(0, 0);
      expect(camera.x).toBe(200);
      expect(camera.y).toBe(150);
    });

    it('clears bounds when set to null', () => {
      const { camera } = makeCamera({ vpW: 800, vpH: 600 });
      camera.setBounds({ x: 0, y: 0, width: 1600, height: 1200 });
      camera.setBounds(null);
      camera.moveTo(-9999, -9999);
      expect(camera.x).toBe(-9999);
    });

    it('accounts for zoom when clamping', () => {
      const { camera } = makeCamera({ vpW: 800, vpH: 600 });
      camera.setZoom(2);
      // halfViewW = (800/2)/2 = 200, halfViewH = (600/2)/2 = 150
      camera.setBounds({ x: 0, y: 0, width: 1600, height: 1200 });
      camera.moveTo(0, 0);
      expect(camera.x).toBe(200);
      expect(camera.y).toBe(150);
    });
  });

  // -------------------------------------------------------------------------
  // Follow
  // -------------------------------------------------------------------------

  describe('follow', () => {
    it('moves towards target each fixed update (no deadzone)', () => {
      const { core, camera } = makeCamera({ vpW: 800, vpH: 600 });
      const target = { x: 500, y: 400 };
      camera.follow(target, { lerp: 1 }); // instant snap

      tick(core);

      expect(camera.x).toBeCloseTo(500);
      expect(camera.y).toBeCloseTo(400);
    });

    it('smoothly lerps towards target', () => {
      const { core, camera } = makeCamera({ vpW: 800, vpH: 600 });
      const target = { x: 100, y: 0 };
      camera.follow(target, { lerp: 0.5 });

      tick(core);
      // From 0 towards 100 at lerp 0.5 → 50
      expect(camera.x).toBeCloseTo(50);
    });

    it('respects deadzone — no movement when target inside', () => {
      const { core, camera } = makeCamera({ vpW: 800, vpH: 600 });
      camera.moveTo(100, 100);
      const target = { x: 110, y: 105 }; // within 50×50 deadzone
      camera.follow(target, { lerp: 1, deadzone: { width: 50, height: 50 } });

      tick(core);

      // Target offset (10, 5) is within halfW=25, halfH=25 → no movement.
      expect(camera.x).toBe(100);
      expect(camera.y).toBe(100);
    });

    it('moves when target exits deadzone', () => {
      const { core, camera } = makeCamera({ vpW: 800, vpH: 600 });
      camera.moveTo(100, 100);
      const target = { x: 200, y: 100 }; // 100px away, outside 50-wide deadzone
      camera.follow(target, { lerp: 1, deadzone: { width: 50, height: 50 } });

      tick(core);

      // Target exits deadzone horizontally: edge = 200 - 25 = 175
      expect(camera.x).toBeCloseTo(175);
      expect(camera.y).toBe(100); // y stays (within deadzone)
    });

    it('applies follow offset', () => {
      const { core, camera } = makeCamera({ vpW: 800, vpH: 600 });
      const target = { x: 100, y: 100 };
      camera.follow(target, { lerp: 1, offset: { x: 50, y: -20 } });

      tick(core);

      expect(camera.x).toBeCloseTo(150);
      expect(camera.y).toBeCloseTo(80);
    });

    it('unfollow stops tracking', () => {
      const { core, camera } = makeCamera({ vpW: 800, vpH: 600 });
      const target = { x: 500, y: 500 };
      camera.follow(target, { lerp: 1 });
      camera.unfollow();

      tick(core);

      expect(camera.x).toBe(0);
      expect(camera.y).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Screen shake
  // -------------------------------------------------------------------------

  describe('shake', () => {
    it('produces non-zero shake offsets during duration', () => {
      const { core, world, camera } = makeCamera({ vpW: 800, vpH: 600 });
      camera.shake({ intensity: 20, duration: 200 });

      // Run several fixed updates to get past the first frame.
      // Seed randomness is unpredictable, but at least one offset should be non-zero.
      let foundNonZeroOffset = false;
      for (let i = 0; i < 10; i++) {
        tick(core, 16.67);
        render(core);
        // The world container position should deviate from the pure camera value.
        const expectedX = 400; // camera(0,0), vpW/2 = 400
        const expectedY = 300;
        if (world.x !== expectedX || world.y !== expectedY) {
          foundNonZeroOffset = true;
          break;
        }
      }
      expect(foundNonZeroOffset).toBe(true);
    });

    it('offsets return to zero after shake duration expires', () => {
      const { core, world } = makeCamera({ vpW: 800, vpH: 600 });
      const { camera } = makeCamera();

      // Re-create for cleaner test
      const c2 = createCoreStub();
      const w2 = createContainerStub();
      const cam2 = new Camera(c2, w2, { viewportWidth: 800, viewportHeight: 600 });

      cam2.shake({ intensity: 10, duration: 50 });

      // Advance past duration (50ms)
      tick(c2, 60);
      render(c2);

      // After expiry, offsets should be 0 → container at exact centre.
      expect(w2.x).toBe(400);
      expect(w2.y).toBe(300);

      cam2.destroy();
    });
  });

  // -------------------------------------------------------------------------
  // EventBus API
  // -------------------------------------------------------------------------

  describe('EventBus integration', () => {
    it('camera/move moves to absolute position', () => {
      const { core, camera } = makeCamera();
      core.events.emitSync('camera/move', { x: 42, y: 84 });
      expect(camera.x).toBe(42);
      expect(camera.y).toBe(84);
    });

    it('camera/move with relative flag offsets', () => {
      const { core, camera } = makeCamera();
      camera.moveTo(10, 10);
      core.events.emitSync('camera/move', { x: 5, y: -3, relative: true });
      expect(camera.x).toBe(15);
      expect(camera.y).toBe(7);
    });

    it('camera/zoom sets zoom level', () => {
      const { core, camera } = makeCamera();
      core.events.emitSync('camera/zoom', { zoom: 3 });
      expect(camera.zoom).toBe(3);
    });

    it('camera/follow sets follow target', () => {
      const { core, camera } = makeCamera();
      const target = { x: 100, y: 200 };
      core.events.emitSync('camera/follow', { target, options: { lerp: 1 } });
      tick(core);
      expect(camera.x).toBeCloseTo(100);
    });

    it('camera/follow with null target unfollows', () => {
      const { core, camera } = makeCamera();
      camera.follow({ x: 999, y: 999 }, { lerp: 1 });
      core.events.emitSync('camera/follow', { target: null });
      tick(core);
      expect(camera.x).toBe(0);
    });

    it('camera/state returns current state', () => {
      const { core, camera } = makeCamera({ vpW: 1280, vpH: 720 });
      camera.moveTo(100, 200);
      camera.setZoom(1.5);
      camera.setRotation(0.3);

      const { output } = core.events.emitSync('camera/state', {}) as {
        output: CameraStateOutput;
      };

      expect(output.x).toBe(100);
      expect(output.y).toBe(200);
      expect(output.zoom).toBe(1.5);
      expect(output.rotation).toBe(0.3);
      expect(output.viewportWidth).toBe(1280);
      expect(output.viewportHeight).toBe(720);
    });

    it('camera/shake triggers shake', () => {
      const { core, world } = makeCamera({ vpW: 800, vpH: 600 });
      core.events.emitSync('camera/shake', { intensity: 50, duration: 100 });

      let found = false;
      for (let i = 0; i < 5; i++) {
        tick(core, 16.67);
        render(core);
        if (world.x !== 400 || world.y !== 300) {
          found = true;
          break;
        }
      }
      expect(found).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Viewport (setViewport / resize)
  // -------------------------------------------------------------------------

  describe('setViewport', () => {
    it('updates the viewport dimensions', () => {
      const { camera } = makeCamera({ vpW: 800, vpH: 600 });
      expect(camera.viewportWidth).toBe(800);
      expect(camera.viewportHeight).toBe(600);

      camera.setViewport(1920, 1080);

      expect(camera.viewportWidth).toBe(1920);
      expect(camera.viewportHeight).toBe(1080);
    });

    it('reflects new viewport dimensions in camera/state after setViewport', () => {
      const { core, camera } = makeCamera({ vpW: 800, vpH: 600 });
      camera.setViewport(1280, 720);

      const { output } = core.events.emitSync('camera/state', {}) as {
        output: CameraStateOutput;
      };

      expect(output.viewportWidth).toBe(1280);
      expect(output.viewportHeight).toBe(720);
    });

    it('re-centres the world container on pre-render after viewport change', () => {
      const { core, world, camera } = makeCamera({ vpW: 800, vpH: 600 });
      camera.moveTo(0, 0);
      render(core);
      // Before resize: centre = (400, 300).
      expect(world.x).toBe(400);
      expect(world.y).toBe(300);

      camera.setViewport(1280, 720);
      render(core);
      // After resize: centre = (640, 360).
      expect(world.x).toBe(640);
      expect(world.y).toBe(360);
    });

    it('re-clamps position to bounds after viewport change', () => {
      const { camera } = makeCamera({ vpW: 800, vpH: 600 });
      camera.setBounds({ x: 0, y: 0, width: 1000, height: 1000 });
      camera.moveTo(950, 950); // near edge

      // Shrink viewport: halfViewW = 400/zoom = 400; clamped to 600 (1000 - 400).
      camera.setViewport(800, 800);
      // halfViewW = 400; maxX = 1000 - 400 = 600
      expect(camera.x).toBeLessThanOrEqual(600);
    });
  });

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  describe('destroy', () => {
    it('removes all camera event listeners', () => {
      const { core, camera } = makeCamera();
      camera.destroy();

      // camera/move should be a no-op after destroy.
      camera.moveTo(0, 0);
      core.events.emitSync('camera/move', { x: 999, y: 999 });
      expect(camera.x).toBe(0);
    });
  });
});
