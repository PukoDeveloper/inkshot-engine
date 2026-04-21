import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { SpriteAnimator } from '../src/plugins/entity/SpriteAnimator.js';
import type { Entity } from '../src/types/entity.js';
import type { Texture } from 'pixi.js';

// ---------------------------------------------------------------------------
// Stubs
// ---------------------------------------------------------------------------

let textureCounter = 0;
function texStub(): Texture {
  return { _id: textureCounter++ } as unknown as Texture;
}

function createEntityStub(id: string): Entity {
  // Track children by label so that getChildByLabel returns the same sprite
  // after addChild, allowing SpriteAnimator to update its texture in-place
  // rather than creating a new sprite every frame.
  const childrenByLabel = new Map<string, unknown>();

  const display = {
    x: 0, y: 0, label: '', texture: null as unknown,
    getChildByLabel: (label: string) => childrenByLabel.get(label) ?? null,
    addChild: vi.fn((child: { label?: string }) => {
      if (child?.label) childrenByLabel.set(child.label, child);
      return child;
    }),
  };

  return {
    id,
    tags: new Set<string>(),
    display: display as unknown as import('pixi.js').Container,
    position: { x: 0, y: 0 },
    data: new Map(),
    active: true,
  };
}

function createCoreStub() {
  const events = new EventBus();
  return { events } as unknown as import('../src/core/Core.js').Core;
}

