import { db } from '#storage/connection.js';
import { lazyPrepare } from '#storage/lazy.js';

class RedeemCodeModel {
  _insert = lazyPrepare(
    'INSERT INTO redeem_codes (code, amount, expires_at) VALUES (@code, @amount, @expiresAt)'
  );
  _find = lazyPrepare('SELECT * FROM redeem_codes WHERE code = ?');

  create(code, amount, expiresAt) {
    this._insert().run({ code, amount, expiresAt });
    return this._find().get(code);
  }

  redeem(code, jid) {
    return db.transaction(() => {
      const redeemCode = this._find().get(code);
      if (!redeemCode) throw new Error('Redeem code tidak ditemukan.');
      if (redeemCode.expires_at <= Date.now())
        throw new Error('Redeem code sudah expired.');

      const already = db
        .prepare('SELECT 1 FROM redeem_code_users WHERE code = @code AND jid = @jid')
        .get({ code, jid });
      if (already) throw new Error('Kamu sudah pernah me-redeem code ini.');

      db.prepare(
        'INSERT INTO redeem_code_users (code, jid, used_at) VALUES (@code, @jid, @usedAt)'
      ).run({ code, jid, usedAt: Math.floor(Date.now() / 1000) });

      db.prepare(
        'UPDATE wallets SET cash = cash + @amount, updated_at = unixepoch() WHERE jid = @jid'
      ).run({ jid, amount: redeemCode.amount });
      db.prepare(
        "INSERT INTO transactions (from_jid, to_jid, amount, type, note) VALUES ('system', @jid, @amount, 'reward', 'redeem code')"
      ).run({ jid, amount: redeemCode.amount });

      return redeemCode;
    })();
  }
}

export const redeemCodeModel = new RedeemCodeModel();
