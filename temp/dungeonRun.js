import { db } from '#storage/connection.js'
import { lazyPrepare } from '#storage/lazy.js'

db.exec(`
  CREATE TABLE IF NOT EXISTS dungeon_runs (
    jid TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'active',      -- active | cleared | defeated | abandoned
    current_node INTEGER NOT NULL DEFAULT 1,     -- 1-based, node yang sedang dihadapi
    total_nodes INTEGER NOT NULL DEFAULT 6,
    node_types TEXT NOT NULL,                    -- JSON array, e.g. ["combat","event","elite","treasure","rest","boss"]
    blessings TEXT NOT NULL DEFAULT '[]',         -- JSON array of blessing id yang sudah dikoleksi (stacking)
    curios TEXT NOT NULL DEFAULT '[]',            -- JSON array of curio id yang sudah dikoleksi
    pending_choice TEXT,                          -- JSON: opsi yang sedang menunggu dipilih via !dungeon choose <n>, null kalau tidak ada
    total_cash INTEGER NOT NULL DEFAULT 0,        -- akumulasi cash yang sudah dibayar sepanjang run ini
    total_exp INTEGER NOT NULL DEFAULT 0,         -- akumulasi exp yang sudah dibayar sepanjang run ini
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
  )
`)

function parseRow(row) {
  if (!row) return null
  return {
    ...row,
    node_types: JSON.parse(row.node_types),
    blessings: JSON.parse(row.blessings),
    curios: JSON.parse(row.curios),
    pending_choice: row.pending_choice ? JSON.parse(row.pending_choice) : null,
  }
}

class DungeonRunModel {
  _find = lazyPrepare('SELECT * FROM dungeon_runs WHERE jid = ?')
  _insert = lazyPrepare(`
    INSERT INTO dungeon_runs (jid, status, current_node, total_nodes, node_types, blessings, curios, pending_choice, total_cash, total_exp)
    VALUES (@jid, 'active', 1, @totalNodes, @nodeTypes, '[]', '[]', @pendingChoice, 0, 0)
    ON CONFLICT(jid) DO UPDATE SET
      status = 'active', current_node = 1, total_nodes = @totalNodes,
      node_types = @nodeTypes, blessings = '[]', curios = '[]',
      pending_choice = @pendingChoice, total_cash = 0, total_exp = 0,
      updated_at = unixepoch()
  `)
  _setPendingChoice = lazyPrepare(`
    UPDATE dungeon_runs SET pending_choice = @pendingChoice, updated_at = unixepoch() WHERE jid = @jid
  `)
  _advanceNode = lazyPrepare(`
    UPDATE dungeon_runs SET current_node = current_node + 1, pending_choice = NULL, updated_at = unixepoch() WHERE jid = @jid
  `)
  _addBlessing = lazyPrepare(`
    UPDATE dungeon_runs SET blessings = @blessings, updated_at = unixepoch() WHERE jid = @jid
  `)
  _addCurio = lazyPrepare(`
    UPDATE dungeon_runs SET curios = @curios, updated_at = unixepoch() WHERE jid = @jid
  `)
  _addRewards = lazyPrepare(`
    UPDATE dungeon_runs SET total_cash = total_cash + @cash, total_exp = total_exp + @exp, updated_at = unixepoch() WHERE jid = @jid
  `)
  _finish = lazyPrepare(`
    UPDATE dungeon_runs SET status = @status, pending_choice = NULL, updated_at = unixepoch() WHERE jid = @jid
  `)

  find(jid) {
    return parseRow(this._find().get(jid))
  }

  findActive(jid) {
    const run = this.find(jid)
    return run?.status === 'active' ? run : null
  }

  // Mulai run baru. Kalau ada run lama (status apapun), row-nya di-overwrite oleh yang baru.
  // Panggil findActive() dulu di service layer untuk cegah start ganda saat run masih aktif.
  create(jid, { nodeTypes, pendingChoice = null }) {
    this._insert().run({
      jid,
      totalNodes: nodeTypes.length,
      nodeTypes: JSON.stringify(nodeTypes),
      pendingChoice: pendingChoice ? JSON.stringify(pendingChoice) : null,
    })
    return this.find(jid)
  }

  setPendingChoice(jid, choice) {
    this._setPendingChoice().run({ jid, pendingChoice: choice ? JSON.stringify(choice) : null })
  }

  advanceNode(jid) {
    this._advanceNode().run({ jid })
    return this.find(jid)
  }

  addBlessing(jid, blessingId) {
    const run = this.find(jid)
    const blessings = [...(run?.blessings ?? []), blessingId]
    this._addBlessing().run({ jid, blessings: JSON.stringify(blessings) })
    return blessings
  }

  addCurio(jid, curioId) {
    const run = this.find(jid)
    const curios = [...(run?.curios ?? []), curioId]
    this._addCurio().run({ jid, curios: JSON.stringify(curios) })
    return curios
  }

  removeCurio(jid, curioId) {
    const run = this.find(jid)
    const curios = (run?.curios ?? []).filter((c) => c !== curioId)
    this._addCurio().run({ jid, curios: JSON.stringify(curios) })
    return curios
  }

  addRewards(jid, cash = 0, exp = 0) {
    this._addRewards().run({ jid, cash, exp })
  }

  // status: 'cleared' | 'defeated' | 'abandoned'
  finish(jid, status) {
    this._finish().run({ jid, status })
    return this.find(jid)
  }
}

export const dungeonRunModel = new DungeonRunModel()
