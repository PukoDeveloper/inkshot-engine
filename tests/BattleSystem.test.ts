import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { StatsSystem } from '../src/plugins/rpg/StatsSystem.js';
import { InventorySystem } from '../src/plugins/rpg/InventorySystem.js';
import { BattleSystem } from '../src/plugins/rpg/BattleSystem.js';
import type { Core } from '../src/core/Core.js';

function createCore(): Core {
  const core = { events: new EventBus(), dataRoot: '/' } as unknown as Core;
  new StatsSystem().init(core);
  new InventorySystem().init(core);
  return core;
}

describe('BattleSystem', () => {
  let core: Core;
  let battle: BattleSystem;

  beforeEach(() => {
    core = createCore();
    battle = new BattleSystem();
    battle.init(core);

    // Set up base stats for combatants
    core.events.emitSync('stats/base:set', { actorId: 'hero', patch: { hp: 100, atk: 20, def: 5, agi: 10 } });
    core.events.emitSync('stats/base:set', { actorId: 'slime', patch: { hp: 30, atk: 5, def: 2, agi: 5 } });
  });

  it('starts a battle and transitions to acting phase', () => {
    const { output } = core.events.emitSync<object, { battleId: string; state: { phase: string } }>(
      'battle/start', {
        party:   [{ id: 'hero', name: 'Hero' }],
        enemies: [{ id: 'slime', name: 'Slime' }],
      }
    );
    expect(output.battleId).toBeTruthy();
    expect(output.state.phase).toBe('acting');
    expect(output.state.turn).toBe(1);
  });

  it('emits battle/started notification', () => {
    const started: string[] = [];
    core.events.on('test', 'battle/started', (p: { battleId: string }) => {
      started.push(p.battleId);
    });
    core.events.emitSync('battle/start', {
      party:   [{ id: 'hero', name: 'Hero' }],
      enemies: [{ id: 'slime', name: 'Slime' }],
    });
    expect(started.length).toBe(1);
  });

  it('queues actions and resolves them', () => {
    const { output: startOut } = core.events.emitSync<object, { battleId: string }>(
      'battle/start', {
        party:   [{ id: 'hero', name: 'Hero' }],
        enemies: [{ id: 'slime', name: 'Slime' }],
      }
    );
    const battleId = startOut.battleId;

    core.events.emitSync('battle/action', {
      battleId,
      action: { actorId: 'hero', kind: 'attack', targetIds: ['slime'] },
    });

    const { output } = core.events.emitSync<{ battleId: string }, { results: unknown[] }>(
      'battle/resolve', { battleId }
    );
    expect(output.results.length).toBe(1);
  });

  it('advances to next turn after resolving (if no one is dead)', () => {
    // Give slime much more HP so it survives
    core.events.emitSync('stats/base:set', { actorId: 'slime', patch: { hp: 9999, atk: 1, def: 100, agi: 5 } });

    const { output: startOut } = core.events.emitSync<object, { battleId: string; state: { turn: number } }>(
      'battle/start', {
        party:   [{ id: 'hero', name: 'Hero' }],
        enemies: [{ id: 'slime', name: 'Slime' }],
      }
    );
    const battleId = startOut.battleId;

    core.events.emitSync('battle/action', {
      battleId,
      action: { actorId: 'hero', kind: 'attack', targetIds: ['slime'] },
    });
    const turnEvents: number[] = [];
    core.events.on('test', 'battle/turn:start', (p: { turn: number }) => {
      turnEvents.push(p.turn);
    });
    core.events.emitSync('battle/resolve', { battleId });
    expect(turnEvents).toContain(2);
  });

  it('emits battle/ended with victory when all enemies are defeated', () => {
    const ended: Array<{ outcome: string }> = [];
    core.events.on('test', 'battle/ended', (p: { outcome: string }) => {
      ended.push(p);
    });

    // Ensure slime has low HP and hero has high atk
    core.events.emitSync('stats/base:set', { actorId: 'hero', patch: { hp: 100, atk: 999, def: 5, agi: 10 } });
    core.events.emitSync('stats/base:set', { actorId: 'slime', patch: { hp: 1, atk: 1, def: 0, agi: 1 } });

    const { output: startOut } = core.events.emitSync<object, { battleId: string }>(
      'battle/start', {
        party:   [{ id: 'hero', name: 'Hero' }],
        enemies: [{ id: 'slime', name: 'Slime' }],
      }
    );
    const battleId = startOut.battleId;

    core.events.emitSync('battle/action', {
      battleId,
      action: { actorId: 'hero', kind: 'attack', targetIds: ['slime'] },
    });
    core.events.emitSync('battle/resolve', { battleId });

    expect(ended.length).toBe(1);
    expect(ended[0].outcome).toBe('victory');
  });

  it('manually ends a battle with escape', () => {
    const ended: Array<{ outcome: string }> = [];
    core.events.on('test', 'battle/ended', (p: { outcome: string }) => ended.push(p));

    const { output: startOut } = core.events.emitSync<object, { battleId: string }>(
      'battle/start', {
        party:   [{ id: 'hero', name: 'Hero' }],
        enemies: [{ id: 'slime', name: 'Slime' }],
      }
    );
    core.events.emitSync('battle/end', { battleId: startOut.battleId, outcome: 'escape' });
    expect(ended[0].outcome).toBe('escape');
  });

  it('battle/state:get returns null for unknown battle', () => {
    const { output } = core.events.emitSync<{ battleId: string }, { state: unknown }>(
      'battle/state:get', { battleId: 'nonexistent' }
    );
    expect(output.state).toBeNull();
  });
});
