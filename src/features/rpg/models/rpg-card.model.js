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
