import { lazyPrepare } from '#storage/lazy.js';

class DivergentRunModel {
  _find = lazyPrepare('SELECT * FROM divergent_runs WHERE jid = ?');
  _findActiveByChat = lazyPrepare(`
    SELECT dr.*, u.push_name
    FROM divergent_runs dr
    LEFT JOIN users u ON u.jid = dr.jid
    WHERE dr.chat_jid = ? AND dr.status = 'active'
  `);
  _create = lazyPrepare(`
    INSERT INTO divergent_runs (jid, chat_jid, status, state)
    VALUES (@jid, @chatJid, @status, @state)
    ON CONFLICT(jid) DO UPDATE SET
      chat_jid = excluded.chat_jid,
      status = excluded.status,
      state = excluded.state,
      revision = divergent_runs.revision + 1,
      created_at = unixepoch(),
      updated_at = unixepoch()
  `);
  _save = lazyPrepare(`
    UPDATE divergent_runs
    SET status = @status, state = @state, revision = revision + 1,
        updated_at = unixepoch()
    WHERE jid = @jid AND revision = @revision
  `);
  _remove = lazyPrepare('DELETE FROM divergent_runs WHERE jid = ?');
  _bindChat = lazyPrepare(`
    UPDATE divergent_runs
    SET chat_jid = @chatJid, revision = revision + 1,
        updated_at = unixepoch()
    WHERE jid = @jid AND status = 'active' AND chat_jid IS NULL
  `);

  find(jid) {
    const row = this._find().get(jid);
    if (!row) return null;
    return { ...row, state: JSON.parse(row.state) };
  }

  findActiveByChat(chatJid) {
    const row = this._findActiveByChat().get(chatJid);
    if (!row) return null;
    return { ...row, state: JSON.parse(row.state) };
  }

  create(jid, chatJid, state, status = 'active') {
    this._create().run({
      jid,
      chatJid,
      status,
      state: JSON.stringify(state),
    });
    return this.find(jid);
  }

  bindChat(jid, chatJid) {
    this._bindChat().run({ jid, chatJid });
    return this.find(jid);
  }

  save(run) {
    const result = this._save().run({
      jid: run.jid,
      status: run.status,
      state: JSON.stringify(run.state),
      revision: run.revision,
    });
    if (result.changes !== 1) {
      throw new Error('Run telah berubah. Coba perintahnya sekali lagi.');
    }
    return this.find(run.jid);
  }

  remove(jid) {
    return this._remove().run(jid).changes > 0;
  }
}

export const divergentRunModel = new DivergentRunModel();
