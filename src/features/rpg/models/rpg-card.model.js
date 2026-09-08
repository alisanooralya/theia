/**
 * RPG 2.0 — Card repository.
 *
 * Sole data-access layer for `rpg_main_cards` / `rpg_sign_cards`.
 * All SQL for Card ownership, levels, and equipment lives here.
 *
 * Rules enforced here / by schema:
 * - One copy per card id per user (UNIQUE(user_id, card_id)).
 * - Granting an owned card never duplicates (ON CONFLICT DO NOTHING).
 * - One equipped card per slot per user (partial unique index +
 *   clear-then-set in equip()).
 * - Level ranges per kind (main 1-100, sign 1-50) via CHECK.
 */
import { sql } from '#storage/connection.js';

const TABLES = Object.freeze({
  main: 'rpg_main_cards',
  sign: 'rpg_sign_cards',
});

function tableFor(kind) {
  const table = TABLES[kind];
  if (!table) throw new RangeError(`unknown card kind: ${kind}`);
  return table;
}

class RpgCardModel {
  async owned(userId, kind, client = sql) {
    return client.unsafe(
      `SELECT * FROM ${tableFor(kind)} WHERE user_id = $1 ORDER BY card_id`,
      [userId]
    );
  }

  async find(userId, cardId, kind, client = sql, forUpdate = false) {
    const rows = await client.unsafe(
      `SELECT * FROM ${tableFor(kind)} WHERE user_id = $1 AND card_id = $2${forUpdate ? ' FOR UPDATE' : ''}`,
      [userId, cardId]
    );
    return rows[0] ?? null;
  }

  async grant(userId, cardId, kind, client = sql) {
    const rows = await client.unsafe(
      `INSERT INTO ${tableFor(kind)} (user_id, card_id) VALUES ($1, $2)
       ON CONFLICT (user_id, card_id) DO NOTHING RETURNING *`,
      [userId, cardId]
    );
    if (rows[0]) return { row: rows[0], isNew: true };
    const existing = await this.find(userId, cardId, kind, client);
    return { row: existing, isNew: false };
  }

  async setLevel(userId, cardId, kind, level, client = sql) {
    const rows = await client.unsafe(
      `UPDATE ${tableFor(kind)}
       SET level = $3, updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
       WHERE user_id = $1 AND card_id = $2 RETURNING *`,
      [userId, cardId, level]
    );
    return rows[0] ?? null;
  }

  async equipped(userId, kind, client = sql) {
    const rows = await client.unsafe(
      `SELECT * FROM ${tableFor(kind)} WHERE user_id = $1 AND equipped = 1`,
      [userId]
    );
    return rows[0] ?? null;
  }

  /**
   * Equip a card, replacing whatever is in the slot. Clear-then-set keeps
   * the single-equipped partial unique index satisfied at every step.
   */
  async equip(userId, cardId, kind, client = sql) {
    const table = tableFor(kind);
    await client.unsafe(
      `UPDATE ${table} SET equipped = 0, updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
       WHERE user_id = $1 AND equipped = 1`,
      [userId]
    );
    const rows = await client.unsafe(
      `UPDATE ${table} SET equipped = 1, updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
       WHERE user_id = $1 AND card_id = $2 RETURNING *`,
      [userId, cardId]
    );
    return rows[0] ?? null;
  }

  async unequip(userId, kind, client = sql) {
    const rows = await client.unsafe(
      `UPDATE ${tableFor(kind)}
       SET equipped = 0, updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
       WHERE user_id = $1 AND equipped = 1 RETURNING *`,
      [userId]
    );
    return rows[0] ?? null;
  }
}

export const rpgCardModel = new RpgCardModel();
