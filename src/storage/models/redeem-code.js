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
      const already = db
        .prepare('SELECT 1 FROM redeem_codes WHERE used_by = @jid LIMIT 1')
        .get({ jid });
      if (already) throw new Error('Kamu sudah pernah me-redeem code.');

      const redeemCode = this._find().get(code);
      if (!redeemCode) throw new Error('Redeem code tidak ditemukan.');
      if (redeemCode.used_by) throw new Error('Redeem code sudah digunakan.');
      if (redeemCode.expires_at <= Date.now())
        throw new Error('Redeem code sudah expired.');

      const result = db
        .prepare(
          'UPDATE redeem_codes SET used_by = @jid, used_at = @usedAt WHERE code = @code AND used_by IS NULL AND expires_at > @now'
        )
        .run({
          code,
          jid,
          usedAt: Math.floor(Date.now() / 1000),
          now: Date.now(),
        });
      if (result.changes !== 1)
        throw new Error('Redeem code sudah digunakan atau expired.');

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
