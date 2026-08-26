import { lazyPrepare } from '#storage/lazy.js';

class DivergentUsageModel {
  _find = lazyPrepare('SELECT * FROM divergent_usage WHERE jid = ?');
  _ensure = lazyPrepare(`
    INSERT INTO divergent_usage (jid) VALUES (?)
    ON CONFLICT(jid) DO NOTHING
  `);
  _update = lazyPrepare(`
    UPDATE divergent_usage
    SET daily_key = @dailyKey, daily_count = @dailyCount,
        weekly_key = @weeklyKey, weekly_count = @weeklyCount,
        updated_at = unixepoch()
    WHERE jid = @jid
  `);

  find(jid) {
    return this._find().get(jid) ?? null;
  }

  ensure(jid) {
    this._ensure().run(jid);
    return this.find(jid);
  }

  save(jid, usage) {
    this._update().run({ jid, ...usage });
    return this.find(jid);
  }
}

export const divergentUsageModel = new DivergentUsageModel();
