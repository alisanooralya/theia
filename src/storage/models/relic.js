import { db } from '#storage/connection.js';
import { lazyPrepare } from '#storage/lazy.js';

class RelicModel {
  _find = lazyPrepare('SELECT * FROM relics WHERE id = ?');
  _findByOwner = lazyPrepare('SELECT * FROM relics WHERE owner_jid = ? ORDER BY created_at DESC');
  _findByOwnerAndSlot = lazyPrepare('SELECT * FROM relics WHERE owner_jid = ? AND slot = ? ORDER BY created_at DESC');
  _insert = lazyPrepare(`
    INSERT INTO relics (owner_jid, slot, main_stat, main_value, substats, level)
    VALUES (@owner_jid, @slot, @main_stat, @main_value, @substats, @level)
  `);
  _update = lazyPrepare('UPDATE relics SET level = @level, main_value = @main_value, substats = @substats, updated_at = unixepoch() WHERE id = @id');
  _delete = lazyPrepare('DELETE FROM relics WHERE id = ?');
  _count = lazyPrepare('SELECT COUNT(*) as count FROM relics WHERE owner_jid = ?');
  _findInventory = lazyPrepare('SELECT * FROM relic_inventory WHERE jid = ?');
  _upsertInventory = lazyPrepare(`
    INSERT INTO relic_inventory (jid, head_id, hands_id, body_id, feet_id)
    VALUES (@jid, @head_id, @hands_id, @body_id, @feet_id)
    ON CONFLICT(jid) DO UPDATE SET
      head_id = @head_id, hands_id = @hands_id, body_id = @body_id, feet_id = @feet_id,
      updated_at = unixepoch()
  `);
  _equippedCount = lazyPrepare(`
    SELECT COUNT(*) as count FROM relic_inventory
    WHERE head_id = ? OR hands_id = ? OR body_id = ? OR feet_id = ?
  `);

  find(id) {
    const row = this._find().get(id);
    if (row) row.substats = JSON.parse(row.substats);
    return row ?? null;
  }

  findByOwner(jid) {
    return this._findByOwner.all(jid).map((row) => {
      row.substats = JSON.parse(row.substats);
      return row;
    });
  }

  findByOwnerAndSlot(jid, slot) {
    return this._findByOwnerAndSlot.all(jid, slot).map((row) => {
      row.substats = JSON.parse(row.substats);
      return row;
    });
  }

  create(data) {
    const result = this._insert().run({
      owner_jid: data.owner_jid,
      slot: data.slot,
      main_stat: data.main_stat,
      main_value: data.main_value,
      substats: JSON.stringify(data.substats),
      level: data.level || 1,
    });
    return this.find(Number(result.lastInsertRowid));
  }

  update(relic) {
    this._update().run({
      id: relic.id,
      level: relic.level,
      main_value: relic.main_value,
      substats: JSON.stringify(relic.substats),
    });
    return this.find(relic.id);
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

  setInventory(jid, headId, handsId, bodyId, feetId) {
    return this._upsertInventory().run({
      jid,
      head_id: headId,
      hands_id: handsId,
      body_id: bodyId,
      feet_id: feetId,
    });
  }

  isEquipped(relicId) {
    const result = this._equippedCount().get(relicId, relicId, relicId, relicId);
    return result.count > 0;
  }
}

export const relicModel = new RelicModel();
