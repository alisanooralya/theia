import { db } from '#storage/connection.js';
import { lazyPrepare } from '#storage/lazy.js';

class GroupModel {
  _find = lazyPrepare('SELECT * FROM groups WHERE jid = ?');
  _findRaidGroups = lazyPrepare('SELECT jid FROM groups WHERE raid = 1');
  _ensure = lazyPrepare(`
    INSERT INTO groups (jid, name) VALUES (@jid, @name)
    ON CONFLICT(jid) DO UPDATE SET name = excluded.name, updated_at = unixepoch()
  `);

  find(jid) {
    return this._find().get(jid) ?? null;
  }

  ensure(jid, name = '') {
    this._ensure().run({ jid, name });
    return this._find().get(jid);
  }

  update(jid, fields) {
    const allowed = [
      'name',
      'welcome',
      'mute',
      'antitoxic',
      'greeting',
      'openclose',
      'raid',
    ];
    const updates = Object.entries(fields)
      .filter(([k]) => allowed.includes(k))
      .map(([k]) => `${k} = @${k}`)
      .join(', ');
    if (!updates) return;
    db.prepare(
      `UPDATE groups SET ${updates}, updated_at = unixepoch() WHERE jid = @jid`
    ).run({ jid, ...fields });
  }

  isMuted(jid) {
    return (this._find().get(jid)?.mute ?? 0) === 1;
  }
  hasAntitoxic(jid) {
    return (this._find().get(jid)?.antitoxic ?? 0) === 1;
  }
  getPrefix(jid) {
    return this._find().get(jid)?.prefix ?? null;
  }

  getRaidGroups() {
    return this._findRaidGroups().all().map((r) => r.jid);
  }
}

export const groupModel = new GroupModel();
