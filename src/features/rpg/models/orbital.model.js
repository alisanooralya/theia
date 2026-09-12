import { sql } from '#storage/connection.js';

class OrbitalModel {
  async get(userId, client = sql) {
    const rows =
      await client`SELECT * FROM orbital_progress WHERE user_id = ${userId}`;
    return rows[0] ?? null;
  }

  async ensure(userId, client = sql) {
    const rows = await client`
      INSERT INTO orbital_progress (user_id)
      VALUES (${userId})
      ON CONFLICT (user_id) DO NOTHING
      RETURNING *
    `;
    if (rows[0]) return rows[0];
    return this.get(userId, client);
  }

  async lock(userId, client) {
    const rows = await client`
      SELECT * FROM orbital_progress WHERE user_id = ${userId} FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  async save(userId, { floor, signal, signalUpdatedAt }, client = sql) {
    const rows = await client`
      UPDATE orbital_progress
      SET floor = ${floor}, signal = ${signal},
          signal_updated_at = ${signalUpdatedAt},
          updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
      WHERE user_id = ${userId}
      RETURNING *
    `;
    return rows[0] ?? null;
  }
}

export const orbitalModel = new OrbitalModel();
