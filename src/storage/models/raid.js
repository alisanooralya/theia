import { db } from '#storage/connection.js';
import { lazyPrepare } from '#storage/lazy.js';

class RaidModel {
  _findActive = lazyPrepare(
    "SELECT * FROM raids WHERE status = 'active' ORDER BY id DESC LIMIT 1"
  );
  _findEnded = lazyPrepare(
    "SELECT * FROM raids WHERE status IN ('ended', 'cleared') ORDER BY id DESC LIMIT 1"
  );
  _findById = lazyPrepare('SELECT * FROM raids WHERE id = ?');
  _insert = lazyPrepare(`
    INSERT INTO raids (boss_name, boss_hp, boss_max_hp, status, start_at, end_at)
    VALUES (@bossName, @bossHp, @bossMaxHp, @status, @startAt, @endAt)
  `);
  _update = lazyPrepare(`
    UPDATE raids SET boss_hp = @bossHp, status = @status, updated_at = unixepoch()
    WHERE id = @id
  `);
  _findParticipant = lazyPrepare(
    'SELECT * FROM raid_participants WHERE raid_id = @raidId AND jid = @jid'
  );
  _findParticipants = lazyPrepare(
    'SELECT * FROM raid_participants WHERE raid_id = ? ORDER BY damage DESC'
  );
  _insertParticipant = lazyPrepare(`
    INSERT OR IGNORE INTO raid_participants (raid_id, jid, hp, max_hp, damage, status)
    VALUES (@raidId, @jid, 2400, 2400, 0, 'active')
  `);
  _updateParticipant = lazyPrepare(`
    UPDATE raid_participants
    SET hp = @hp, damage = @damage, status = @status, breaktime_until = @breaktimeUntil, updated_at = unixepoch()
    WHERE raid_id = @raidId AND jid = @jid
  `);
  _claimReward = lazyPrepare(`
    UPDATE raid_participants SET reward_claimed = 1, updated_at = unixepoch()
    WHERE raid_id = @raidId AND jid = @jid
  `);
  _addRaidCoin = lazyPrepare(`
    UPDATE users SET raid_coin = raid_coin + @amount, updated_at = unixepoch()
    WHERE jid = @jid
  `);
  _getRaidCoin = lazyPrepare('SELECT raid_coin FROM users WHERE jid = ?');

  getActive() {
    return this._findActive().get() ?? null;
  }

  getEnded() {
    return this._findEnded().get() ?? null;
  }

  getById(id) {
    return this._findById().get(id) ?? null;
  }

  create(bossName, bossHp, startAt, endAt) {
    const result = this._insert().run({
      bossName,
      bossHp,
      bossMaxHp: bossHp,
      status: 'active',
      startAt,
      endAt,
    });
    return this._findById().get(result.lastInsertRowid);
  }

  updateBoss(raidId, bossHp, status) {
    this._update().run({ id: raidId, bossHp, status });
  }

  getParticipant(raidId, jid) {
    return this._findParticipant().get({ raidId, jid }) ?? null;
  }

  getParticipants(raidId) {
    return this._findParticipants().all(raidId);
  }

  addParticipant(raidId, jid) {
    this._insertParticipant().run({ raidId, jid });
    return this.getParticipant(raidId, jid);
  }

  updateParticipant(raidId, jid, data) {
    this._updateParticipant().run({
      raidId,
      jid,
      hp: data.hp,
      damage: data.damage,
      status: data.status,
      breaktimeUntil: data.breaktimeUntil ?? 0,
    });
  }

  claimReward(raidId, jid) {
    this._claimReward().run({ raidId, jid });
  }

  addRaidCoin(jid, amount) {
    this._addRaidCoin().run({ jid, amount });
  }

  getRaidCoin(jid) {
    return this._getRaidCoin().get(jid)?.raid_coin ?? 0;
  }
}

export const raidModel = new RaidModel();
