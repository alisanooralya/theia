import { sql } from '#storage/connection.js';

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

  async incrementBankUpgrade(jid, client = sql) {
    await client`
      UPDATE users SET bank_upgrade_count = bank_upgrade_count + 1, updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT WHERE jid = ${jid}
    `;
  }

  async getBankUpgradeCount(jid, client = sql) {
    const user = await this.findById(jid, client);
    return user?.bank_upgrade_count ?? 0;
  }

  async setPremium(jid, durationMs, client = sql) {
    const expiresAt = Math.floor((Date.now() + durationMs) / 1000);
    await client`
      UPDATE users SET premium = 1, premium_exp = ${expiresAt}, updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT WHERE jid = ${jid}
    `;
  }

  async removePremium(jid, client = sql) {
    await client`
      UPDATE users SET premium = 0, premium_exp = 0, updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT WHERE jid = ${jid}
    `;
  }

  async checkPremiumExpiry(jid, client = sql) {
    const user = await this.findById(jid, client);
    if (
      user?.premium &&
      user.premium_exp > 0 &&
      user.premium_exp < Math.floor(Date.now() / 1000)
    ) {
      await this.removePremium(jid, client);
    }
  }

  async ban(jid, client = sql) {
    await client`UPDATE users SET banned = 1, updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT WHERE jid = ${jid}`;
  }

  async unban(jid, client = sql) {
    await client`UPDATE users SET banned = 0, updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT WHERE jid = ${jid}`;
  }

  async isBanned(jid, client = sql) {
    const user = await this.findById(jid, client);
    return (user?.banned ?? 0) === 1;
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
}

export const userModel = new UserModel();