/** Emit a single fixed update. */
function tick(core: ReturnType<typeof createCoreStub>, n = 1) {
  for (let i = 0; i < n; i++) {
    core.events.emitSync('core/update', { dt: 16.67, tick: i });
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('SpriteAnimator', () => {
  let core: ReturnType<typeof createCoreStub>;
  let animator: SpriteAnimator;

  beforeEach(() => {
    core = createCoreStub();
    animator = new SpriteAnimator();
    animator.init(core);
    textureCounter = 0;
  });

  // -----------------------------------------------------------------------
  // define
  // -----------------------------------------------------------------------

  describe('define', () => {
    it('registers an animation definition with textures', () => {
      const frames = [texStub(), texStub()];
      animator.define('walk', { frames, frameDuration: 4, loop: true });
      expect(animator.hasDef('walk')).toBe(true);
    });

    it('registers via defineFromKeys (no ResourceManager → textures are undefined)', () => {
      animator.defineFromKeys('idle', {
        frames: ['idle0', 'idle1'],
        frameDuration: 8,
        loop: true,
      });
      expect(animator.hasDef('idle')).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // play / stop / isPlaying
  // -----------------------------------------------------------------------

  describe('play / stop', () => {
    it('starts playback on an entity', () => {
      const frames = [texStub(), texStub()];
      animator.define('walk', { frames, frameDuration: 4, loop: true });
      const entity = createEntityStub('e1');

      animator.play(entity, 'walk');
      expect(animator.isPlaying(entity)).toBe(true);
    });

    it('throws if animation is not defined', () => {
      const entity = createEntityStub('e1');
      expect(() => animator.play(entity, 'nope')).toThrow(/Unknown animation/);
    });

    it('stops playback', () => {
      const frames = [texStub()];
      animator.define('idle', { frames, frameDuration: 4, loop: true });
      const entity = createEntityStub('e1');

      animator.play(entity, 'idle');
      animator.stop(entity);
      expect(animator.isPlaying(entity)).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Frame advancement
  // -----------------------------------------------------------------------

  describe('frame advancement', () => {
    it('advances to next frame after frameDuration ticks', () => {
      const f0 = texStub();
      const f1 = texStub();
      animator.define('walk', { frames: [f0, f1], frameDuration: 2, loop: true });

      const entity = createEntityStub('e1');
      animator.play(entity, 'walk');

      // After play(), the entity should have the first frame applied.
      // The Container fallback path creates a child sprite via addChild.
      const addChild = entity.display.addChild as ReturnType<typeof vi.fn>;

      // Frame 0 applied on play() — addChild called once.
      expect(addChild).toHaveBeenCalledTimes(1);

      // Override the texture property on the specific child sprite instance so
      // we can track exactly what value was assigned, bypassing Pixi's internal
      // texture validation which rejects our plain stub objects.
      const childSprite = addChild.mock.calls[0]![0] as { texture: unknown };
      let trackedTexture: unknown = undefined;
      Object.defineProperty(childSprite, 'texture', {
        get: () => trackedTexture,
        set: (v: unknown) => { trackedTexture = v; },
        configurable: true,
      });

      // 1 tick → still frame 0 (elapsed = 1, frameDuration = 2)
      tick(core, 1);
      expect(trackedTexture).toBeUndefined(); // texture setter not yet called

      // 2nd tick → advance to frame 1 (elapsed wraps)
      tick(core, 1);
      expect(trackedTexture).toBe(f1);
    });

    it('loops back to frame 0 for looping animations', () => {
      const f0 = texStub();
      const f1 = texStub();
      animator.define('walk', { frames: [f0, f1], frameDuration: 1, loop: true });

      const entity = createEntityStub('e1');
      animator.play(entity, 'walk');

      // Capture the child sprite so we can track texture changes.
      const addChild = entity.display.addChild as ReturnType<typeof vi.fn>;
      const childSprite = addChild.mock.calls[0]![0] as import('pixi.js').Sprite;

      // tick 1 → frame 1, tick 2 → frame 0 (loop)
      tick(core, 3);

      // Should still be playing (looping).
      expect(animator.isPlaying(entity)).toBe(true);
      // After 3 ticks with frameDuration=1: frame 1 → frame 0 → frame 1
      // The texture after tick 3 is f1 (odd number of advances from f0).
      // More importantly, verify the loop happened by checking addChild
      // was called only once (texture updates happen in-place on the same sprite).
      expect(addChild).toHaveBeenCalledTimes(1);
      // After an even number of advances the texture returns to f0;
      // tick 2 triggered the loop back — verify with 4 ticks total.
      tick(core, 1);
      expect(childSprite.texture).toBe(f0);
    });

    it('finishes non-looping animation and emits animator/finished', () => {
      const f0 = texStub();
      const f1 = texStub();
      animator.define('attack', { frames: [f0, f1], frameDuration: 1, loop: false });

      const entity = createEntityStub('e1');
      const handler = vi.fn();
      core.events.on('test', 'animator/finished', handler);

      animator.play(entity, 'attack');

      // tick 1 → frame 1, tick 2 → past end → finished
      tick(core, 2);

      expect(animator.isPlaying(entity)).toBe(false);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ entityId: 'e1' }),
        expect.anything(),
        expect.anything(),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Entity destroyed cleanup
  // -----------------------------------------------------------------------

  describe('entity/destroyed cleanup', () => {
    it('removes playback state when entity is destroyed', () => {
      const frames = [texStub()];
      animator.define('idle', { frames, frameDuration: 4, loop: true });
      const entity = createEntityStub('e1');
      animator.play(entity, 'idle');

      core.events.emitSync('entity/destroyed', { entity });

      expect(animator.isPlaying(entity)).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // EventBus API
  // -----------------------------------------------------------------------

  describe('EventBus integration', () => {
    it('animator/define defines via event', () => {
      core.events.emitSync('animator/define', {
        name: 'run',
        def: { frames: ['r0', 'r1'], frameDuration: 4, loop: true },
      });
      expect(animator.hasDef('run')).toBe(true);
    });

    it('animator/play and animator/stop work via events with entity lookup', () => {
      const frames = [texStub()];
      animator.define('idle', { frames, frameDuration: 4, loop: true });

      const entity = createEntityStub('hero');
      animator.setEntityLookup((id) => (id === 'hero' ? entity : undefined));

      core.events.emitSync('animator/play', { entityId: 'hero', animation: 'idle' });
      expect(animator.isPlaying(entity)).toBe(true);

      core.events.emitSync('animator/stop', { entityId: 'hero' });
      expect(animator.isPlaying(entity)).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Plugin destroy
  // -----------------------------------------------------------------------

  describe('plugin destroy', () => {
    it('clears all definitions and playback states', () => {
      animator.define('x', { frames: [texStub()], frameDuration: 1, loop: true });
      const entity = createEntityStub('e');
      animator.play(entity, 'x');

      animator.destroy();

      expect(animator.hasDef('x')).toBe(false);
      expect(animator.isPlaying(entity)).toBe(false);
    });
  });
});
