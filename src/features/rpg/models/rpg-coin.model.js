/**
 * RPG 2.0 — Coin repository (minimal RPG-scoped balance store).
 *
 * Sole data-access layer for `rpg_wallets`. Same currency as everywhere
 * else in the project (coin); no interest, fee, limit, or ledger baggage.
 * Spending and bank moves are atomic at the row level: insufficient
 * balance fails the UPDATE itself, so coin can never go negative,
 * vanish, or appear from nothing.
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

  /**
   * Full wallet state (Coin + Bank). Missing row reads as zero balances;
   * callers that mutate must `ensure()` first.
   */
  async getWallet(userId, client = sql) {
    const row = await this.get(userId, client);
    if (!row) return { coin: 0, bank: 0 };
    return { coin: row.coin, bank: row.bank ?? 0 };
  }

  /**
   * Atomic deposit: moves `amount` from coin to bank in ONE conditional
   * UPDATE. The row lock serializes concurrent deposits and the
   * `coin >= amount` guard runs inside the statement itself, so balances
   * can never go negative and coin+bank total is conserved by
   * construction. Throws when funds are short (nothing is written).
   */
  async depositToBank(userId, amount, client = sql) {
    if (!Number.isInteger(amount) || amount < 1) {
      throw new RangeError('amount must be a positive integer');
    }
    const rows = await client`
      UPDATE rpg_wallets
      SET coin = coin - ${amount}, bank = bank + ${amount}, updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
      WHERE user_id = ${userId} AND coin >= ${amount}
      RETURNING coin, bank
    `;
    if (!rows[0]) throw new RangeError('Coin tidak cukup');
    return { coin: rows[0].coin, bank: rows[0].bank };
  }

  /** Atomic withdraw: mirror of depositToBank (bank -> coin). */
  async withdrawFromBank(userId, amount, client = sql) {
    if (!Number.isInteger(amount) || amount < 1) {
      throw new RangeError('amount must be a positive integer');
    }
    const rows = await client`
      UPDATE rpg_wallets
      SET coin = coin + ${amount}, bank = bank - ${amount}, updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
      WHERE user_id = ${userId} AND bank >= ${amount}
      RETURNING coin, bank
    `;
    if (!rows[0]) throw new RangeError('Saldo bank tidak cukup');
    return { coin: rows[0].coin, bank: rows[0].bank };
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
