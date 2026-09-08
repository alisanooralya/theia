import { sql } from '#storage/connection.js';

class StatsModel {
  async find(jid, client = sql) {
    const rows = await client`SELECT * FROM stats WHERE jid = ${jid}`;
    return rows[0] ?? null;
  }

  async ensure(jid, client = sql) {
    const rows = await client`
      INSERT INTO stats (jid) VALUES (${jid})
      ON CONFLICT (jid) DO UPDATE SET jid = EXCLUDED.jid
      RETURNING *
    `;
    return rows[0] ?? null;
  }

  async addHp(jid, amount, client = sql) {
    await client`
      UPDATE stats SET hp = GREATEST(0, LEAST(max_hp, hp + ${amount})), updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT WHERE jid = ${jid}
    `;
  }

  async fullHeal(jid, client = sql) {
    await client`
      UPDATE stats SET hp = max_hp, updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT WHERE jid = ${jid}
    `;
  }

  async setHp(jid, hp, client = sql) {
    await client`
      UPDATE stats SET hp = ${hp}, updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT WHERE jid = ${jid}
    `;
  }

  async recordWin(jid, client = sql) {
    await client`
      UPDATE stats SET win = win + 1, win_streak = win_streak + 1, updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT WHERE jid = ${jid}
    `;
  }

  async recordLoss(jid, client = sql) {
    await client`
      UPDATE stats SET loss = loss + 1, win_streak = 0, updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT WHERE jid = ${jid}
    `;
  }

  async applyBuff(
    jid,
    { atk = 0, def = 0, expMult = 1, durationMs = 3_600_000 } = {},
    client = sql
  ) {
    const expire =
      Math.floor(Date.now() / 1000) + Math.floor(durationMs / 1000);
    await client`
      UPDATE stats SET buff_atk = buff_atk + ${atk}, buff_def = buff_def + ${def}, buff_exp_mult = ${expMult}, buff_expire = ${expire}, updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT WHERE jid = ${jid}
    `;
  }

  async updateEquipment(jid, { atk, def, maxHp }, client = sql) {
    await client`
      UPDATE stats SET atk = ${atk}, def = ${def}, max_hp = ${maxHp}, hp = LEAST(hp, ${maxHp}), updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT WHERE jid = ${jid}
    `;
  }

  async topWins(limit = 10) {
    return sql`
      SELECT s.jid, s.win, s.loss, u.push_name, u.level FROM stats s JOIN users u ON u.jid = s.jid ORDER BY s.win DESC LIMIT ${limit}
    `;
  }

  async winrate(jid, client = sql) {
    const s = await this.find(jid, client);
    if (!s) return 0;
    const total = s.win + s.loss;
    return total === 0 ? 0 : Math.round((s.win / total) * 100);
  }
}

export const statsModel = new StatsModel();
