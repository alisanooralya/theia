import { db } from '#storage/connection.js';
import { lazyPrepare } from '#storage/lazy.js';

class ArtifactModel {
  _find = lazyPrepare('SELECT * FROM artifacts WHERE id = ?');
  _findByOwner = lazyPrepare('SELECT * FROM artifacts WHERE owner_jid = ? ORDER BY created_at DESC');
  _findByOwnerAndSlot = lazyPrepare('SELECT * FROM artifacts WHERE owner_jid = ? AND slot = ? ORDER BY created_at DESC');
  _insert = lazyPrepare(`
    INSERT INTO artifacts (owner_jid, name, slot, level, main_stat, main_value, substats)
    VALUES (@owner_jid, @name, @slot, @level, @main_stat, @main_value, @substats)
  `);
  _update = lazyPrepare(
    'UPDATE artifacts SET level = @level, main_value = @main_value, substats = @substats, updated_at = unixepoch() WHERE id = @id'
  );
  _delete = lazyPrepare('DELETE FROM artifacts WHERE id = ?');
  _count = lazyPrepare('SELECT COUNT(*) as count FROM artifacts WHERE owner_jid = ?');
  _findInventory = lazyPrepare('SELECT * FROM artifact_inventory WHERE jid = ?');
  _upsertInventory = lazyPrepare(`
    INSERT INTO artifact_inventory (jid, flower_id, feather_id, sands_id, goblet_id, circlet_id)
    VALUES (@jid, @flower_id, @feather_id, @sands_id, @goblet_id, @circlet_id)
    ON CONFLICT(jid) DO UPDATE SET
      flower_id = @flower_id, feather_id = @feather_id, sands_id = @sands_id,
      goblet_id = @goblet_id, circlet_id = @circlet_id,
      updated_at = unixepoch()
  `);
  _equippedCount = lazyPrepare(`
    SELECT COUNT(*) as count FROM artifact_inventory
    WHERE flower_id = ? OR feather_id = ? OR sands_id = ? OR goblet_id = ? OR circlet_id = ?
  `);

  find(id) {
    const row = this._find().get(id);
    if (row) row.substats = JSON.parse(row.substats);
    return row ?? null;
  }

  findByOwner(jid) {
    return this._findByOwner().all(jid).map((row) => {
      row.substats = JSON.parse(row.substats);
      return row;
    });
  }

  findByOwnerAndSlot(jid, slot) {
    return this._findByOwnerAndSlot().all(jid, slot).map((row) => {
      row.substats = JSON.parse(row.substats);
      return row;
    });
  }

  create(data) {
    const result = this._insert().run({
      owner_jid: data.owner_jid,
      name: data.name || '',
      slot: data.slot,
      level: data.level ?? 0,
      main_stat: data.main_stat,
      main_value: data.main_value,
      substats: JSON.stringify(data.substats || {}),
    });
    return this.find(Number(result.lastInsertRowid));
  }

  update(artifact) {
    this._update().run({
      id: artifact.id,
      level: artifact.level,
      main_value: artifact.main_value,
      substats: JSON.stringify(artifact.substats),
    });
    return this.find(artifact.id);
  }

  delete(id) {
    return this._delete().run(id);
  }

  count(jid) {
    return this._count().get(jid).count;
  }

  getInventory(jid) {
    return this._findInventory().get(jid) ?? null;
  }

  setInventory(jid, flowerId, featherId, sandsId, gobletId, circletId) {
    return this._upsertInventory().run({
      jid,
      flower_id: flowerId,
      feather_id: featherId,
      sands_id: sandsId,
      goblet_id: gobletId,
      circlet_id: circletId,
    });
  }

  isEquipped(artifactId) {
    const result = this._equippedCount().get(
      artifactId, artifactId, artifactId, artifactId, artifactId
    );
    return result.count > 0;
  }
}

export const artifactModel = new ArtifactModel();
