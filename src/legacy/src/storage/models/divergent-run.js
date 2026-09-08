import { sql } from '#storage/connection.js';

class DivergentRunModel {
  async find(jid, client = sql) {
    const rows = await client`SELECT * FROM divergent_runs WHERE jid = ${jid}`;
    if (!rows[0]) return null;
    return { ...rows[0], state: JSON.parse(rows[0].state) };
  }

  async findActiveByChat(chatJid, client = sql) {
    const rows = await client`
      SELECT dr.*, u.push_name
      FROM divergent_runs dr
      LEFT JOIN users u ON u.jid = dr.jid
      WHERE dr.chat_jid = ${chatJid} AND dr.status = 'active'
    `;
    if (!rows[0]) return null;
    return { ...rows[0], state: JSON.parse(rows[0].state) };
  }

  async create(jid, chatJid, state, status = 'active', client = sql) {
    await client`
      INSERT INTO divergent_runs (jid, chat_jid, status, state)
      VALUES (${jid}, ${chatJid}, ${status}, ${JSON.stringify(state)})
      ON CONFLICT (jid) DO UPDATE SET
        chat_jid = EXCLUDED.chat_jid, status = EXCLUDED.status, state = EXCLUDED.state,
        revision = divergent_runs.revision + 1,
        created_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT,
        updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
    `;
    return this.find(jid, client);
  }

  async bindChat(jid, chatJid, client = sql) {
    await client`
      UPDATE divergent_runs
      SET chat_jid = ${chatJid}, revision = revision + 1, updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
      WHERE jid = ${jid} AND status = 'active' AND chat_jid IS NULL
    `;
    return this.find(jid, client);
  }

  async save(run, client = sql) {
    const result = await client`
      UPDATE divergent_runs
      SET status = ${run.status}, state = ${JSON.stringify(run.state)}, revision = revision + 1, updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
      WHERE jid = ${run.jid} AND revision = ${run.revision}
      RETURNING jid
    `;
    if (result.length !== 1)
      throw new Error('Run telah berubah. Coba perintahnya sekali lagi.');
    return this.find(run.jid, client);
  }

  async remove(jid, client = sql) {
    const result =
      await client`DELETE FROM divergent_runs WHERE jid = ${jid} RETURNING jid`;
    return result.length > 0;
  }
}

export const divergentRunModel = new DivergentRunModel();
