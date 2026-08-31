import { sql } from '#storage/connection.js';
import {
  walletModel,
  inventoryModel,
  itemModel,
  statsModel,
} from '#storage/models/index.js';

const SELL_RATE = 0.6;

class ShopService {
  priceForBuy(jid, item) {
    return item.price;
  }

  async buy(jid, itemId, qty = 1) {
    const item = await itemModel.findById(itemId);
    if (!item) throw new Error(`Item \`${itemId}\` tidak ditemukan.`);
    const price = this.priceForBuy(jid, item);
    if (price <= 0) throw new Error('Item ini tidak dijual di toko.');

    const total = price * qty;
    const wallet = await walletModel.find(jid);
    if (!wallet || wallet.cash < total)
      throw new Error(
        `Saldo cash tidak cukup. Butuh 🪙${total.toLocaleString()}.`
      );

    await sql.begin(async (t) => {
      await walletModel.addCash(jid, -total, t);
      await inventoryModel.add(jid, itemId, qty, t);
    });
    return { item, qty, total, unitPrice: price };
  }

  async sell(jid, itemId, qty = 1) {
    const item = await itemModel.findById(itemId);
    if (!item) throw new Error(`Item \`${itemId}\` tidak ditemukan.`);
    if (!item.sellable) throw new Error('Item ini tidak bisa dijual.');

    const owned = await inventoryModel.getItem(jid, itemId);
    if (!owned || owned.quantity < qty)
      throw new Error(
        `Kamu tidak punya cukup *${item.name}* (punya: ${owned?.quantity ?? 0}).`
      );

    const earned = Math.floor(item.price * SELL_RATE) * qty;
    await sql.begin(async (t) => {
      await inventoryModel.remove(jid, itemId, qty, t);
      await walletModel.addCash(jid, earned, t);
    });
    return { item, qty, earned };
  }

  async equip(jid, itemId, userLevel = 1) {
    const item = await itemModel.findById(itemId);
    if (!item) throw new Error('Item tidak ditemukan.');
    if (!['weapon', 'armor'].includes(item.category))
      throw new Error('Hanya weapon atau armor yang bisa diequip.');
    if (!(await inventoryModel.hasItem(jid, itemId)))
      throw new Error(`Kamu tidak punya *${item.name}*.`);
    return { item, atk: 0, def: 0, maxHp: 0 };
  }

  async unequip(jid, slot, userLevel = 1) {
    if (!['weapon', 'armor'].includes(slot))
      throw new Error("Slot harus 'weapon' atau 'armor'.");
    return { slot, atk: 0, def: 0, maxHp: 0 };
  }

  async getShopItems() {
    const items = await itemModel.shopItems();
    return items.reduce((acc, item) => {
      const cat = item.category;
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(item);
      return acc;
    }, {});
  }
}

export const shopService = new ShopService();
