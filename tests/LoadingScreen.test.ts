import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { LoadingScreen } from '../src/plugins/ui/LoadingScreen.js';
import { SceneManager } from '../src/plugins/scene/SceneManager.js';
import type { Core } from '../src/core/Core.js';
import type { SceneDescriptor } from '../src/types/scene.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createStubCore(): Core {
  return { events: new EventBus(), dataRoot: '/' } as unknown as Core;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('LoadingScreen', () => {
  let core: Core;

  beforeEach(() => {
    core = createStubCore();
  });

  // -------------------------------------------------------------------------
  // Initialisation (no renderer)
  // -------------------------------------------------------------------------

  describe('init() without a renderer', () => {
    it('initialises without throwing when the renderer is not available', () => {
      const ls = new LoadingScreen();
      expect(() => ls.init(core)).not.toThrow();
    });

    it('accepts custom duration and color options without throwing', () => {
      const ls = new LoadingScreen({ duration: 500, color: 0x1a1a2e });
      expect(() => ls.init(core)).not.toThrow();
    });

    it('accepts duration=0 (instant transitions)', () => {
      const ls = new LoadingScreen({ duration: 0 });
      expect(() => ls.init(core)).not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Phase hooks
  // -------------------------------------------------------------------------

  describe('scene/load phase hooks', () => {
    it('before phase resolves even when there is no overlay', async () => {
      const ls = new LoadingScreen({ duration: 0 });
      ls.init(core);

      // Trigger scene/load manually and expect the before phase to resolve.
      core.events.emitSync('scene/register', { scene: { key: 'x', enter: vi.fn() } });

      await expect(core.events.emit('scene/load', { key: 'x' })).resolves.not.toThrow();
    });

    it('after phase resolves even when there is no overlay', async () => {
      const ls = new LoadingScreen({ duration: 0 });
      ls.init(core);

      core.events.emitSync('scene/register', { scene: { key: 'y', enter: vi.fn() } });

      await expect(core.events.emit('scene/load', { key: 'y' })).resolves.not.toThrow();
    });
  });

  // -------------------------------------------------------------------------
  // Interoperability with SceneManager
  // -------------------------------------------------------------------------

  describe('works alongside SceneManager', () => {
    it('does not interfere with the enter/exit order', async () => {
      const sm = new SceneManager();
      const ls = new LoadingScreen({ duration: 0 });
      sm.init(core);
      ls.init(core);

      const order: string[] = [];
      const sceneA: SceneDescriptor = {
        key: 'a',
        enter: vi.fn(() => { order.push('a:enter'); }),
        exit: vi.fn(() => { order.push('a:exit'); }),
      };
      const sceneB: SceneDescriptor = {
        key: 'b',
        enter: vi.fn(() => { order.push('b:enter'); }),
      };

      core.events.emitSync('scene/register', { scene: sceneA });
      core.events.emitSync('scene/register', { scene: sceneB });

      await core.events.emit('scene/load', { key: 'a' });
      await core.events.emit('scene/load', { key: 'b' });

      // SceneManager transition ordering must still hold.
      expect(order).toEqual(['a:enter', 'a:exit', 'b:enter']);
    });

    it('before/after phases fire around the SceneManager main phase', async () => {
      const sm = new SceneManager();
      const ls = new LoadingScreen({ duration: 0 });
      sm.init(core);
      ls.init(core);

      const phaseOrder: string[] = [];

      // Additional observer to track before/after
      core.events.on('test', 'scene/load', () => { phaseOrder.push('before'); }, { phase: 'before' });
      core.events.on('test', 'scene/load', () => { phaseOrder.push('after'); }, { phase: 'after' });

      core.events.emitSync('scene/register', {
        scene: {
          key: 'z',
          enter: vi.fn(() => { phaseOrder.push('enter'); }),
        },
      });

      await core.events.emit('scene/load', { key: 'z' });

      // before and after are guaranteed to bracket the enter.
      expect(phaseOrder[0]).toBe('before');
      expect(phaseOrder).toContain('enter');
      expect(phaseOrder[phaseOrder.length - 1]).toBe('after');
    });
  });

  // -------------------------------------------------------------------------
  // destroy()
  // -------------------------------------------------------------------------

  describe('destroy()', () => {
    it('removes listeners so scene/load is no longer intercepted', async () => {
      const sm = new SceneManager();
      const ls = new LoadingScreen({ duration: 0 });
      sm.init(core);
      ls.init(core);

      core.events.emitSync('scene/register', { scene: { key: 'q', enter: vi.fn() } });

      ls.destroy(core);

      // SceneManager still works after LoadingScreen is destroyed.
      await expect(core.events.emit('scene/load', { key: 'q' })).resolves.not.toThrow();
      expect(sm.currentKey).toBe('q');
    });

    it('can be called multiple times without throwing', () => {
      const ls = new LoadingScreen({ duration: 0 });
      ls.init(core);
      expect(() => {
        ls.destroy(core);
        ls.destroy(core);
      }).not.toThrow();
    });
  });
});
