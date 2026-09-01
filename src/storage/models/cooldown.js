import { sql } from '#storage/connection.js';

class CooldownModel {
  async check(jid, command, client = sql) {
    const key = `${jid}:${command}`;
    const rows =
      await client`SELECT expires_at FROM cooldowns WHERE key = ${key}`;
    const row = rows[0];
    if (!row) return 0;
    const remaining = row.expires_at * 1000 - Date.now();
    if (remaining <= 0) {
      await client`DELETE FROM cooldowns WHERE key = ${key}`;
      return 0;
    }
    return remaining;
  }

  async set(jid, command, durationMs, client = sql) {
    const key = `${jid}:${command}`;
    const expiresAt = Math.floor((Date.now() + durationMs) / 1000);
    await client`
      INSERT INTO cooldowns (key, expires_at) VALUES (${key}, ${expiresAt})
      ON CONFLICT (key) DO UPDATE SET expires_at = EXCLUDED.expires_at
    `;
  }

  async clear(jid, command, client = sql) {
    await client`DELETE FROM cooldowns WHERE key = ${`${jid}:${command}`}`;
  }

  async cleanup(client = sql) {
    const result = await client`
      DELETE FROM cooldowns WHERE expires_at < (EXTRACT(EPOCH FROM NOW()))::BIGINT
    `;
    return result.count;
  }
}

export const cooldownModel = new CooldownModel();
