import type { Core } from '../../core/Core.js';
import type { EnginePlugin } from '../../types/plugin.js';
import type {
  ItemDef,
  ItemCategory,
  EquipSlot,
  InventoryItemDefineParams,
  InventoryAddParams,
  InventoryAddOutput,
  InventoryRemoveParams,
  InventoryRemoveOutput,
  InventoryUseParams,
  InventoryUseOutput,
  InventoryEquipParams,
  InventoryEquipOutput,
  InventoryUnequipParams,
  InventoryUnequipOutput,
  InventoryListParams,
  InventoryListOutput,
  InventoryHasParams,
  InventoryHasOutput,
  InventoryItemAddedParams,
  InventoryItemRemovedParams,
  InventoryItemUsedParams,
  InventoryEquippedParams,
  InventoryUnequippedParams,
} from '../../types/inventory.js';
import type {
  SaveSlotSaveOutput,
  SaveSlotLoadOutput,
} from '../../types/save.js';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface ActorBag {
  /** Item stacks keyed by itemId. */
  slots: Map<string, number>;
  /** Equipped items keyed by slot name. */
  equipped: Map<EquipSlot, string>;
}

// ---------------------------------------------------------------------------
// InventorySystem
// ---------------------------------------------------------------------------

/**
 * Plugin that manages **per-actor item inventories** and equipment.
 *
 * ### EventBus API
 *
 * | Event                   | Params / Output                                 |
 * |-------------------------|-------------------------------------------------|
 * | `inventory/item:define` | `InventoryItemDefineParams`                     |
 * | `inventory/add`         | `InventoryAddParams → InventoryAddOutput`       |
 * | `inventory/remove`      | `InventoryRemoveParams → InventoryRemoveOutput` |
 * | `inventory/use`         | `InventoryUseParams → InventoryUseOutput`       |
 * | `inventory/equip`       | `InventoryEquipParams → InventoryEquipOutput`   |
 * | `inventory/unequip`     | `InventoryUnequipParams → InventoryUnequipOutput`|
 * | `inventory/list`        | `InventoryListParams → InventoryListOutput`     |
 * | `inventory/has`         | `InventoryHasParams → InventoryHasOutput`       |
 */
export class InventorySystem implements EnginePlugin {
  readonly namespace = 'inventory';
  readonly dependencies = ['stats'] as const;
  readonly editorMeta = {
    displayName: 'Inventory System',
    icon: 'inventory',
    description: 'Item definitions, per-actor bags, equipment slots, and item usage.',
    events: [
      'inventory/item:define', 'inventory/item:get', 'inventory/add', 'inventory/remove',
      'inventory/use', 'inventory/equip', 'inventory/unequip',
      'inventory/list', 'inventory/has',
    ] as const,
    schemas: {
      item: {
        folder: 'data',
        displayName: 'Item Definition',
      },
    },
  };

  private readonly _items: Map<string, ItemDef> = new Map();
  private readonly _bags: Map<string, ActorBag> = new Map();

