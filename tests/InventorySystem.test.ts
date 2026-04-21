import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { StatsSystem } from '../src/plugins/rpg/StatsSystem.js';
import { InventorySystem } from '../src/plugins/rpg/InventorySystem.js';
import type { Core } from '../src/core/Core.js';

function createCore(): Core {
  const core = { events: new EventBus(), dataRoot: '/' } as unknown as Core;
  new StatsSystem().init(core);
  return core;
}

describe('InventorySystem', () => {
  let core: Core;
  let inv: InventorySystem;

  beforeEach(() => {
    core = createCore();
    inv = new InventorySystem();
    inv.init(core);
    core.events.emitSync('inventory/item:define', {
      item: { id: 'potion', name: 'Potion', category: 'item', price: 50, maxStack: 99 },
    });
    core.events.emitSync('inventory/item:define', {
      item: {
        id: 'sword',
        name: 'Iron Sword',
        category: 'weapon',
        price: 200,
        maxStack: 1,
        equipModifiers: [{ stat: 'atk', value: 15, mode: 'add' }],
      },
    });
  });

  it('adds items to inventory', () => {
    core.events.emitSync('inventory/add', { actorId: 'hero', itemId: 'potion', quantity: 3 });
    const { output } = core.events.emitSync<{ actorId: string; itemId: string; quantity: number }, { has: boolean; quantity: number }>(
      'inventory/has', { actorId: 'hero', itemId: 'potion', quantity: 3 }
    );
    expect(output.has).toBe(true);
    expect(output.quantity).toBe(3);
  });

  it('removes items from inventory', () => {
    core.events.emitSync('inventory/add', { actorId: 'hero', itemId: 'potion', quantity: 5 });
    const { output } = core.events.emitSync<object, { success: boolean; remaining: number }>(
      'inventory/remove', { actorId: 'hero', itemId: 'potion', quantity: 2 }
    );
    expect(output.success).toBe(true);
    expect(output.remaining).toBe(3);
  });

  it('fails to remove more than owned', () => {
    core.events.emitSync('inventory/add', { actorId: 'hero', itemId: 'potion', quantity: 1 });
    const { output } = core.events.emitSync<object, { success: boolean }>(
      'inventory/remove', { actorId: 'hero', itemId: 'potion', quantity: 5 }
    );
    expect(output.success).toBe(false);
  });

  it('equips weapon and applies stat modifiers', () => {
    core.events.emitSync('stats/base:set', { actorId: 'hero', patch: { atk: 10 } });
    core.events.emitSync('inventory/add', { actorId: 'hero', itemId: 'sword', quantity: 1 });
    const { output: equipOut } = core.events.emitSync<object, { success: boolean }>(
      'inventory/equip', { actorId: 'hero', itemId: 'sword', slot: 'weapon' }
    );
    expect(equipOut.success).toBe(true);

    const { output: statsOut } = core.events.emitSync<{ actorId: string }, { stats: Record<string, number> }>(
      'stats/compute', { actorId: 'hero' }
    );
    expect(statsOut.stats.atk).toBe(25); // 10 base + 15 from sword
  });

  it('unequips weapon and removes stat modifiers', () => {
    core.events.emitSync('stats/base:set', { actorId: 'hero', patch: { atk: 10 } });
    core.events.emitSync('inventory/add', { actorId: 'hero', itemId: 'sword', quantity: 1 });
    core.events.emitSync('inventory/equip', { actorId: 'hero', itemId: 'sword', slot: 'weapon' });
    core.events.emitSync('inventory/unequip', { actorId: 'hero', slot: 'weapon' });

    const { output } = core.events.emitSync<{ actorId: string }, { stats: Record<string, number> }>(
      'stats/compute', { actorId: 'hero' }
    );
    expect(output.stats.atk).toBe(10); // back to base
  });

  it('lists inventory slots', () => {
    core.events.emitSync('inventory/add', { actorId: 'hero', itemId: 'potion', quantity: 2 });
    const { output } = core.events.emitSync<object, { slots: Array<{ itemId: string; quantity: number }> }>(
      'inventory/list', { actorId: 'hero' }
    );
    const potionSlot = output.slots.find((s) => s.itemId === 'potion');
    expect(potionSlot?.quantity).toBe(2);
  });
});
