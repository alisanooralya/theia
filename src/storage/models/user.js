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
    return user;
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
}

export const userModel = new UserModel();
