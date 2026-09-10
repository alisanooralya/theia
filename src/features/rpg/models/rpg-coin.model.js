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

  async getWallet(userId, client = sql) {
    const row = await this.get(userId, client);
    if (!row) return { coin: 0, bank: 0 };
    return { coin: row.coin, bank: row.bank ?? 0 };
  }

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

  async transferCoin(fromId, toId, amount) {
    if (!Number.isInteger(amount) || amount < 1) {
      throw new RangeError('amount must be a positive integer');
    }
    if (fromId === toId) {
      throw new RangeError('Tidak bisa transfer ke diri sendiri.');
    }
    return sql.begin(async (tx) => {
      const [first, second] = fromId < toId ? [fromId, toId] : [toId, fromId];
      const locked = await tx`
        SELECT user_id, coin FROM rpg_wallets WHERE user_id = ${first} FOR UPDATE
      `;
      const locked2 = await tx`
        SELECT user_id, coin FROM rpg_wallets WHERE user_id = ${second} FOR UPDATE
      `;
      const balances = new Map(
        [...locked, ...locked2].map((r) => [r.user_id, r.coin])
      );
      if (!balances.has(fromId) || !balances.has(toId)) {
        throw new RangeError('Wallet tidak ditemukan');
      }
      if (balances.get(fromId) < amount)
        throw new RangeError('Coin tidak cukup');
      const senderRows = await tx`
        UPDATE rpg_wallets
        SET coin = coin - ${amount}, updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
        WHERE user_id = ${fromId}
        RETURNING coin
      `;
      const receiverRows = await tx`
        UPDATE rpg_wallets
        SET coin = coin + ${amount}, updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
        WHERE user_id = ${toId}
        RETURNING coin
      `;
      return {
        senderCoin: senderRows[0].coin,
        receiverCoin: receiverRows[0].coin,
      };
    });
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
