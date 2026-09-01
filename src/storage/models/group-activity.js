import { sql } from '#storage/connection.js';

function calcLevel(xp) {
  return Math.floor(Math.sqrt(xp / 100)) + 1;
}

function xpForLevel(level) {
  return (level - 1) * (level - 1) * 100;
}

class GroupActivityModel {
  async addXp(jid, userJid, amount, client = sql) {
    const before = await this.get(jid, userJid, client);
    const beforeLevel = before ? before.level : 1;
    await client`
      INSERT INTO group_activity (jid, user_jid, xp, level, message_count, updated_at)
      VALUES (${jid}, ${userJid}, ${amount}, ${calcLevel(amount)}, 1, (EXTRACT(EPOCH FROM NOW()))::BIGINT)
      ON CONFLICT (jid, user_jid) DO UPDATE SET
        xp = xp + ${amount},
        level = CAST(FLOOR(SQRT((xp + ${amount}) / 100.0)) AS INTEGER) + 1,
        message_count = message_count + 1,
        updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
    `;
    const after = await this.get(jid, userJid, client);
    return {
      before: beforeLevel,
      after: after.level,
      xp: after.xp,
      leveledUp: after.level > beforeLevel,
    };
  }

  async get(jid, userJid, client = sql) {
    const rows = await client`
      SELECT * FROM group_activity WHERE jid = ${jid} AND user_jid = ${userJid}
    `;
    return rows[0] ?? null;
  }

  async top(jid, limit = 10, client = sql) {
    return client`
      SELECT * FROM group_activity WHERE jid = ${jid} ORDER BY xp DESC LIMIT ${limit}
    `;
  }

  async rank(jid, userJid, client = sql) {
    const rows = await client`
      SELECT COUNT(*)::int AS rank FROM group_activity
      WHERE jid = ${jid} AND xp > (SELECT xp FROM group_activity WHERE jid = ${jid} AND user_jid = ${userJid})
    `;
    return (rows[0]?.rank ?? 0) + 1;
  }

  async stats(jid, client = sql) {
    const rows = await client`
      SELECT COUNT(DISTINCT user_jid)::int AS members, SUM(message_count)::int AS total, SUM(xp)::int AS total_xp
      FROM group_activity WHERE jid = ${jid}
    `;
    return rows[0] ?? { members: 0, total: 0, total_xp: 0 };
  }

  xpForNext(level) {
    return xpForLevel(level + 1);
  }

  calcLevel(xp) {
    return calcLevel(xp);
  }
}

export const groupActivityModel = new GroupActivityModel();
