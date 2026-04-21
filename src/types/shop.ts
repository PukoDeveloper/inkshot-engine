// ---------------------------------------------------------------------------
// Shop definition
// ---------------------------------------------------------------------------

/** A single item listing inside a shop. */
export interface ShopEntry {
  readonly itemId: string;
  /**
   * Override price for this entry.  When omitted the `ItemDef.price` value is
   * used.
   */
  readonly price?: number;
  /** Maximum purchasable quantity (unlimited when omitted). */
  readonly stock?: number;
}

/** Blueprint for a shop. */
export interface ShopDef {
  /** Unique identifier, e.g. `'blacksmith'`. */
  readonly id: string;
  readonly name: string;
  readonly entries: readonly ShopEntry[];
  /**
   * Multiplier applied to the item's buy price to derive the sell price.
   * Defaults to `0.5`.
   */
  readonly sellRatio?: number;
}

// ---------------------------------------------------------------------------
// EventBus params / output
// ---------------------------------------------------------------------------

/** Parameters for `shop/define`. */
export interface ShopDefineParams {
  readonly shop: ShopDef;
}

/** Parameters for `shop/open`. */
export interface ShopOpenParams {
  readonly shopId: string;
  /** Actor ID of the customer (used to look up their gold and inventory). */
  readonly customerId: string;
}

/** Output for `shop/open`. */
export interface ShopOpenOutput {
  /** Resolved listings with current stock and computed prices. */
  entries: Array<{ itemId: string; price: number; sellPrice: number; stock: number | null }>;
  /** Customer's current gold. */
  gold: number;
}

/** Parameters for `shop/buy`. */
export interface ShopBuyParams {
  readonly shopId: string;
  readonly customerId: string;
  readonly itemId: string;
  readonly quantity?: number;
}

/** Output for `shop/buy`. */
export interface ShopBuyOutput {
  success: boolean;
  /** Reason for failure (e.g. `'insufficient_gold'`, `'out_of_stock'`). */
  reason?: string;
  goldSpent: number;
  newGold: number;
}

/** Parameters for `shop/sell`. */
export interface ShopSellParams {
  readonly shopId: string;
  readonly customerId: string;
  readonly itemId: string;
  readonly quantity?: number;
}

/** Output for `shop/sell`. */
export interface ShopSellOutput {
  success: boolean;
  reason?: string;
  goldGained: number;
  newGold: number;
}

/** Parameters for `shop/close`. */
export interface ShopCloseParams {
  readonly shopId: string;
  readonly customerId: string;
}

// ---------------------------------------------------------------------------
// Notifications emitted BY ShopSystem
// ---------------------------------------------------------------------------

export interface ShopOpenedParams {
  readonly shopId: string;
  readonly customerId: string;
}

export interface ShopBoughtParams {
  readonly shopId: string;
  readonly customerId: string;
  readonly itemId: string;
  readonly quantity: number;
  readonly goldSpent: number;
}

export interface ShopSoldParams {
  readonly shopId: string;
  readonly customerId: string;
  readonly itemId: string;
  readonly quantity: number;
  readonly goldGained: number;
}

export interface ShopClosedParams {
  readonly shopId: string;
  readonly customerId: string;
}
