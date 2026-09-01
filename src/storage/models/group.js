import { sql } from '#storage/connection.js';

const ALLOWED_FIELDS = [
  'name',
  'welcome',
  'mute',
  'antitoxic',
  'greeting',
  'openclose',
  'raid',
];

class GroupModel {
  async find(jid, client = sql) {
    const rows = await client`SELECT * FROM groups WHERE jid = ${jid}`;
    return rows[0] ?? null;
  }

  async findRaidGroups(client = sql) {
    const rows = await client`SELECT jid FROM groups WHERE raid = 1`;
    return rows.map((r) => r.jid);
  }

  async ensure(jid, name = '', client = sql) {
    await client`
      INSERT INTO groups (jid, name) VALUES (${jid}, ${name})
      ON CONFLICT (jid) DO UPDATE SET name = EXCLUDED.name, updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
    `;
    return this.find(jid, client);
  }

  async update(jid, fields, client = sql) {
    const entries = Object.entries(fields).filter(([k]) =>
      ALLOWED_FIELDS.includes(k)
    );
    if (!entries.length) return;
    const setClauses = entries.map((_, i) => `${entries[i][0]} = $${i + 1}`);
    const params = entries.map(([, v]) => v);
    setClauses.push('updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT');
    params.push(jid);
    await client.unsafe(
      `UPDATE groups SET ${setClauses.join(', ')} WHERE jid = $${params.length}`,
      params
    );
  }

  async isMuted(jid, client = sql) {
    const g = await this.find(jid, client);
    return (g?.mute ?? 0) === 1;
  }

  async hasAntitoxic(jid, client = sql) {
    const g = await this.find(jid, client);
    return (g?.antitoxic ?? 0) === 1;
  }

  getPrefix(jid) {
    return null;
  }

  async getRaidGroups(client = sql) {
    return this.findRaidGroups(client);
  }
}

export const groupModel = new GroupModel();
