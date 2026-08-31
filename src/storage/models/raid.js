import { sql } from '#storage/connection.js';

class RaidModel {
  async getActive(client = sql) {
    const rows = await client`SELECT * FROM raids WHERE status = 'active' ORDER BY id DESC LIMIT 1`;
    return rows[0] ?? null;
  }

  async getEnded(client = sql) {
    const rows = await client`SELECT * FROM raids WHERE status IN ('ended', 'cleared') ORDER BY id DESC LIMIT 1`;
    return rows[0] ?? null;
  }

  async getById(id, client = sql) {
    const rows = await client`SELECT * FROM raids WHERE id = ${id}`;
    return rows[0] ?? null;
  }

  async create(bossName, bossHp, startAt, endAt, client = sql) {
    const result = await client`
      INSERT INTO raids (boss_name, boss_hp, boss_max_hp, status, start_at, end_at)
      VALUES (${bossName}, ${bossHp}, ${bossHp}, 'active', ${startAt}, ${endAt})
      RETURNING id
    `;
    return this.getById(Number(result[0].id), client);
  }

  async updateBoss(raidId, bossHp, status, client = sql) {
    await client`
      UPDATE raids SET boss_hp = ${bossHp}, status = ${status}, updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT WHERE id = ${raidId}
    `;
  }

  async getParticipant(raidId, jid, client = sql) {
    const rows = await client`SELECT * FROM raid_participants WHERE raid_id = ${raidId} AND jid = ${jid}`;
    return rows[0] ?? null;
  }

  async getParticipants(raidId, client = sql) {
    return client`SELECT * FROM raid_participants WHERE raid_id = ${raidId} ORDER BY damage DESC`;
  }

  async addParticipant(raidId, jid, client = sql) {
    await client`
      INSERT INTO raid_participants (raid_id, jid, hp, max_hp, damage, status)
      VALUES (${raidId}, ${jid}, 2400, 2400, 0, 'active')
      ON CONFLICT (raid_id, jid) DO NOTHING
    `;
    return this.getParticipant(raidId, jid, client);
  }

  async updateParticipant(raidId, jid, data, client = sql) {
    await client`
      UPDATE raid_participants
      SET hp = ${data.hp}, damage = ${data.damage}, status = ${data.status},
          breaktime_until = ${data.breaktimeUntil ?? 0}, updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
      WHERE raid_id = ${raidId} AND jid = ${jid}
    `;
  }

  async claimReward(raidId, jid, client = sql) {
    await client`
      UPDATE raid_participants SET reward_claimed = 1, updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT WHERE raid_id = ${raidId} AND jid = ${jid}
    `;
  }

  async addRaidCoin(jid, amount, client = sql) {
    await client`
      UPDATE users SET raid_coin = raid_coin + ${amount}, updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT WHERE jid = ${jid}
    `;
  }

  async getRaidCoin(jid, client = sql) {
    const rows = await client`SELECT raid_coin FROM users WHERE jid = ${jid}`;
    return rows[0]?.raid_coin ?? 0;
  }
}

export const raidModel = new RaidModel();