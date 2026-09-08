/**
 * RPG 2.0 — Gacha request repository (idempotency keys).
 *
 * Sole data-access layer for `rpg_gacha_requests`. Claim-or-return must
 * run inside the purchase transaction: the unique key serializes retries
 * and concurrent duplicates so rewards are never granted twice.
 */
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
}

export const rpgGachaModel = new RpgGachaModel();
