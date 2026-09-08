/**
 * RPG 2.0 — Coin repository (minimal RPG-scoped balance store).
 *
 * Sole data-access layer for `rpg_wallets`. Same currency as everywhere
 * else in the project (coin); no bank, interest, or ledger baggage.
 * Spending is atomic at the row level: insufficient balance fails the
 * UPDATE itself, so coin can never go negative or vanish.
 */
import { sql } from '#storage/connection.js';

class RpgCoinModel {
  async ensure(userId, client = sql) {
    const rows = await client`
      INSERT INTO rpg_wallets (user_id) VALUES (${userId})
      ON CONFLICT (user_id) DO NOTHING
      RETURNING *
    `;
    if (rows[0]) return rows[0];
    return this.get(userId, client);
  }

  async get(userId, client = sql) {
    const rows =
      await client`SELECT * FROM rpg_wallets WHERE user_id = ${userId}`;
    return rows[0] ?? null;
  }

  async getBalance(userId, client = sql) {
    const row = await this.get(userId, client);
    return row ? row.coin : 0;
  }

  async addCoin(userId, amount, client = sql) {
    if (!Number.isInteger(amount) || amount < 1) {
      throw new RangeError('amount must be a positive integer');
    }
    const rows = await client`
      UPDATE rpg_wallets
      SET coin = coin + ${amount}, updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
      WHERE user_id = ${userId}
      RETURNING *
    `;
    return rows[0] ?? null;
  }

  /**
   * Atomic spend: the row updates only when the balance covers it.
   * Returns the remaining balance; throws when funds are short.
   */
  async spendCoin(userId, amount, client = sql) {
    if (!Number.isInteger(amount) || amount < 1) {
      throw new RangeError('amount must be a positive integer');
    }
    const rows = await client`
      UPDATE rpg_wallets
      SET coin = coin - ${amount}, updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
      WHERE user_id = ${userId} AND coin >= ${amount}
      RETURNING *
    `;
    if (!rows[0]) throw new RangeError('Coin tidak cukup');
    return rows[0].coin;
  }
}

export const rpgCoinModel = new RpgCoinModel();
