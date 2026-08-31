import { sql } from '#storage/connection.js';
import { logger } from '#helpers/logger.js';

class InventoryModel {
  async getAll(jid, client = sql) {
    return client`
      SELECT i.*, it.name, it.description, it.category, it.rarity, it.sellable
      FROM inventories i JOIN items it ON it.id = i.item_id
      WHERE i.jid = ${jid} ORDER BY it.category, it.name
    `;
  }

  async getItem(jid, itemId, client = sql) {
    const rows = await client`
      SELECT i.*, it.name, it.description, it.category, it.rarity, it.sellable, it.price
      FROM inventories i JOIN items it ON it.id = i.item_id
      WHERE i.jid = ${jid} AND i.item_id = ${itemId}
    `;
    return rows[0] ?? null;
  }

  async hasItem(jid, itemId, qty = 1, client = sql) {
    const row = await this.getItem(jid, itemId, client);
    return row ? row.quantity >= qty : false;
  }

  async add(jid, itemId, qty = 1, client = sql) {
    const rows = await client`SELECT id FROM items WHERE id = ${itemId}`;
    if (!rows[0]) {
      logger.warn({ itemId, jid }, 'Item not in master table — run seed');
      return false;
    }
    await client`
      INSERT INTO inventories (jid, item_id, quantity) VALUES (${jid}, ${itemId}, ${qty})
      ON CONFLICT (jid, item_id) DO UPDATE SET quantity = quantity + ${qty}
    `;
    return true;
  }

  async remove(jid, itemId, qty = 1, client = sql) {
    const row = await this.getItem(jid, itemId, client);
    if (!row || row.quantity < qty)
      throw new Error(`Item tidak cukup: ${itemId}`);
    await client`
      UPDATE inventories SET quantity = quantity - ${qty} WHERE jid = ${jid} AND item_id = ${itemId}
    `;
    await client`DELETE FROM inventories WHERE jid = ${jid} AND quantity <= 0`;
  }

  async countSlots(jid, client = sql) {
    const rows = await client`
      SELECT COUNT(*)::int AS count FROM inventories WHERE jid = ${jid}
    `;
    return rows[0]?.count ?? 0;
  }
}

export const inventoryModel = new InventoryModel();