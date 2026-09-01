import { sql } from '#storage/connection.js';

class AfkModel {
  async get(jid, client = sql) {
    const rows = await client`SELECT * FROM afk WHERE jid = ${jid}`;
    return rows[0] ?? null;
  }

  async set(jid, reason = '', client = sql) {
    const startedAt = Math.floor(Date.now() / 1000);
    await client`
      INSERT INTO afk (jid, reason, started_at) VALUES (${jid}, ${reason}, ${startedAt})
      ON CONFLICT (jid) DO UPDATE SET reason = EXCLUDED.reason, started_at = EXCLUDED.started_at
    `;
  }

  async remove(jid, client = sql) {
    await client`DELETE FROM afk WHERE jid = ${jid}`;
  }
}

export const afkModel = new AfkModel();
