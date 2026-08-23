import { db } from '#storage/connection.js'
import { lazyPrepare } from '#storage/lazy.js'

function calcLevel(xp) {
  return Math.floor(Math.sqrt(xp / 100)) + 1
}

function xpForLevel(level) {
  return (level - 1) * (level - 1) * 100
}

class GroupActivityModel {
  _upsert = lazyPrepare(`
    INSERT INTO group_activity (jid, user_jid, xp, level, message_count, updated_at)
    VALUES (@jid, @user_jid, @xp, @level, 1, unixepoch())
    ON CONFLICT(jid, user_jid) DO UPDATE SET
      xp = xp + @xp,
      level = CAST(sqrt((xp + @xp) / 100) AS INTEGER) + 1,
      message_count = message_count + 1,
      updated_at = unixepoch()
  `)
  _findOne = lazyPrepare('SELECT * FROM group_activity WHERE jid = ? AND user_jid = ?')
  _top = lazyPrepare('SELECT * FROM group_activity WHERE jid = ? ORDER BY xp DESC LIMIT ?')
  _rank = lazyPrepare(`
    SELECT COUNT(*) as rank FROM group_activity
    WHERE jid = ? AND xp > (SELECT xp FROM group_activity WHERE jid = ? AND user_jid = ?)
  `)
  _stats = lazyPrepare(`
    SELECT COUNT(DISTINCT user_jid) as members, SUM(message_count) as total, SUM(xp) as total_xp
    FROM group_activity WHERE jid = ?
  `)
  _allGroups = lazyPrepare('SELECT jid, COUNT(*) as members FROM group_activity GROUP BY jid')

  addXp(jid, userJid, amount) {
    const before = this._findOne().get(jid, userJid)
    const beforeLevel = before ? before.level : 1
    this._upsert().run({ jid, user_jid: userJid, xp: amount, level: calcLevel(amount) })
    const after = this._findOne().get(jid, userJid)
    return { before: beforeLevel, after: after.level, xp: after.xp, leveledUp: after.level > beforeLevel }
  }

  get(jid, userJid) {
    return this._findOne().get(jid, userJid) ?? null
  }

  top(jid, limit = 10) {
    return this._top().all(jid, limit)
  }

  rank(jid, userJid) {
    const row = this._rank().get(jid, jid, userJid)
    return (row?.rank ?? 0) + 1
  }

  stats(jid) {
    return this._stats().get(jid) ?? { members: 0, total: 0, total_xp: 0 }
  }

  xpForNext(level) {
    return xpForLevel(level + 1)
  }

  calcLevel(xp) { return calcLevel(xp) }
}

export const groupActivityModel = new GroupActivityModel()
