import { sql } from '#storage/connection.js';

class DivergentUsageModel {
  async find(jid, client = sql) {
    const rows = await client`SELECT * FROM divergent_usage WHERE jid = ${jid}`;
    return rows[0] ?? null;
  }

  async ensure(jid, client = sql) {
    await client`INSERT INTO divergent_usage (jid) VALUES (${jid}) ON CONFLICT (jid) DO NOTHING`;
    return this.find(jid, client);
  }

  async save(jid, usage, client = sql) {
    await client`
      UPDATE divergent_usage
      SET daily_key = ${usage.daily_key}, daily_count = ${usage.daily_count},
          weekly_key = ${usage.weekly_key}, weekly_count = ${usage.weekly_count},
          updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
      WHERE jid = ${jid}
    `;
    return this.find(jid, client);
  }
}

export const divergentUsageModel = new DivergentUsageModel();
