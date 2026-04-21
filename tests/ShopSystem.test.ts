import { describe, it, expect, beforeEach } from 'vitest';
import { EventBus } from '../src/core/EventBus.js';
import { StatsSystem } from '../src/plugins/rpg/StatsSystem.js';
import { InventorySystem } from '../src/plugins/rpg/InventorySystem.js';
import { VariableStoreManager } from '../src/plugins/rpg/VariableStoreManager.js';
import { ShopSystem } from '../src/plugins/rpg/ShopSystem.js';
import type { Core } from '../src/core/Core.js';

function createCore(): Core {
  const core = { events: new EventBus(), dataRoot: '/' } as unknown as Core;
  new StatsSystem().init(core);
  new InventorySystem().init(core);
  new VariableStoreManager().init(core);
  return core;
}

describe('ShopSystem', () => {
  let core: Core;
  let shop: ShopSystem;

  beforeEach(() => {
    core = createCore();
    shop = new ShopSystem();
    shop.init(core);

    // Define items
    core.events.emitSync('inventory/item:define', {
      item: { id: 'potion', name: 'Potion', category: 'item', price: 50, maxStack: 99 },
    });

    // Define shop
    core.events.emitSync('shop/define', {
      shop: {
        id: 'village_shop',
        entries: [{ itemId: 'potion', price: 50 }],
        sellRatio: 0.5,
      },
    });

    // Give player gold
    core.events.emitSync('store/set', { ns: 'player', key: 'gold', value: 500 });
  });

  it('opens shop and returns entries and gold', () => {
    const { output } = core.events.emitSync<object, {
      entries: Array<{ itemId: string; price: number }>;
      gold: number;
    }>('shop/open', { shopId: 'village_shop', customerId: 'hero' });
    expect(output.entries.length).toBe(1);
    expect(output.entries[0].itemId).toBe('potion');
    expect(output.gold).toBe(500);
  });

  it('buys an item and deducts gold', () => {
    core.events.emitSync('shop/open', { shopId: 'village_shop', customerId: 'hero' });
    const { output } = core.events.emitSync<object, { success: boolean; goldSpent: number; newGold: number }>(
      'shop/buy', { shopId: 'village_shop', customerId: 'hero', itemId: 'potion', quantity: 2 }
    );
    expect(output.success).toBe(true);
    expect(output.goldSpent).toBe(100);
    expect(output.newGold).toBe(400);

    const { output: hasOut } = core.events.emitSync<object, { has: boolean }>(
      'inventory/has', { actorId: 'hero', itemId: 'potion', quantity: 2 }
    );
    expect(hasOut.has).toBe(true);
  });

  it('fails to buy when not enough gold', () => {
    core.events.emitSync('store/set', { ns: 'player', key: 'gold', value: 10 });
    core.events.emitSync('shop/open', { shopId: 'village_shop', customerId: 'hero' });
    const { output } = core.events.emitSync<object, { success: boolean; reason: string }>(
      'shop/buy', { shopId: 'village_shop', customerId: 'hero', itemId: 'potion', quantity: 1 }
    );
    expect(output.success).toBe(false);
    expect(output.reason).toBe('insufficient_gold');
  });

  it('fails to buy without an open session', () => {
    const { output } = core.events.emitSync<object, { success: boolean; reason: string }>(
      'shop/buy', { shopId: 'village_shop', customerId: 'hero', itemId: 'potion', quantity: 1 }
    );
    expect(output.success).toBe(false);
    expect(output.reason).toBe('no_active_session');
  });

  it('sells an item and gains gold', () => {
    core.events.emitSync('inventory/add', { actorId: 'hero', itemId: 'potion', quantity: 3 });
    core.events.emitSync('shop/open', { shopId: 'village_shop', customerId: 'hero' });
    const { output } = core.events.emitSync<object, { success: boolean; goldGained: number; newGold: number }>(
      'shop/sell', { shopId: 'village_shop', customerId: 'hero', itemId: 'potion', quantity: 2 }
    );
    expect(output.success).toBe(true);
    expect(output.goldGained).toBe(50); // 2 × floor(50 * 0.5) = 50
    expect(output.newGold).toBe(550);
  });

  it('fails to sell when not owned', () => {
    core.events.emitSync('shop/open', { shopId: 'village_shop', customerId: 'hero' });
    const { output } = core.events.emitSync<object, { success: boolean; reason: string }>(
      'shop/sell', { shopId: 'village_shop', customerId: 'hero', itemId: 'potion', quantity: 1 }
    );
    expect(output.success).toBe(false);
    expect(output.reason).toBe('item_not_owned');
  });

  it('closes the session', () => {
    core.events.emitSync('shop/open', { shopId: 'village_shop', customerId: 'hero' });
    core.events.emitSync('shop/close', { shopId: 'village_shop', customerId: 'hero' });
    // After closing, buy should fail with no_active_session
    const { output } = core.events.emitSync<object, { success: boolean; reason: string }>(
      'shop/buy', { shopId: 'village_shop', customerId: 'hero', itemId: 'potion', quantity: 1 }
    );
    expect(output.reason).toBe('no_active_session');
  });
});
