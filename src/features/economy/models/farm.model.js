import { sql } from '#storage/connection.js';

class FarmModel {
  async get(userId, client = sql) {
    const rows =
      await client`SELECT * FROM farm_plots WHERE user_id = ${userId}`;
    return rows[0] ?? null;
  }

  async ensure(userId, client = sql) {
    const rows = await client`
      INSERT INTO farm_plots (user_id)
      VALUES (${userId})
      ON CONFLICT (user_id) DO NOTHING
      RETURNING *
    `;
    if (rows[0]) return rows[0];
    return this.get(userId, client);
  }

  async lock(userId, client) {
    const rows = await client`
      SELECT * FROM farm_plots WHERE user_id = ${userId} FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  async setPlanting(
    userId,
    { cropId, quantity, plantedAt, matureAt },
    client = sql
  ) {
    const rows = await client`
      UPDATE farm_plots
      SET crop_id = ${cropId}, quantity = ${quantity},
          planted_at = ${plantedAt}, mature_at = ${matureAt},
          updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
      WHERE user_id = ${userId}
      RETURNING *
    `;
    return rows[0] ?? null;
  }

  async clear(userId, client = sql) {
    const rows = await client`
      UPDATE farm_plots
      SET crop_id = '', quantity = 0,
          planted_at = 0, mature_at = 0,
          updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
      WHERE user_id = ${userId}
      RETURNING *
    `;
    return rows[0] ?? null;
  }
}

export const farmModel = new FarmModel();
