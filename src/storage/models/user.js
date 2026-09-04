import { sql } from '#storage/connection.js';
import { bannedCache } from '#helpers/cache.js';

class UserModel {
  async findById(jid, client = sql) {
    const rows = await client`SELECT * FROM users WHERE jid = ${jid}`;
    return rows[0] ?? null;
  }

  async findByPn(pnJid, client = sql) {
    const rows = await client`SELECT * FROM users WHERE pn = ${pnJid}`;
    return rows[0] ?? null;
  }

  async ensure(jid, { pn = null, pushName = '' } = {}, client = sql) {
    const rows = await client`
      INSERT INTO users (jid, pn, push_name) VALUES (${jid}, ${pn}, ${pushName})
      ON CONFLICT (jid) DO UPDATE SET push_name = EXCLUDED.push_name, updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
      RETURNING *
    `;
    const user = rows[0];
    await client`INSERT INTO wallets (jid) VALUES (${jid}) ON CONFLICT (jid) DO NOTHING`;
    return user;
  }

  async addExp(jid, amount, client = sql) {
    await client`
      UPDATE users SET exp = exp + ${amount}, updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT WHERE jid = ${jid}
    `;
    const user = await this.findById(jid, client);
    const threshold = this.expForLevel(user.level + 1);
    if (user.exp >= threshold) {
      const newLevel = user.level + 1;
      await client`
        UPDATE users SET level = ${newLevel}, exp = 0, updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT WHERE jid = ${jid}
      `;
      return {
        user: { ...user, level: newLevel, exp: 0 },
        leveledUp: true,
        newLevel,
      };
    }
    return { user, leveledUp: false, newLevel: user.level };
  }

  expForLevel(level) {
    return level * level * 100;
  }

  async recordDaily(jid, client = sql) {
    const user = await this.findById(jid, client);
    const nowSec = Math.floor(Date.now() / 1000);
    const last = user?.last_daily ?? 0;
    let streak = 1;
    if (last > 0) {
      const gapSec = nowSec - last;
      if (gapSec < 48 * 3600) streak = (user.daily_streak ?? 0) + 1;
    }
    await client`
      UPDATE users SET daily_streak = ${streak}, last_daily = ${nowSec}, updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT WHERE jid = ${jid}
    `;
    return streak;
  }

  async ban(jid, client = sql) {
    bannedCache.del(jid);
    await client`UPDATE users SET banned = 1, updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT WHERE jid = ${jid}`;
  }

  async unban(jid, client = sql) {
    bannedCache.del(jid);
    await client`UPDATE users SET banned = 0, updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT WHERE jid = ${jid}`;
  }

  async isBanned(jid, client = sql) {
    const cached = bannedCache.get(jid);
    if (cached !== undefined) return cached === 1;
    const user = await this.findById(jid, client);
    const banned = (user?.banned ?? 0) === 1;
    bannedCache.set(jid, banned ? 1 : 0);
    return banned;
  }

  async setPrisonUntil(jid, epochSec, client = sql) {
    await client`
      UPDATE users SET prison_until = ${epochSec}, updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT WHERE jid = ${jid}
    `;
  }

  async leaderboard(limit = 10) {
    return sql`
      SELECT u.jid, u.push_name, u.level, u.exp, w.cash + w.bank AS total_balance
      FROM users u LEFT JOIN wallets w ON w.jid = u.jid
      ORDER BY u.level DESC, u.exp DESC LIMIT ${limit}
    `;
  }

  async recordBounty(jid, client = sql) {
    const nowSec = Math.floor(Date.now() / 1000);
    await client`
      UPDATE users SET last_bounty = ${nowSec}, updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT WHERE jid = ${jid}
    `;
    return nowSec;
  }
}

export const userModel = new UserModel();
