import { sql } from '#storage/connection.js';

class RelicModel {
  async find(id, client = sql) {
    const rows = await client`SELECT * FROM relics WHERE id = ${id}`;
    if (!rows[0]) return null;
    rows[0].substats = JSON.parse(rows[0].substats);
    return rows[0];
  }

  async findByOwner(jid, client = sql) {
    const rows =
      await client`SELECT * FROM relics WHERE owner_jid = ${jid} ORDER BY created_at DESC`;
    return rows.map((row) => ({ ...row, substats: JSON.parse(row.substats) }));
  }

  async findByOwnerAndSlot(jid, slot, client = sql) {
    const rows =
      await client`SELECT * FROM relics WHERE owner_jid = ${jid} AND slot = ${slot} ORDER BY created_at DESC`;
    return rows.map((row) => ({ ...row, substats: JSON.parse(row.substats) }));
  }

  async create(data, client = sql) {
    const rows = await client`
      INSERT INTO relics (owner_jid, slot, main_stat, main_value, substats, level)
      VALUES (${data.owner_jid}, ${data.slot}, ${data.main_stat}, ${data.main_value}, ${JSON.stringify(data.substats)}, ${data.level || 1})
      RETURNING id
    `;
    return this.find(Number(rows[0].id), client);
  }

  async update(relic, client = sql) {
    await client`
      UPDATE relics SET level = ${relic.level}, main_value = ${relic.main_value}, substats = ${JSON.stringify(relic.substats)}, updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT WHERE id = ${relic.id}
    `;
    return this.find(relic.id, client);
  }

  async delete(id, client = sql) {
    const result =
      await client`DELETE FROM relics WHERE id = ${id} RETURNING id`;
    return result.length;
  }

  async count(jid, client = sql) {
    const rows =
      await client`SELECT COUNT(*)::int AS count FROM relics WHERE owner_jid = ${jid}`;
    return rows[0].count;
  }

  async getInventory(jid, client = sql) {
    const rows = await client`SELECT * FROM relic_inventory WHERE jid = ${jid}`;
    return rows[0] ?? null;
  }

  async setInventory(jid, headId, handsId, bodyId, feetId, client = sql) {
    await client`
      INSERT INTO relic_inventory (jid, head_id, hands_id, body_id, feet_id)
      VALUES (${jid}, ${headId}, ${handsId}, ${bodyId}, ${feetId})
      ON CONFLICT (jid) DO UPDATE SET
        head_id = EXCLUDED.head_id, hands_id = EXCLUDED.hands_id, body_id = EXCLUDED.body_id, feet_id = EXCLUDED.feet_id,
        updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
    `;
  }

  async isEquipped(relicId, client = sql) {
    const rows = await client`
      SELECT COUNT(*)::int AS count FROM relic_inventory
      WHERE head_id = ${relicId} OR hands_id = ${relicId} OR body_id = ${relicId} OR feet_id = ${relicId}
    `;
    return rows[0].count > 0;
  }
}

export const relicModel = new RelicModel();
