import { db } from '#storage/connection.js';
import { lazyPrepare } from '#storage/lazy.js';

class AfkModel {
  _get = lazyPrepare('SELECT * FROM afk WHERE jid = ?');
  _set = lazyPrepare(
    'INSERT INTO afk (jid, reason, started_at) VALUES (@jid, @reason, @startedAt) ' +
      'ON CONFLICT(jid) DO UPDATE SET reason = excluded.reason, started_at = excluded.started_at'
  );
  _remove = lazyPrepare('DELETE FROM afk WHERE jid = ?');

  get(jid) {
    return this._get().get(jid) ?? null;
  }

  set(jid, reason = '') {
    this._set().run({
      jid,
      reason,
      startedAt: Math.floor(Date.now() / 1000),
    });
  }

  remove(jid) {
    this._remove().run(jid);
  }
}

export const afkModel = new AfkModel();
