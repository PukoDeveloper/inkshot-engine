import type { Core } from '../../core/Core.js';
import type { EnginePlugin } from '../../types/plugin.js';
import type {
  ShopDef,
  ShopDefineParams,
  ShopOpenParams,
  ShopOpenOutput,
  ShopBuyParams,
  ShopBuyOutput,
  ShopSellParams,
  ShopSellOutput,
  ShopCloseParams,
  ShopOpenedParams,
  ShopBoughtParams,
  ShopSoldParams,
  ShopClosedParams,
} from '../../types/shop.js';

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

interface ActiveSession {
  readonly shopId: string;
  readonly customerId: string;
  readonly stock: Map<string, number | null>;
}

// ---------------------------------------------------------------------------
// ShopSystem
// ---------------------------------------------------------------------------

/**
 * Plugin that manages **shop interactions**.
 *
 * Gold is read from / written to `VariableStoreManager` under the
 * `'player'` namespace (default), key `'gold'`.
 *
 * ### EventBus API
 *
 * | Event        | Params / Output                           |
 * |--------------|-------------------------------------------|
 * | `shop/define`| `ShopDefineParams`                        |
 * | `shop/open`  | `ShopOpenParams → ShopOpenOutput`         |
 * | `shop/buy`   | `ShopBuyParams → ShopBuyOutput`           |
 * | `shop/sell`  | `ShopSellParams → ShopSellOutput`         |
 * | `shop/close` | `ShopCloseParams`                         |
 */
export class ShopSystem implements EnginePlugin {
  readonly namespace = 'shop';
  readonly dependencies = ['inventory'] as const;

  private readonly _shops: Map<string, ShopDef> = new Map();
  private readonly _sessions: Map<string, ActiveSession> = new Map();

  private readonly _goldNs: string;
  private readonly _goldKey: string;

  constructor(opts: { goldNamespace?: string; goldKey?: string } = {}) {
    this._goldNs = opts.goldNamespace ?? 'player';
    this._goldKey = opts.goldKey ?? 'gold';
  }