  init(core: Core): void {
    core.events.on<InventoryItemDefineParams>(this.namespace, 'inventory/item:define', (p) => {
      this._items.set(p.item.id, p.item);
    });

    // Allow querying a single item def
    core.events.on<{ itemId: string }, { def?: ItemDef }>(this.namespace, 'inventory/item:get', (p, output) => {
      output.def = this._items.get(p.itemId);
    });

    core.events.on<InventoryAddParams, InventoryAddOutput>(this.namespace, 'inventory/add', (p, output) => {
      const qty = p.quantity ?? 1;
      const bag = this._getOrCreateBag(p.actorId);
      const item = this._items.get(p.itemId);
      const maxStack = item?.maxStack ?? 99;
      const current = bag.slots.get(p.itemId) ?? 0;
      const newQty = Math.min(current + qty, maxStack);
      bag.slots.set(p.itemId, newQty);
      output.newQuantity = newQty;
      core.events.emitSync<InventoryItemAddedParams>('inventory/item:added', {
        actorId: p.actorId, itemId: p.itemId, quantity: qty,
      });
    });

    core.events.on<InventoryRemoveParams, InventoryRemoveOutput>(this.namespace, 'inventory/remove', (p, output) => {
      const qty = p.quantity ?? 1;
      const bag = this._bags.get(p.actorId);
      const current = bag?.slots.get(p.itemId) ?? 0;
      if (current < qty) {
        output.success = false;
        output.remaining = current;
        return;
      }
      const remaining = current - qty;
      if (remaining === 0) {
        bag!.slots.delete(p.itemId);
      } else {
        bag!.slots.set(p.itemId, remaining);
      }
      output.success = true;
      output.remaining = remaining;
      core.events.emitSync<InventoryItemRemovedParams>('inventory/item:removed', {
        actorId: p.actorId, itemId: p.itemId, quantity: qty,
      });
    });

    core.events.on<InventoryUseParams, InventoryUseOutput>(this.namespace, 'inventory/use', (p, output) => {
      const item = this._items.get(p.itemId);
      const bag = this._bags.get(p.actorId);
      if (!item || !bag || (bag.slots.get(p.itemId) ?? 0) < 1) {
        output.success = false;
        return;
      }
      const current = bag.slots.get(p.itemId)!;
      if (current <= 1) {
        bag.slots.delete(p.itemId);
      } else {
        bag.slots.set(p.itemId, current - 1);
      }
      output.success = true;
      if (item.useScriptId) {
        core.events.emitSync('script/run', {
          id: item.useScriptId,
          vars: { actorId: p.actorId, targetId: p.targetId, itemId: p.itemId },
        });
      }
      core.events.emitSync<InventoryItemUsedParams>('inventory/item:used', {
        actorId: p.actorId, itemId: p.itemId, targetId: p.targetId,
      });
    });

    core.events.on<InventoryEquipParams, InventoryEquipOutput>(this.namespace, 'inventory/equip', (p, output) => {
      const item = this._items.get(p.itemId);
      if (!item) { output.success = false; return; }
      const bag = this._getOrCreateBag(p.actorId);
      if ((bag.slots.get(p.itemId) ?? 0) < 1) { output.success = false; return; }

      const slot = p.slot ?? this._defaultSlot(item.category);
      const displaced = bag.equipped.get(slot);
      if (displaced) {
        bag.slots.set(displaced, (bag.slots.get(displaced) ?? 0) + 1);
      }
      const current = bag.slots.get(p.itemId)!;
      if (current <= 1) {
        bag.slots.delete(p.itemId);
      } else {
        bag.slots.set(p.itemId, current - 1);
      }
      bag.equipped.set(slot, p.itemId);
      output.success = true;
      output.displaced = displaced;
      if (item.equipModifiers) {
        core.events.emitSync('stats/modifier:add', {
          actorId: p.actorId,
          source: `equip:${slot}`,
          modifiers: item.equipModifiers,
        });
      }
      core.events.emitSync<InventoryEquippedParams>('inventory/equipped', {
        actorId: p.actorId, itemId: p.itemId, slot, displaced,
      });
    });

    core.events.on<InventoryUnequipParams, InventoryUnequipOutput>(this.namespace, 'inventory/unequip', (p, output) => {
      const bag = this._bags.get(p.actorId);
      const itemId = bag?.equipped.get(p.slot);
      if (!itemId) { output.success = false; return; }
      bag!.equipped.delete(p.slot);
      bag!.slots.set(itemId, (bag!.slots.get(itemId) ?? 0) + 1);
      output.success = true;
      output.itemId = itemId;
      core.events.emitSync('stats/modifier:remove', {
        actorId: p.actorId,
        source: `equip:${p.slot}`,
      });
      core.events.emitSync<InventoryUnequippedParams>('inventory/unequipped', {
        actorId: p.actorId, slot: p.slot, itemId,
      });
    });

    core.events.on<InventoryListParams, InventoryListOutput>(this.namespace, 'inventory/list', (p, output) => {
      const bag = this._bags.get(p.actorId);
      output.slots = bag
        ? [...bag.slots.entries()].map(([itemId, quantity]) => ({ itemId, quantity }))
        : [];
      output.equipped = bag
        ? (Object.fromEntries(bag.equipped) as Record<EquipSlot, string>)
        : ({} as Record<EquipSlot, string>);
    });

    core.events.on<InventoryHasParams, InventoryHasOutput>(this.namespace, 'inventory/has', (p, output) => {
      const bag = this._bags.get(p.actorId);
      const qty = bag?.slots.get(p.itemId) ?? 0;
      output.quantity = qty;
      output.has = qty >= (p.quantity ?? 1);
    });

    // Persist inventory to save slots
    core.events.on<Record<string, never>, SaveSlotSaveOutput>(
      this.namespace, 'save/slot:save',
      (_p, output) => {
        if (!output.data) return;
        const persisted: Record<string, { slots: [string, number][]; equipped: [string, string][] }> = {};
        for (const [actorId, bag] of this._bags) {
          persisted[actorId] = {
            slots: [...bag.slots.entries()],
            equipped: [...bag.equipped.entries()],
          };
        }
        output.data.data['_inventory'] = persisted;
      },
      { phase: 'after' },
    );

    core.events.on<Record<string, never>, SaveSlotLoadOutput>(
      this.namespace, 'save/slot:load',
      (_p, output) => {
        if (!output.raw?.data['_inventory']) return;
        const persisted = output.raw.data['_inventory'] as Record<string, { slots: [string, number][]; equipped: [string, string][] }>;
        this._bags.clear();
        for (const [actorId, bag] of Object.entries(persisted)) {
          this._bags.set(actorId, {
            slots: new Map(bag.slots),
            equipped: new Map(bag.equipped) as Map<EquipSlot, string>,
          });
        }
      },
      { phase: 'after' },
    );
  }

  destroy(core: Core): void {
    core.events.removeNamespace(this.namespace);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private _getOrCreateBag(actorId: string): ActorBag {
    if (!this._bags.has(actorId)) {
      this._bags.set(actorId, { slots: new Map(), equipped: new Map() });
    }
    return this._bags.get(actorId)!;
  }

  private _defaultSlot(category: ItemCategory): EquipSlot {
    switch (category) {
      case 'weapon': return 'weapon';
      case 'armor': return 'body';
      case 'accessory': return 'accessory1';
      default: return 'body';
    }
  }
}
