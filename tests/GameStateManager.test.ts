import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { GameStateManager } from '../src/plugins/gameplay/GameStateManager.js';
import type { Core } from '../src/core/Core.js';
import type { GameStateGetOutput, GamePhase } from '../src/types/game.js';
import type { SaveSlotLoadOutput } from '../src/types/save.js';

function createStubCore(): Core {
  return { events: new EventBus(), dataRoot: '/' } as unknown as Core;
}

describe('GameStateManager', () => {
  let core: Core;
  let gsm: GameStateManager;

  beforeEach(() => {
    core = createStubCore();
    gsm = new GameStateManager();
    gsm.init(core);
  });

  // -------------------------------------------------------------------------
  // Initial state
  // -------------------------------------------------------------------------

  it('starts in the "none" state', () => {
    expect(gsm.state).toBe('none');

    const { output } = core.events.emitSync<Record<string, never>, GameStateGetOutput>(
      'game/state:get',
      {} as Record<string, never>,
    );
    expect(output.state).toBe('none');
  });

  // -------------------------------------------------------------------------
  // State transitions
  // -------------------------------------------------------------------------

  describe('game/state:set', () => {
    const phases: GamePhase[] = ['main-menu', 'playing', 'paused', 'cutscene', 'game-over', 'none'];

    for (const phase of phases) {
      it(`can transition to "${phase}"`, () => {
        core.events.emitSync('game/state:set', { state: phase });
        expect(gsm.state).toBe(phase);
      });
    }
  });

  // -------------------------------------------------------------------------
  // game/state:get via EventBus
  // -------------------------------------------------------------------------

  describe('game/state:get', () => {
    it('reflects the current state', () => {
      core.events.emitSync('game/state:set', { state: 'playing' });

      const { output } = core.events.emitSync<Record<string, never>, GameStateGetOutput>(
        'game/state:get',
        {} as Record<string, never>,
      );

      expect(output.state).toBe('playing');
    });
  });

  // -------------------------------------------------------------------------
  // Auto-transition after save/slot:load
  // -------------------------------------------------------------------------

  describe('auto-transition on save/slot:load', () => {
    it('resets to "playing" and emits game/started after a successful load', async () => {
      core.events.emitSync('game/state:set', { state: 'game-over' });

      const startedHandler = vi.fn();
      core.events.on('test', 'game/started', startedHandler);

      // Simulate env plugin providing raw data in the before phase.
      core.events.on('env', 'save/slot:load', (_p, output: SaveSlotLoadOutput) => {
        output.raw = {
          meta: { id: 's1', name: 's1', createdAt: 0, updatedAt: 0 },
          data: {},
        };
        output.loaded = false; // SaveManager will overwrite this in main phase.
      }, { phase: 'before' });

      // We also need the SaveManager-like behaviour to set loaded=true.
      // Register a minimal main-phase handler to set loaded.
      core.events.on('stub', 'save/slot:load', (_p, output: SaveSlotLoadOutput) => {
        if (output.raw) output.loaded = true;
      });

      await core.events.emit('save/slot:load', { id: 's1' });

      expect(gsm.state).toBe('playing');
      expect(startedHandler).toHaveBeenCalled();
    });

    it('does NOT transition when load fails (output.loaded is false)', async () => {
      core.events.emitSync('game/state:set', { state: 'main-menu' });

      await core.events.emit('save/slot:load', { id: 'missing' });

      expect(gsm.state).toBe('main-menu');
    });
  });

  // -------------------------------------------------------------------------
  // destroy()
  // -------------------------------------------------------------------------

  describe('destroy()', () => {
    it('resets state to "none" and stops responding to events', () => {
      core.events.emitSync('game/state:set', { state: 'playing' });
      gsm.destroy(core);

      expect(gsm.state).toBe('none');

      // Emitting should no longer affect the manager.
      core.events.emitSync('game/state:set', { state: 'cutscene' });
      expect(gsm.state).toBe('none');
    });
  });
});