  init(core: Core): void {
    core.events.on<ShopDefineParams>(this.namespace, 'shop/define', (p) => {
      this._shops.set(p.shop.id, p.shop);
    });

    core.events.on<ShopOpenParams, ShopOpenOutput>(this.namespace, 'shop/open', (p, output) => {
      const shop = this._shops.get(p.shopId);
      if (!shop) return;

      const stock = new Map<string, number | null>();
      const entries = shop.entries.map((entry) => {
        const itemDef = this._getItemDef(core, entry.itemId);
        const buyPrice = entry.price ?? itemDef?.price ?? 0;
        const sellRatio = shop.sellRatio ?? 0.5;
        const sellPrice = Math.floor(buyPrice * sellRatio);
        const stockCount = entry.stock ?? null;
        stock.set(entry.itemId, stockCount);
        return { itemId: entry.itemId, price: buyPrice, sellPrice, stock: stockCount };
      });

      this._sessions.set(p.customerId, { shopId: p.shopId, customerId: p.customerId, stock });
      output.entries = entries;
      output.gold = this._getGold(core);

      core.events.emitSync<ShopOpenedParams>('shop/opened', { shopId: p.shopId, customerId: p.customerId });
    });

    core.events.on<ShopBuyParams, ShopBuyOutput>(this.namespace, 'shop/buy', (p, output) => {
      const session = this._sessions.get(p.customerId);
      if (!session || session.shopId !== p.shopId) {
        output.success = false; output.reason = 'no_active_session';
        output.goldSpent = 0; output.newGold = this._getGold(core);
        return;
      }

      const shop = this._shops.get(p.shopId)!;
      const entry = shop.entries.find((e) => e.itemId === p.itemId);
      if (!entry) {
        output.success = false; output.reason = 'item_not_available';
        output.goldSpent = 0; output.newGold = this._getGold(core);
        return;
      }

      const qty = p.quantity ?? 1;
      const buyPrice = (entry.price ?? this._getItemDef(core, p.itemId)?.price ?? 0) * qty;
      const currentGold = this._getGold(core);

      if (currentGold < buyPrice) {
        output.success = false; output.reason = 'insufficient_gold';
        output.goldSpent = 0; output.newGold = currentGold;
        return;
      }

      const currentStock = session.stock.get(p.itemId);
      if (currentStock !== null && currentStock !== undefined && currentStock < qty) {
        output.success = false; output.reason = 'out_of_stock';
        output.goldSpent = 0; output.newGold = currentGold;
        return;
      }

      const newGold = currentGold - buyPrice;
      this._setGold(core, newGold);
      if (currentStock !== null && currentStock !== undefined) {
        session.stock.set(p.itemId, currentStock - qty);
      }
      core.events.emitSync('inventory/add', { actorId: p.customerId, itemId: p.itemId, quantity: qty });

      output.success = true;
      output.goldSpent = buyPrice;
      output.newGold = newGold;
      core.events.emitSync<ShopBoughtParams>('shop/bought', {
        shopId: p.shopId, customerId: p.customerId, itemId: p.itemId, quantity: qty, goldSpent: buyPrice,
      });
    });

    core.events.on<ShopSellParams, ShopSellOutput>(this.namespace, 'shop/sell', (p, output) => {
      const session = this._sessions.get(p.customerId);
      if (!session || session.shopId !== p.shopId) {
        output.success = false; output.reason = 'no_active_session';
        output.goldGained = 0; output.newGold = this._getGold(core);
        return;
      }

      const shop = this._shops.get(p.shopId)!;
      const qty = p.quantity ?? 1;
      const itemDef = this._getItemDef(core, p.itemId);
      const sellPrice = Math.floor((itemDef?.price ?? 0) * (shop.sellRatio ?? 0.5)) * qty;

      const { output: hasOut } = core.events.emitSync<
        { actorId: string; itemId: string; quantity: number },
        { has: boolean; quantity: number }
      >('inventory/has', { actorId: p.customerId, itemId: p.itemId, quantity: qty });

      if (!hasOut.has) {
        output.success = false; output.reason = 'item_not_owned';
        output.goldGained = 0; output.newGold = this._getGold(core);
        return;
      }

      core.events.emitSync('inventory/remove', { actorId: p.customerId, itemId: p.itemId, quantity: qty });
      const newGold = this._getGold(core) + sellPrice;
      this._setGold(core, newGold);

      output.success = true;
      output.goldGained = sellPrice;
      output.newGold = newGold;
      core.events.emitSync<ShopSoldParams>('shop/sold', {
        shopId: p.shopId, customerId: p.customerId, itemId: p.itemId, quantity: qty, goldGained: sellPrice,
      });
    });

    core.events.on<ShopCloseParams>(this.namespace, 'shop/close', (p) => {
      this._sessions.delete(p.customerId);
      core.events.emitSync<ShopClosedParams>('shop/closed', { shopId: p.shopId, customerId: p.customerId });
    });
  }

  destroy(core: Core): void {
    core.events.removeNamespace(this.namespace);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private _getGold(core: Core): number {
    const { output } = core.events.emitSync<{ ns: string; key: string }, { value: unknown }>(
      'store/get', { ns: this._goldNs, key: this._goldKey }
    );
    return typeof output?.value === 'number' ? output.value : 0;
  }

  private _setGold(core: Core, amount: number): void {
    core.events.emitSync('store/set', { ns: this._goldNs, key: this._goldKey, value: amount });
  }

  private _getItemDef(core: Core, itemId: string): { price?: number } | undefined {
    const { output } = core.events.emitSync<{ itemId: string }, { def?: { price?: number } }>(
      'inventory/item:get', { itemId }
    );
    return output?.def;
  }
}
