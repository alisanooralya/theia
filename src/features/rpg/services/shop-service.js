/**
 * RPG 2.0 — Shop service (generic business logic, no SQL here).
 *
 * Reads items straight from shop-config.js — the ONLY item list. No
 * item-id branches anywhere: a config entry automatically appears in
 * `.shop`, becomes buyable, and lands in inventory.
 *
 * Purchase is atomic: coin spend + inventory add run in one transaction,
 * so failed purchases never lose coin.
 */
import { sql } from '#storage/connection.js';
import {
  getShopItems,
  getShopItem,
  getPurchasableItems,
} from '../config/shop-config.js';
import { rpgPlayerModel } from '../models/rpg-player.model.js';
import { rpgCoinModel } from '../models/rpg-coin.model.js';
import { rpgInventoryModel } from '../models/rpg-inventory.model.js';

export function createShopService({
  playerModel,
  coinModel,
  inventoryModel,
  db = sql,
  catalog = null,
} = {}) {
  const players = playerModel ?? rpgPlayerModel;
  const coins = coinModel ?? rpgCoinModel;
  const inventory = inventoryModel ?? rpgInventoryModel;
  const shop = catalog ?? { getShopItems, getShopItem, getPurchasableItems };

  return {
    /** Every defined item, in config order. */
    getShopItems() {
      return shop.getShopItems();
    },

    /** Buyable items only (what `.shop` displays). */
    getPurchasableItems() {
      return shop.getPurchasableItems();
    },

    /** Entry by id, or null. */
    getShopItem(itemId) {
      return shop.getShopItem(itemId);
    },

    /**
     * Buy `quantity` of `itemId` for `userId`.
     * Validates config -> purchasable -> quantity -> balance, then
     * spends coin and adds the item atomically.
     */
    async buyItem(userId, itemId, quantity = 1) {
      const item = shop.getShopItem(itemId);
      if (!item) throw new RangeError(`Item tidak ada: ${itemId}`);
      if (!item.purchasable)
        throw new RangeError(`Item tidak dijual: ${itemId}`);
      if (!Number.isInteger(quantity) || quantity < 1) {
        throw new RangeError('quantity must be a positive integer');
      }
      const total = item.price * quantity;
      await players.ensure(userId);
      await coins.ensure(userId);
      const result = await db.begin(async (tx) => {
        const remaining =
          total > 0
            ? await coins.spendCoin(userId, total, tx)
            : await coins.getBalance(userId, tx);
        const row = await inventory.add(userId, item.id, quantity, tx);
        return { remaining, row };
      });
      return {
        item,
        quantity,
        total,
        coinRemaining: result.remaining,
        inventoryQuantity: result.row.quantity,
      };
    },
  };
}

export const shopService = createShopService();
