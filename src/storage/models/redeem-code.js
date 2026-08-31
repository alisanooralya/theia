import { sql } from '#storage/connection.js';

class RedeemCodeModel {
  async create(code, amount, expiresAt, client = sql) {
    await client`
      INSERT INTO redeem_codes (code, amount, expires_at) VALUES (${code}, ${amount}, ${expiresAt})
    `;
    return this.find(code, client);
  }

  async find(code, client = sql) {
    const rows = await client`SELECT * FROM redeem_codes WHERE code = ${code}`;
    return rows[0] ?? null;
  }

  async redeem(code, jid) {
    return sql.begin(async (t) => {
      const rows = await t`SELECT * FROM redeem_codes WHERE code = ${code}`;
      const redeemCode = rows[0];
      if (!redeemCode) throw new Error('Redeem code tidak ditemukan.');
      if (redeemCode.expires_at <= Date.now())
        throw new Error('Redeem code sudah expired.');

      const used = await t`
        SELECT 1 FROM redeem_code_users WHERE code = ${code} AND jid = ${jid}
      `;
      if (used[0]) throw new Error('Kamu sudah pernah me-redeem code ini.');

      await t`
        INSERT INTO redeem_code_users (code, jid, used_at) VALUES (${code}, ${jid}, ${Math.floor(Date.now() / 1000)})
      `;

      await t`
        UPDATE wallets SET cash = cash + ${redeemCode.amount}, updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT WHERE jid = ${jid}
      `;
      await t`
        INSERT INTO transactions (from_jid, to_jid, amount, type, note) VALUES ('system', ${jid}, ${redeemCode.amount}, 'reward', 'redeem code')
      `;

      return redeemCode;
    });
  }
}

export const redeemCodeModel = new RedeemCodeModel();