import { sql } from '#storage/connection.js';
import {
  getShopItems,
  getShopItem,
  getPurchasableItems,
} from '../config/shop-config.js';
import { rpgPlayerModel } from '../models/rpg-player.model.js';
import { rpgCoinModel } from '../models/rpg-coin.model.js';
import { rpgInventoryModel } from '../models/rpg-inventory.model.js';
import { createCardService } from './card-service.js';

export function createShopService({
  playerModel,
  coinModel,
  inventoryModel,
  cardService,
  db = sql,
  catalog = null,
} = {}) {
  const players = playerModel ?? rpgPlayerModel;
  const coins = coinModel ?? rpgCoinModel;
  const inventory = inventoryModel ?? rpgInventoryModel;
  const cards = cardService ?? createCardService();
  const shop = catalog ?? { getShopItems, getShopItem, getPurchasableItems };

  return {
    getShopItems() {
      return shop.getShopItems();
    },

    getPurchasableItems() {
      return shop.getPurchasableItems();
    },

    getShopItem(itemId) {
      return shop.getShopItem(itemId);
    },

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
      if (item.cardId) {
        const result = await db.begin(async (tx) => {
          const remaining =
            total > 0
              ? await coins.spendCoin(userId, total, tx)
              : await coins.getBalance(userId, tx);
          const granted = await cards.grantCard(userId, item.cardId, tx);
          if (!granted.isNew)
            throw new RangeError(
              `Sudah memiliki: ${granted.card.definition.name}`
            );
          return { remaining, granted };
        });
        return {
          item,
          quantity: 1,
          total,
          coinRemaining: result.remaining,
          inventoryQuantity: 0,
          card: result.granted.card,
        };
      }
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
        card: null,
      };
    },
  };
}

export const shopService = createShopService();
