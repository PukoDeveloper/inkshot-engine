import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { SceneManager } from '../src/plugins/scene/SceneManager.js';
import type { Core } from '../src/core/Core.js';
import type { SceneDescriptor, SceneCurrentOutput, SceneChangedParams } from '../src/types/scene.js';

function createStubCore(): Core {
  return { events: new EventBus(), dataRoot: '/' } as unknown as Core;
}

describe('SceneManager', () => {
  let core: Core;
  let sm: SceneManager;

  beforeEach(() => {
    core = createStubCore();
    sm = new SceneManager();
    sm.init(core);
  });

  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------

  it('starts with no active scene', () => {
    expect(sm.currentKey).toBeNull();

    const { output } = core.events.emitSync<Record<string, never>, SceneCurrentOutput>(
      'scene/current',
      {} as Record<string, never>,
    );
    expect(output.key).toBeNull();
  });

  // -------------------------------------------------------------------------
  // scene/register
  // -------------------------------------------------------------------------

  describe('scene/register', () => {
    it('registers a scene so it can be loaded', async () => {
      const enter = vi.fn();
      core.events.emitSync('scene/register', {
        scene: { key: 'level-1', enter },
      });

      await core.events.emit('scene/load', { key: 'level-1' });

      expect(enter).toHaveBeenCalledOnce();
    });

    it('logs a warning and overwrites when registering a duplicate key', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const enter1 = vi.fn();
      const enter2 = vi.fn();

      core.events.emitSync('scene/register', { scene: { key: 'dup', enter: enter1 } });
      core.events.emitSync('scene/register', { scene: { key: 'dup', enter: enter2 } });

      expect(warnSpy).toHaveBeenCalledOnce();
      warnSpy.mockRestore();
    });
  });

  // -------------------------------------------------------------------------
  // scene/load
  // -------------------------------------------------------------------------

  describe('scene/load', () => {
    it('calls enter on the target scene', async () => {
      const enter = vi.fn();
      core.events.emitSync('scene/register', { scene: { key: 'a', enter } });

      await core.events.emit('scene/load', { key: 'a' });

      expect(enter).toHaveBeenCalledOnce();
      expect(sm.currentKey).toBe('a');
    });

    it('calls exit on the previous scene before entering the new one', async () => {
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

      expect(order).toEqual(['a:enter', 'a:exit', 'b:enter']);
    });

    it('throws when loading an unregistered scene key', async () => {
      await expect(
        core.events.emit('scene/load', { key: 'nonexistent' }),
      ).rejects.toThrow(/Scene "nonexistent" is not registered/);
    });

    it('emits scene/changed with correct from/to after transition', async () => {
      const changedHandler = vi.fn();
      core.events.on('test', 'scene/changed', changedHandler);

      core.events.emitSync('scene/register', { scene: { key: 'menu', enter: vi.fn() } });
      core.events.emitSync('scene/register', { scene: { key: 'game', enter: vi.fn() } });

      await core.events.emit('scene/load', { key: 'menu' });

      expect(changedHandler).toHaveBeenCalledWith(
        expect.objectContaining<SceneChangedParams>({ from: null, to: 'menu' }),
        expect.anything(),
        expect.anything(),
      );

      await core.events.emit('scene/load', { key: 'game' });

      expect(changedHandler).toHaveBeenCalledWith(
        expect.objectContaining<SceneChangedParams>({ from: 'menu', to: 'game' }),
        expect.anything(),
        expect.anything(),
      );
    });

    it('passes core to both enter and exit', async () => {
      let enterCore: Core | undefined;
      let exitCore: Core | undefined;

      const sceneA: SceneDescriptor = {
        key: 'a',
        enter: (c) => { enterCore = c; },
        exit: (c) => { exitCore = c; },
      };
      const sceneB: SceneDescriptor = {
        key: 'b',
        enter: vi.fn(),
      };

      core.events.emitSync('scene/register', { scene: sceneA });
      core.events.emitSync('scene/register', { scene: sceneB });

      await core.events.emit('scene/load', { key: 'a' });
      await core.events.emit('scene/load', { key: 'b' });

      expect(enterCore).toBe(core);
      expect(exitCore).toBe(core);
    });

    it('before/after phases of scene/load fire around the transition', async () => {
      const order: string[] = [];

      core.events.on('transitions', 'scene/load', () => { order.push('before'); }, { phase: 'before' });
      core.events.on('transitions', 'scene/load', () => { order.push('after'); }, { phase: 'after' });

      core.events.emitSync('scene/register', {
        scene: {
          key: 'x',
          enter: vi.fn(() => { order.push('enter'); }),
        },
      });

      await core.events.emit('scene/load', { key: 'x' });

      expect(order).toEqual(['before', 'enter', 'after']);
    });
  });

  // -------------------------------------------------------------------------
  // scene/current
  // -------------------------------------------------------------------------

  describe('scene/current', () => {
    it('returns null before any scene is loaded', () => {
      const { output } = core.events.emitSync<Record<string, never>, SceneCurrentOutput>(
        'scene/current',
        {} as Record<string, never>,
      );
      expect(output.key).toBeNull();
    });

    it('reflects the active scene key after a load', async () => {
      core.events.emitSync('scene/register', { scene: { key: 'town', enter: vi.fn() } });
      await core.events.emit('scene/load', { key: 'town' });

      const { output } = core.events.emitSync<Record<string, never>, SceneCurrentOutput>(
        'scene/current',
        {} as Record<string, never>,
      );
      expect(output.key).toBe('town');
    });
  });

  // -------------------------------------------------------------------------
  // destroy()
  // -------------------------------------------------------------------------

  describe('destroy()', () => {
    it('resets state and stops responding to events', async () => {
      const enter = vi.fn();
      core.events.emitSync('scene/register', { scene: { key: 'a', enter } });
      await core.events.emit('scene/load', { key: 'a' });

      sm.destroy(core);

      expect(sm.currentKey).toBeNull();

      // After destroy, emitting scene/load should have no effect.
      enter.mockClear();
      await core.events.emit('scene/load', { key: 'a' }).catch(() => {
        // Event is silently ignored after listeners are removed.
      });
      expect(enter).not.toHaveBeenCalled();
    });
  });
});
