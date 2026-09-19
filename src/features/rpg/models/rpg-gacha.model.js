import { sql } from '#storage/connection.js';

class RpgGachaModel {
  async claim(requestKey, userId, client = sql) {
    const rows = await client`
      INSERT INTO rpg_gacha_requests (request_key, user_id)
      VALUES (${requestKey}, ${userId})
      ON CONFLICT (request_key) DO NOTHING
      RETURNING request_key
    `;
    return Boolean(rows[0]);
  }

  async getResults(requestKey, userId, client = sql) {
    const rows = await client`
      SELECT results FROM rpg_gacha_requests
      WHERE request_key = ${requestKey} AND user_id = ${userId}
    `;
    if (!rows[0]) return null;
    try {
      return JSON.parse(rows[0].results);
    } catch {
      return null;
    }
  }

  async saveResults(requestKey, results, client = sql) {
    await client`
      UPDATE rpg_gacha_requests SET results = ${JSON.stringify(results)}
      WHERE request_key = ${requestKey}
    `;
  }

  async lockPity(userId, client = sql) {
    await client`
      INSERT INTO rpg_gacha_pity (user_id) VALUES (${userId})
      ON CONFLICT (user_id) DO NOTHING
    `;
    const rows = await client`
      SELECT pity_count, force_new FROM rpg_gacha_pity
      WHERE user_id = ${userId}
      FOR UPDATE
    `;
    return rows[0] ?? { pity_count: 0, force_new: 0 };
  }

  async savePity(userId, pityCount, forceNew, client = sql) {
    await client`
      INSERT INTO rpg_gacha_pity (user_id, pity_count, force_new)
      VALUES (${userId}, ${pityCount}, ${forceNew ? 1 : 0})
      ON CONFLICT (user_id) DO UPDATE SET
        pity_count = EXCLUDED.pity_count,
        force_new = EXCLUDED.force_new,
        updated_at = (EXTRACT(epoch FROM NOW())::BIGINT)
    `;
  }
}

export const rpgGachaModel = new RpgGachaModel();
