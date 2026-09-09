import { sql } from '#storage/connection.js';
import { rpgPlayerModel } from '#features/rpg/models/rpg-player.model.js';
import { rpgCoinModel } from '#features/rpg/models/rpg-coin.model.js';

class RedeemCodeModel {
  async create(code, amount, expiresAt, client = sql) {
    const rows = await client`
      INSERT INTO redeem_codes (code, amount, expires_at)
      VALUES (${code}, ${amount}, ${expiresAt})
      RETURNING *
    `;
    return rows[0];
  }

  async find(code, client = sql) {
    const rows = await client`SELECT * FROM redeem_codes WHERE code = ${code}`;
    return rows[0] ?? null;
  }

  async redeem(code, userId) {
    return sql.begin(async (tx) => {
      const rows = await tx`SELECT * FROM redeem_codes WHERE code = ${code}`;
      const redeemCode = rows[0];
      if (!redeemCode) throw new Error('Redeem code tidak ditemukan.');
      if (Number(redeemCode.expires_at) <= Date.now()) {
        throw new Error('Redeem code sudah expired.');
      }

      const used = await tx`
        SELECT 1 FROM redeem_code_users WHERE code = ${code} AND jid = ${userId}
      `;
      if (used[0]) throw new Error('Kamu sudah pernah me-redeem code ini.');

      await tx`
        INSERT INTO redeem_code_users (code, jid, used_at)
        VALUES (${code}, ${userId}, ${Math.floor(Date.now() / 1000)})
      `;

      await rpgPlayerModel.ensure(userId, tx);
      await rpgCoinModel.ensure(userId, tx);
      await rpgCoinModel.addCoin(userId, Number(redeemCode.amount), tx);

      return redeemCode;
    });
  }
}

export const redeemCodeModel = new RedeemCodeModel();
