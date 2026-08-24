import { db } from '#storage/connection.js';
import { lazyPrepare } from '#storage/lazy.js';

class StatsModel {
  _find = lazyPrepare('SELECT * FROM stats WHERE jid = ?');
  _ensure = lazyPrepare(
    'INSERT INTO stats (jid) VALUES (?) ON CONFLICT(jid) DO NOTHING'
  );
  _setHp = lazyPrepare(
    'UPDATE stats SET hp = @hp, updated_at = unixepoch() WHERE jid = @jid'
  );
  _addHp = lazyPrepare(
    'UPDATE stats SET hp = MAX(0, MIN(max_hp, hp + @amount)), updated_at = unixepoch() WHERE jid = @jid'
  );
  _fullHeal = lazyPrepare(
    'UPDATE stats SET hp = max_hp, updated_at = unixepoch() WHERE jid = @jid'
  );
  _recordBattle = lazyPrepare(
    'UPDATE stats SET win = win + @win, loss = loss + @loss, win_streak = CASE WHEN @win = 1 THEN win_streak + 1 ELSE 0 END, updated_at = unixepoch() WHERE jid = @jid'
  );
  _applyBuff = lazyPrepare(
    'UPDATE stats SET buff_atk = buff_atk + @atk, buff_def = buff_def + @def, buff_exp_mult = @expMult, buff_expire = @expire, updated_at = unixepoch() WHERE jid = @jid'
  );

  applyBuff(
    jid,
    { atk = 0, def = 0, expMult = 1, durationMs = 3_600_000 } = {}
  ) {
    const expire =
      Math.floor(Date.now() / 1000) + Math.floor(durationMs / 1000);
    this._applyBuff().run({ jid, atk, def, expMult, expire });
  }
  _equip = lazyPrepare(
    'UPDATE stats SET weapon_id=@weaponId, armor_id=@armorId, atk=@atk, def=@def, max_hp=@maxHp, hp=MIN(hp,@maxHp), updated_at=unixepoch() WHERE jid=@jid'
  );
  _topWins = lazyPrepare(
    'SELECT s.jid, s.win, s.loss, u.push_name, u.level FROM stats s JOIN users u ON u.jid = s.jid ORDER BY s.win DESC LIMIT ?'
  );

  find(jid) {
    return this._find().get(jid) ?? null;
  }
  ensure(jid) {
    this._ensure().run(jid);
    return this._find().get(jid);
  }
  addHp(jid, amount) {
    this._addHp().run({ jid, amount });
  }
  fullHeal(jid) {
    this._fullHeal().run({ jid });
  }
  setHp(jid, hp) {
    this._setHp().run({ jid, hp });
  }
  recordWin(jid) {
    this._recordBattle().run({ jid, win: 1, loss: 0 });
  }
  recordLoss(jid) {
    this._recordBattle().run({ jid, win: 0, loss: 1 });
  }

  updateEquipment(jid, { weaponId = null, armorId = null, atk, def, maxHp }) {
    this._equip().run({ jid, weaponId, armorId, atk, def, maxHp });
  }

  topWins(limit = 10) {
    return this._topWins().all(limit);
  }

  winrate(jid) {
    const s = this._find().get(jid);
    if (!s) return 0;
    const total = s.win + s.loss;
    return total === 0 ? 0 : Math.round((s.win / total) * 100);
  }
}

export const statsModel = new StatsModel();
