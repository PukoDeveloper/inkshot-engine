import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { StatsSystem } from '../src/plugins/rpg/StatsSystem.js';
import type { Core } from '../src/core/Core.js';

function createCore(): Core {
  return { events: new EventBus(), dataRoot: '/' } as unknown as Core;
}

describe('StatsSystem', () => {
  let core: Core;
  let system: StatsSystem;

  beforeEach(() => {
    core = createCore();
    system = new StatsSystem();
    system.init(core);
  });

  it('stores and retrieves base stats', () => {
    core.events.emitSync('stats/base:set', { actorId: 'hero', patch: { hp: 100, atk: 10 } });
    const { output } = core.events.emitSync<{ actorId: string }, { base: Record<string, number> }>(
      'stats/base:get', { actorId: 'hero' }
    );
    expect(output.base.hp).toBe(100);
    expect(output.base.atk).toBe(10);
  });

  it('computes stats with additive modifiers', () => {
    core.events.emitSync('stats/base:set', { actorId: 'hero', patch: { atk: 10 } });
    core.events.emitSync('stats/modifier:add', {
      actorId: 'hero',
      source: 'sword',
      modifiers: [{ stat: 'atk', value: 5, mode: 'add' }],
    });
    const { output } = core.events.emitSync<{ actorId: string }, { stats: Record<string, number> }>(
      'stats/compute', { actorId: 'hero' }
    );
    expect(output.stats.atk).toBe(15);
  });

  it('computes stats with multiply modifiers', () => {
    core.events.emitSync('stats/base:set', { actorId: 'hero', patch: { def: 10 } });
    core.events.emitSync('stats/modifier:add', {
      actorId: 'hero',
      source: 'shield',
      modifiers: [{ stat: 'def', value: 2, mode: 'multiply' }],
    });
    const { output } = core.events.emitSync<{ actorId: string }, { stats: Record<string, number> }>(
      'stats/compute', { actorId: 'hero' }
    );
    expect(output.stats.def).toBe(20);
  });

  it('removes modifier source correctly', () => {
    core.events.emitSync('stats/base:set', { actorId: 'hero', patch: { atk: 10 } });
    core.events.emitSync('stats/modifier:add', {
      actorId: 'hero', source: 'ring',
      modifiers: [{ stat: 'atk', value: 5, mode: 'add' }],
    });
    core.events.emitSync('stats/modifier:remove', { actorId: 'hero', source: 'ring' });
    const { output } = core.events.emitSync<{ actorId: string }, { stats: Record<string, number> }>(
      'stats/compute', { actorId: 'hero' }
    );
    expect(output.stats.atk).toBe(10);
  });

  it('applies and lists status effects', () => {
    core.events.emitSync('stats/status:define', {
      effect: { id: 'poison', name: 'Poison', modifiers: [], duration: 3000 },
    });
    core.events.emitSync('stats/status:apply', { actorId: 'hero', effectId: 'poison' });
    const { output } = core.events.emitSync<{ actorId: string }, { effectIds: string[] }>(
      'stats/status:list', { actorId: 'hero' }
    );
    expect(output.effectIds).toContain('poison');
  });

  it('removes status effects', () => {
    core.events.emitSync('stats/status:define', {
      effect: { id: 'slow', name: 'Slow', modifiers: [], duration: 2000 },
    });
    core.events.emitSync('stats/status:apply', { actorId: 'hero', effectId: 'slow' });
    core.events.emitSync('stats/status:remove', { actorId: 'hero', effectId: 'slow' });
    const { output } = core.events.emitSync<{ actorId: string }, { effectIds: string[] }>(
      'stats/status:list', { actorId: 'hero' }
    );
    expect(output.effectIds).not.toContain('slow');
  });

  it('status effect modifiers are included in compute', () => {
    core.events.emitSync('stats/base:set', { actorId: 'hero', patch: { agi: 10 } });
    core.events.emitSync('stats/status:define', {
      effect: { id: 'para', name: 'Paralysis', modifiers: [{ stat: 'agi', value: 0.5, mode: 'multiply' }] },
    });
    core.events.emitSync('stats/status:apply', { actorId: 'hero', effectId: 'para' });
    const { output } = core.events.emitSync<{ actorId: string }, { stats: Record<string, number> }>(
      'stats/compute', { actorId: 'hero' }
    );
    expect(output.stats.agi).toBe(5);
  });

  it('emits stats/changed when base stats are updated', () => {
    const changes: string[] = [];
    core.events.on('test', 'stats/changed', (p: { actorId: string }) => {
      changes.push(p.actorId);
    });
    core.events.emitSync('stats/base:set', { actorId: 'hero', patch: { hp: 50 } });
    expect(changes).toContain('hero');
  });
});
