import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { AchievementPlugin } from '../src/plugins/AchievementPlugin.js';
import type { Core } from '../src/core/Core.js';
import type {
  AchievementDef,
  AchievementGetOutput,
  AchievementListOutput,
  AchievementUnlockedParams,
} from '../src/types/achievement.js';

function createCoreStub() {
  const events = new EventBus();
  return { core: { events } as unknown as Core };
}

function makeAchievement(overrides: Partial<AchievementDef> = {}): AchievementDef {
  return { id: 'test_ach', name: 'Test Achievement', description: 'A test achievement.', threshold: 1, ...overrides };
}

describe('AchievementPlugin', () => {
  let core: Core;
  let plugin: AchievementPlugin;

  beforeEach(() => {
    ({ core } = createCoreStub());
    plugin = new AchievementPlugin();
    plugin.init(core);
  });

  describe('achievement/define', () => {
    it('registers an achievement', () => {
      core.events.emitSync('achievement/define', { achievement: makeAchievement({ id: 'a1' }) });
      const { output } = core.events.emitSync<object, AchievementGetOutput>('achievement/get', { id: 'a1' });
      expect(output.achievement).not.toBeNull();
      expect(output.achievement!.id).toBe('a1');
    });

    it('starts with progress 0 and unlocked false', () => {
      core.events.emitSync('achievement/define', { achievement: makeAchievement({ id: 'a2', threshold: 5 }) });
      const { output } = core.events.emitSync<object, AchievementGetOutput>('achievement/get', { id: 'a2' });
      expect(output.achievement!.progress).toBe(0);
      expect(output.achievement!.unlocked).toBe(false);
      expect(output.achievement!.threshold).toBe(5);
    });
  });

  describe('achievement/unlock', () => {
    it('unlocks an achievement manually', () => {
      core.events.emitSync('achievement/define', { achievement: makeAchievement({ id: 'man' }) });
      core.events.emitSync('achievement/unlock', { id: 'man' });
      const { output } = core.events.emitSync<object, AchievementGetOutput>('achievement/get', { id: 'man' });
      expect(output.achievement!.unlocked).toBe(true);
      expect(output.achievement!.unlockedAt).not.toBeNull();
    });

    it('emits achievement/unlocked notification', () => {
      const unlocked: AchievementUnlockedParams[] = [];
      core.events.on('t', 'achievement/unlocked', (p: AchievementUnlockedParams) => unlocked.push(p));
      core.events.emitSync('achievement/define', { achievement: makeAchievement({ id: 'note' }) });
      core.events.emitSync('achievement/unlock', { id: 'note' });
      expect(unlocked).toHaveLength(1);
      expect(unlocked[0]!.id).toBe('note');
    });

    it('does not emit again if already unlocked', () => {
      const unlocked: AchievementUnlockedParams[] = [];
      core.events.on('t', 'achievement/unlocked', (p: AchievementUnlockedParams) => unlocked.push(p));
      core.events.emitSync('achievement/define', { achievement: makeAchievement({ id: 'dup' }) });
      core.events.emitSync('achievement/unlock', { id: 'dup' });
      core.events.emitSync('achievement/unlock', { id: 'dup' });
      expect(unlocked).toHaveLength(1);
    });

    it('is a no-op for unknown ids', () => {
      expect(() => core.events.emitSync('achievement/unlock', { id: 'ghost' })).not.toThrow();
    });
  });

  describe('achievement/progress', () => {
    it('increments progress counter', () => {
      core.events.emitSync('achievement/define', { achievement: makeAchievement({ id: 'prog', threshold: 3 }) });
      core.events.emitSync('achievement/progress', { id: 'prog', amount: 1 });
      core.events.emitSync('achievement/progress', { id: 'prog', amount: 1 });
      const { output } = core.events.emitSync<object, AchievementGetOutput>('achievement/get', { id: 'prog' });
      expect(output.achievement!.progress).toBe(2);
      expect(output.achievement!.unlocked).toBe(false);
    });

    it('unlocks when progress reaches threshold', () => {
      core.events.emitSync('achievement/define', { achievement: makeAchievement({ id: 'threshold', threshold: 3 }) });
      core.events.emitSync('achievement/progress', { id: 'threshold', amount: 3 });
      const { output } = core.events.emitSync<object, AchievementGetOutput>('achievement/get', { id: 'threshold' });
      expect(output.achievement!.unlocked).toBe(true);
    });

    it('defaults amount to 1', () => {
      core.events.emitSync('achievement/define', { achievement: makeAchievement({ id: 'def', threshold: 2 }) });
      core.events.emitSync('achievement/progress', { id: 'def' });
      const { output } = core.events.emitSync<object, AchievementGetOutput>('achievement/get', { id: 'def' });
      expect(output.achievement!.progress).toBe(1);
    });

    it('ignores progress on already-unlocked achievements', () => {
      core.events.emitSync('achievement/define', { achievement: makeAchievement({ id: 'al', threshold: 5 }) });
      core.events.emitSync('achievement/unlock', { id: 'al' });
      core.events.emitSync('achievement/progress', { id: 'al', amount: 99 });
      const { output } = core.events.emitSync<object, AchievementGetOutput>('achievement/get', { id: 'al' });
      // Manual unlock sets progress to threshold to keep state coherent;
      // subsequent progress calls on an already-unlocked achievement are ignored.
      expect(output.achievement!.progress).toBe(5);
    });
  });

  describe('triggerEvent', () => {
    it('auto-increments progress when triggerEvent fires', () => {
      core.events.emitSync('achievement/define', { achievement: makeAchievement({ id: 'kill', threshold: 3, triggerEvent: 'enemy/killed' }) });
      core.events.emitSync('enemy/killed', { id: 'e1' });
      core.events.emitSync('enemy/killed', { id: 'e2' });
      const { output } = core.events.emitSync<object, AchievementGetOutput>('achievement/get', { id: 'kill' });
      expect(output.achievement!.progress).toBe(2);
    });

    it('unlocks when trigger event fires enough times', () => {
      core.events.emitSync('achievement/define', { achievement: makeAchievement({ id: 'first_kill', threshold: 1, triggerEvent: 'enemy/killed' }) });
      core.events.emitSync('enemy/killed', { id: 'e1' });
      const { output } = core.events.emitSync<object, AchievementGetOutput>('achievement/get', { id: 'first_kill' });
      expect(output.achievement!.unlocked).toBe(true);
    });

    it('respects triggerFilter', () => {
      core.events.emitSync('achievement/define', {
        achievement: makeAchievement({ id: 'boss_kill', threshold: 1, triggerEvent: 'enemy/killed', triggerFilter: (p) => (p as { isBoss?: boolean }).isBoss === true }),
      });
      core.events.emitSync('enemy/killed', { id: 'minion', isBoss: false });
      let { output } = core.events.emitSync<object, AchievementGetOutput>('achievement/get', { id: 'boss_kill' });
      expect(output.achievement!.progress).toBe(0);
      core.events.emitSync('enemy/killed', { id: 'boss', isBoss: true });
      ({ output } = core.events.emitSync<object, AchievementGetOutput>('achievement/get', { id: 'boss_kill' }));
      expect(output.achievement!.unlocked).toBe(true);
    });
  });

  describe('achievement/reset', () => {
    it('resets progress and unlocked state', () => {
      core.events.emitSync('achievement/define', { achievement: makeAchievement({ id: 'res' }) });
      core.events.emitSync('achievement/unlock', { id: 'res' });
      core.events.emitSync('achievement/reset', { id: 'res' });
      const { output } = core.events.emitSync<object, AchievementGetOutput>('achievement/get', { id: 'res' });
      expect(output.achievement!.progress).toBe(0);
      expect(output.achievement!.unlocked).toBe(false);
    });
  });

  describe('achievement/get and achievement/list', () => {
    it('get returns null for unknown id', () => {
      const { output } = core.events.emitSync<object, AchievementGetOutput>('achievement/get', { id: 'unknown' });
      expect(output.achievement).toBeNull();
    });

    it('list returns all defined achievements', () => {
      core.events.emitSync('achievement/define', { achievement: makeAchievement({ id: 'x1' }) });
      core.events.emitSync('achievement/define', { achievement: makeAchievement({ id: 'x2' }) });
      const { output } = core.events.emitSync<object, AchievementListOutput>('achievement/list', {});
      expect(output.achievements.map((a) => a.id)).toContain('x1');
      expect(output.achievements.map((a) => a.id)).toContain('x2');
    });
  });

  describe('save/load integration', () => {
    it('saves achievement progress in slot data', () => {
      core.events.emitSync('achievement/define', { achievement: makeAchievement({ id: 'save_me', threshold: 3 }) });
      core.events.emitSync('achievement/progress', { id: 'save_me', amount: 2 });
      // Simulate SaveManager output from the main phase.
      const saveOutput = { data: { meta: { id: 'slot1', name: 'Slot 1', createdAt: 0, updatedAt: 0 }, data: {} }, saved: false };
      core.events.emitSync('save/slot:save', { id: 'slot1' }, saveOutput);
      const persisted = saveOutput.data.data['_achievements'] as { data: Record<string, unknown> };
      expect(persisted).toBeDefined();
      const entry = persisted.data['save_me'] as { progress: number; unlockedAt: string | null };
      expect(entry.progress).toBe(2);
    });

    it('restores achievement state from slot data', () => {
      core.events.emitSync('achievement/define', { achievement: makeAchievement({ id: 'load_me', threshold: 5 }) });
      const loadOutput = {
        raw: { meta: { id: 'slot1', name: 'Slot 1', createdAt: 0, updatedAt: 0 }, data: { _achievements: { data: { load_me: { progress: 3, unlockedAt: null } } } } },
        loaded: true,
      };
      core.events.emitSync('save/slot:load', { id: 'slot1' }, loadOutput);
      const { output } = core.events.emitSync<object, AchievementGetOutput>('achievement/get', { id: 'load_me' });
      expect(output.achievement!.progress).toBe(3);
    });
  });

  describe('direct accessors', () => {
    it('getState returns null for unknown id', () => {
      expect(plugin.getState('nope')).toBeNull();
    });

    it('listStates returns all defined achievements', () => {
      core.events.emitSync('achievement/define', { achievement: makeAchievement({ id: 's1' }) });
      core.events.emitSync('achievement/define', { achievement: makeAchievement({ id: 's2' }) });
      expect(plugin.listStates().map((s) => s.id)).toContain('s1');
    });
  });

  describe('destroy', () => {
    it('removes listeners', () => {
      core.events.emitSync('achievement/define', { achievement: makeAchievement({ id: 'ddel' }) });
      plugin.destroy(core);
      const { output } = core.events.emitSync<object, Partial<AchievementGetOutput>>('achievement/get', { id: 'ddel' });
      expect(output.achievement).toBeUndefined();
    });
  });
});
