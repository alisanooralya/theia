import { db } from '#storage/connection.js';
import {
  walletModel,
  inventoryModel,
  itemModel,
  statsModel,
  userModel,
  questModel,
} from '#storage/models/index.js';

const SELL_RATE = 0.6;

class ShopService {
  priceForBuy(jid, item) {
    if (item.id === 'bank_upgrade') {
      const used = userModel.getBankUpgradeCount(jid);
      return item.price * (used + 1);
    }
    return item.price;
  }

  buy(jid, itemId, qty = 1) {
    const item = itemModel.findById(itemId);
    if (!item) throw new Error(`Item \`${itemId}\` tidak ditemukan.`);
    const price = this.priceForBuy(jid, item);
    if (price <= 0) throw new Error('Item ini tidak dijual di toko.');

    const total = price * qty;
    const wallet = walletModel.find(jid);
    if (!wallet || wallet.cash < total)
      throw new Error(
        `Saldo cash tidak cukup. Butuh 🪙${total.toLocaleString()}.`
      );

    db.transaction(() => {
      walletModel.addCash(jid, -total);
      inventoryModel.add(jid, itemId, qty);
      questModel.addProgress(jid, 'daily_shop', qty);
    })();
    return { item, qty, total, unitPrice: price };
  }

  sell(jid, itemId, qty = 1) {
    const item = itemModel.findById(itemId);
    if (!item) throw new Error(`Item \`${itemId}\` tidak ditemukan.`);
    if (!item.sellable) throw new Error('Item ini tidak bisa dijual.');

    const owned = inventoryModel.getItem(jid, itemId);
    if (!owned || owned.quantity < qty)
      throw new Error(
        `Kamu tidak punya cukup *${item.name}* (punya: ${owned?.quantity ?? 0}).`
      );

    const earned = Math.floor(item.price * SELL_RATE) * qty;
    db.transaction(() => {
      inventoryModel.remove(jid, itemId, qty);
      walletModel.addCash(jid, earned);
    })();
    return { item, qty, earned };
  }

  equip(jid, itemId, userLevel = 1) {
    const item = itemModel.findById(itemId);
    if (!item) throw new Error('Item tidak ditemukan.');
    if (!['weapon', 'armor'].includes(item.category))
      throw new Error('Hanya weapon atau armor yang bisa diequip.');
    if (!inventoryModel.hasItem(jid, itemId))
      throw new Error(`Kamu tidak punya *${item.name}*.`);
    return { item, atk: 0, def: 0, maxHp: 0 };
  }

  unequip(jid, slot, userLevel = 1) {
    if (!['weapon', 'armor'].includes(slot))
      throw new Error("Slot harus 'weapon' atau 'armor'.");
    return { slot, atk: 0, def: 0, maxHp: 0 };
  }

  getShopItems() {
    return itemModel.shopItems().reduce((acc, item) => {
      const cat = item.category;
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(item);
      return acc;
    }, {});
  }
}

export const shopService = new ShopService();
