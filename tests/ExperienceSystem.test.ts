import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { StatsSystem } from '../src/plugins/rpg/StatsSystem.js';
import { ExperienceSystem } from '../src/plugins/rpg/ExperienceSystem.js';
import type { Core } from '../src/core/Core.js';

function createCore(): Core {
  const core = { events: new EventBus(), dataRoot: '/' } as unknown as Core;
  new StatsSystem().init(core);
  return core;
}

const CURVE_ID = 'test_curve';

describe('ExperienceSystem', () => {
  let core: Core;
  let expSys: ExperienceSystem;

  beforeEach(() => {
    core = createCore();
    expSys = new ExperienceSystem();
    expSys.init(core);
    core.events.emitSync('exp/curve:define', {
      curve: { id: CURVE_ID, base: 30, exp: 2, extra: 0, maxLevel: 10 },
    });
  });

  it('starts at level 1 with 0 exp', () => {
    const { output } = core.events.emitSync<{ actorId: string }, { level: number; totalExp: number }>(
      'exp/get', { actorId: 'hero' }
    );
    expect(output.level).toBe(1);
    expect(output.totalExp).toBe(0);
  });

  it('gains exp without leveling up', () => {
    const { output } = core.events.emitSync<object, { level: number; leveledUp: boolean; totalExp: number }>(
      'exp/gain', { actorId: 'hero', curveId: CURVE_ID, amount: 10 }
    );
    expect(output.level).toBe(1);
    expect(output.leveledUp).toBe(false);
    expect(output.totalExp).toBe(10);
  });

  it('levels up when enough exp is gained', () => {
    // level 1 → 2 needs floor(30 * 4) = 120 exp
    const { output } = core.events.emitSync<object, { level: number; leveledUp: boolean }>(
      'exp/gain', { actorId: 'hero', curveId: CURVE_ID, amount: 120 }
    );
    expect(output.level).toBe(2);
    expect(output.leveledUp).toBe(true);
  });

  it('emits exp/levelup notification', () => {
    const levelups: number[] = [];
    core.events.on('test', 'exp/levelup', (p: { newLevel: number }) => {
      levelups.push(p.newLevel);
    });
    core.events.emitSync('exp/gain', { actorId: 'hero', curveId: CURVE_ID, amount: 120 });
    expect(levelups).toContain(2);
  });

  it('can multi-level-up in a single gain', () => {
    // Give enough for level 3: need level2 (120) + level3 (floor(30*9)=270) = 390
    const { output } = core.events.emitSync<object, { level: number }>(
      'exp/gain', { actorId: 'hero', curveId: CURVE_ID, amount: 390 }
    );
    expect(output.level).toBe(3);
  });

  it('exp/set correctly sets level', () => {
    core.events.emitSync('exp/set', { actorId: 'hero', curveId: CURVE_ID, totalExp: 120 });
    const { output } = core.events.emitSync<{ actorId: string }, { level: number }>(
      'exp/get', { actorId: 'hero' }
    );
    expect(output.level).toBe(2);
  });

  it('does not exceed maxLevel', () => {
    core.events.emitSync('exp/gain', { actorId: 'hero', curveId: CURVE_ID, amount: 99999 });
    const { output } = core.events.emitSync<{ actorId: string }, { level: number }>(
      'exp/get', { actorId: 'hero' }
    );
    expect(output.level).toBe(10);
  });

  it('toNextLevel is 0 at maxLevel', () => {
    core.events.emitSync('exp/gain', { actorId: 'hero', curveId: CURVE_ID, amount: 99999 });
    const { output } = core.events.emitSync<{ actorId: string }, { toNextLevel: number }>(
      'exp/get', { actorId: 'hero' }
    );
    expect(output.toNextLevel).toBe(0);
  });
});
