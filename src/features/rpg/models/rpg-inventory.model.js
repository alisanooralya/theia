import { sql } from '#storage/connection.js';

class RpgInventoryModel {
  async getAll(userId, client = sql) {
    return client`SELECT * FROM rpg_inventory WHERE user_id = ${userId} ORDER BY item_id`;
  }

  async getQuantity(userId, itemId, client = sql) {
    const rows = await client`
      SELECT quantity FROM rpg_inventory WHERE user_id = ${userId} AND item_id = ${itemId}
    `;
    return rows[0] ? rows[0].quantity : 0;
  }

  async add(userId, itemId, quantity, client = sql) {
    const rows = await client`
      INSERT INTO rpg_inventory (user_id, item_id, quantity)
      VALUES (${userId}, ${itemId}, ${quantity})
      ON CONFLICT (user_id, item_id) DO UPDATE SET
        quantity = rpg_inventory.quantity + EXCLUDED.quantity,
        updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
      RETURNING *
    `;
    return rows[0];
  }

  async remove(userId, itemId, quantity, client = sql) {
    const rows = await client`
      UPDATE rpg_inventory
      SET quantity = quantity - ${quantity}, updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
      WHERE user_id = ${userId} AND item_id = ${itemId} AND quantity >= ${quantity}
      RETURNING *
    `;
    if (!rows[0]) throw new RangeError(`Item tidak cukup: ${itemId}`);
    if (rows[0].quantity === 0) {
      await client`DELETE FROM rpg_inventory WHERE user_id = ${userId} AND item_id = ${itemId}`;
      return 0;
    }
    return rows[0].quantity;
  }
}

export const rpgInventoryModel = new RpgInventoryModel();
