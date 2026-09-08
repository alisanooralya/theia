import { sql } from '#storage/connection.js';

class ArtifactModel {
  async find(ownerJid, userId, client = sql) {
    const rows =
      await client`SELECT * FROM artifacts WHERE owner_jid = ${ownerJid} AND user_id = ${userId}`;
    if (!rows[0]) return null;
    rows[0].substats = JSON.parse(rows[0].substats);
    return rows[0];
  }

  async findById(id, client = sql) {
    const rows = await client`SELECT * FROM artifacts WHERE id = ${id}`;
    if (!rows[0]) return null;
    rows[0].substats = JSON.parse(rows[0].substats);
    return rows[0];
  }

  async findByOwner(jid, client = sql) {
    const rows =
      await client`SELECT * FROM artifacts WHERE owner_jid = ${jid} ORDER BY user_id ASC`;
    return rows.map((row) => ({ ...row, substats: JSON.parse(row.substats) }));
  }

  async findByOwnerAndSlot(jid, slot, client = sql) {
    const rows =
      await client`SELECT * FROM artifacts WHERE owner_jid = ${jid} AND slot = ${slot} ORDER BY user_id ASC`;
    return rows.map((row) => ({ ...row, substats: JSON.parse(row.substats) }));
  }

  async create(data, client = sql) {
    const nextRows = await client`
      SELECT COALESCE(MAX(user_id), 0) + 1 AS next_id FROM artifacts WHERE owner_jid = ${data.owner_jid}
    `;
    const userId = nextRows[0].next_id;
    const result = await client`
      INSERT INTO artifacts (owner_jid, user_id, name, slot, level, main_stat, main_value, substats)
      VALUES (${data.owner_jid}, ${userId}, ${data.name || ''}, ${data.slot}, ${data.level ?? 1}, ${data.main_stat}, ${data.main_value}, ${JSON.stringify(data.substats || {})})
      RETURNING id
    `;
    return this.findById(Number(result[0].id), client);
  }

  async update(artifact, client = sql) {
    await client`
      UPDATE artifacts SET level = ${artifact.level}, main_value = ${artifact.main_value}, substats = ${JSON.stringify(artifact.substats)}, updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT WHERE id = ${artifact.id}
    `;
    return this.findById(artifact.id, client);
  }

  async delete(id, client = sql) {
    const result =
      await client`DELETE FROM artifacts WHERE id = ${id} RETURNING id`;
    return result.length;
  }

  async count(jid, client = sql) {
    const rows =
      await client`SELECT COUNT(*)::int AS count FROM artifacts WHERE owner_jid = ${jid}`;
    return rows[0].count;
  }

  async getInventory(jid, client = sql) {
    const rows =
      await client`SELECT * FROM artifact_inventory WHERE jid = ${jid}`;
    return rows[0] ?? null;
  }

  async setInventory(
    jid,
    flowerId,
    featherId,
    sandsId,
    gobletId,
    circletId,
    client = sql
  ) {
    await client`
      INSERT INTO artifact_inventory (jid, flower_id, feather_id, sands_id, goblet_id, circlet_id)
      VALUES (${jid}, ${flowerId}, ${featherId}, ${sandsId}, ${gobletId}, ${circletId})
      ON CONFLICT (jid) DO UPDATE SET
        flower_id = EXCLUDED.flower_id, feather_id = EXCLUDED.feather_id,
        sands_id = EXCLUDED.sands_id, goblet_id = EXCLUDED.goblet_id,
        circlet_id = EXCLUDED.circlet_id,
        updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
    `;
  }

  async isEquipped(artifactId, client = sql) {
    const rows = await client`
      SELECT COUNT(*)::int AS count FROM artifact_inventory
      WHERE flower_id = ${artifactId} OR feather_id = ${artifactId} OR sands_id = ${artifactId} OR goblet_id = ${artifactId} OR circlet_id = ${artifactId}
    `;
    return rows[0].count > 0;
  }
}

export const artifactModel = new ArtifactModel();
