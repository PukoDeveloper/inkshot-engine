// ---------------------------------------------------------------------------
// Item category
// ---------------------------------------------------------------------------

/** Broad category of an item — drives game logic (equip slots, use effects). */
export type ItemCategory = 'item' | 'weapon' | 'armor' | 'accessory' | 'key';

// ---------------------------------------------------------------------------
// Item definition
// ---------------------------------------------------------------------------

/**
 * Blueprint for a single inventory item type.
 */
export interface ItemDef {
  /** Unique identifier, e.g. `'potion'`, `'iron-sword'`. */
  readonly id: string;
  /** Display name. */
  readonly name: string;
  /** Brief description shown in UI. */
  readonly description?: string;
  readonly category: ItemCategory;
  /** Default gold buy-price (used by `ShopSystem`). */
  readonly price?: number;
  /** Maximum stack size in a single inventory slot.  Defaults to `99`. */
  readonly maxStack?: number;
  /**
   * Stat modifiers granted when this item is equipped.
   * Only relevant for `'weapon'`, `'armor'`, and `'accessory'` items.
   */
  readonly equipModifiers?: ReadonlyArray<{ stat: string; value: number; mode?: 'add' | 'multiply' }>;
  /**
   * Script ID to run when the item is used (`inventory/use`).
   * Only relevant for `'item'` category.
   */
  readonly useScriptId?: string;
  /** Any additional custom data attached to this item type. */
  readonly [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Inventory slot
// ---------------------------------------------------------------------------

/** A single stack of items inside a character's bag. */
export interface InventorySlot {
  readonly itemId: string;
  quantity: number;
}

// ---------------------------------------------------------------------------
// Equipped items
// ---------------------------------------------------------------------------

/**
 * Named equipment slots.  Games may use any string key; these are the
 * conventional slot names.
 */
export type EquipSlot = 'weapon' | 'shield' | 'head' | 'body' | 'accessory1' | 'accessory2' | string;

// ---------------------------------------------------------------------------
// EventBus params / output
// ---------------------------------------------------------------------------

/** Parameters for `inventory/item:define`. */
export interface InventoryItemDefineParams {
  readonly item: ItemDef;
}

/** Parameters for `inventory/add`. */
export interface InventoryAddParams {
  readonly actorId: string;
  readonly itemId: string;
  readonly quantity?: number;
}

/** Output for `inventory/add`. */
export interface InventoryAddOutput {
  /** New total quantity for that item in the actor's bag. */
  newQuantity: number;
}

/** Parameters for `inventory/remove`. */
export interface InventoryRemoveParams {
  readonly actorId: string;
  readonly itemId: string;
  readonly quantity?: number;
}

/** Output for `inventory/remove`. */
export interface InventoryRemoveOutput {
  /** Whether the removal succeeded (enough items existed). */
  success: boolean;
  /** Remaining quantity after removal. */
  remaining: number;
}

/** Parameters for `inventory/use`. */
export interface InventoryUseParams {
  readonly actorId: string;
  readonly itemId: string;
  /** Optional target actor ID (e.g. for healing spells). */
  readonly targetId?: string;
}

/** Output for `inventory/use`. */
export interface InventoryUseOutput {
  /** Whether the item was successfully used (i.e. it was present and usable). */
  success: boolean;
}

/** Parameters for `inventory/equip`. */
export interface InventoryEquipParams {
  readonly actorId: string;
  readonly itemId: string;
  /** Target slot — inferred from item category when omitted. */
  readonly slot?: EquipSlot;
}

/** Output for `inventory/equip`. */
export interface InventoryEquipOutput {
  /** Whether equipping succeeded. */
  success: boolean;
  /** Item that was displaced from the slot (if any). */
  displaced?: string;
}

/** Parameters for `inventory/unequip`. */
export interface InventoryUnequipParams {
  readonly actorId: string;
  readonly slot: EquipSlot;
}

/** Output for `inventory/unequip`. */
export interface InventoryUnequipOutput {
  success: boolean;
  /** Item ID that was removed from the slot. */
  itemId?: string;
}

/** Parameters for `inventory/list`. */
export interface InventoryListParams {
  readonly actorId: string;
}

/** Output for `inventory/list`. */
export interface InventoryListOutput {
  /** All non-empty inventory slots. */
  slots: InventorySlot[];
  /** Equipped item map (slot → itemId). */
  equipped: Record<EquipSlot, string>;
}

/** Parameters for `inventory/has`. */
export interface InventoryHasParams {
  readonly actorId: string;
  readonly itemId: string;
  readonly quantity?: number;
}

/** Output for `inventory/has`. */
export interface InventoryHasOutput {
  has: boolean;
  quantity: number;
}

// ---------------------------------------------------------------------------
// Notifications emitted BY InventorySystem
// ---------------------------------------------------------------------------

export interface InventoryItemAddedParams {
  readonly actorId: string;
  readonly itemId: string;
  readonly quantity: number;
}

export interface InventoryItemRemovedParams {
  readonly actorId: string;
  readonly itemId: string;
  readonly quantity: number;
}

export interface InventoryItemUsedParams {
  readonly actorId: string;
  readonly itemId: string;
  readonly targetId?: string;
}

export interface InventoryEquippedParams {
  readonly actorId: string;
  readonly itemId: string;
  readonly slot: EquipSlot;
  readonly displaced?: string;
}

export interface InventoryUnequippedParams {
  readonly actorId: string;
  readonly slot: EquipSlot;
  readonly itemId: string;
}
