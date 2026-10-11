import { randomUUID } from 'node:crypto';
import { sql } from '#storage/connection.js';

export function makeRunId() {
  return `imp_${randomUUID()}`;
}

function parseJson(value, fallback) {
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

class ImperiumModel {
  async startRun(
    id,
    userId,
    weekIndex,
    difficulty,
    payload,
    expiresAt = 0,
    client = sql
  ) {
    const rows = await client`
      INSERT INTO rpg_imperium_runs
        (id, user_id, week_index, difficulty, chamber, status, payload, expires_at)
      VALUES
        (${id}, ${userId}, ${weekIndex}, ${difficulty}, 1, 'active', ${JSON.stringify(payload)}, ${expiresAt})
      RETURNING *
    `;
    return rows[0] ?? null;
  }

  async findRun(id, client = sql) {
    const rows = await client`
      SELECT * FROM rpg_imperium_runs WHERE id = ${id}
    `;
    const row = rows[0] ?? null;
    if (!row) return null;
    return { ...row, payload: parseJson(row.payload, {}) };
  }

  async advanceChamber(id, fromChamber, toChamber, payload, client = sql) {
    const rows = await client`
      UPDATE rpg_imperium_runs
      SET chamber = ${toChamber}, payload = ${JSON.stringify(payload)},
          updated_at = (EXTRACT(epoch FROM NOW()))::BIGINT
      WHERE id = ${id} AND status = 'active' AND chamber = ${fromChamber}
      RETURNING *
    `;
    const row = rows[0] ?? null;
    if (!row) return null;
    return { ...row, payload: parseJson(row.payload, {}) };
  }

  async finishRun(id, status, payload, client = sql) {
    const rows = await client`
      UPDATE rpg_imperium_runs
      SET status = ${status}, payload = ${JSON.stringify(payload ?? {})},
          updated_at = (EXTRACT(epoch FROM NOW()))::BIGINT
      WHERE id = ${id} AND status = 'active'
      RETURNING *
    `;
    const row = rows[0] ?? null;
    if (!row) return null;
    return { ...row, payload: parseJson(row.payload, {}) };
  }

  async abandonActive(userId, difficulty, client = sql) {
    const rows = await client`
      UPDATE rpg_imperium_runs
      SET status = 'abandoned', updated_at = (EXTRACT(epoch FROM NOW()))::BIGINT
      WHERE user_id = ${userId} AND difficulty = ${difficulty} AND status = 'active'
      RETURNING id
    `;
    return rows.map((r) => r.id);
  }

  async expireStaleRuns(nowSec, client = sql) {
    const rows = await client`
      UPDATE rpg_imperium_runs
      SET status = 'abandoned', updated_at = (EXTRACT(epoch FROM NOW()))::BIGINT
      WHERE status = 'active' AND expires_at > 0 AND expires_at <= ${nowSec}
      RETURNING id
    `;
    return rows.length;
  }

  async clearedDifficulties(userId, weekIndex, client = sql) {
    const rows = await client`
      SELECT difficulty FROM rpg_imperium_progress
      WHERE user_id = ${userId} AND week_index = ${weekIndex}
      ORDER BY difficulty
    `;
    return rows.map((r) => Number(r.difficulty));
  }

  async clearedCount(userId, weekIndex, client = sql) {
    const rows = await client`
      SELECT COUNT(*)::INTEGER AS total FROM rpg_imperium_progress
      WHERE user_id = ${userId} AND week_index = ${weekIndex}
    `;
    return Number(rows[0]?.total ?? 0);
  }

  async findClear(userId, weekIndex, difficulty, client = sql) {
    const rows = await client`
      SELECT * FROM rpg_imperium_progress
      WHERE user_id = ${userId} AND week_index = ${weekIndex}
        AND difficulty = ${difficulty}
    `;
    return rows[0] ?? null;
  }

  async claimClear(userId, weekIndex, difficulty, rewards, client = sql) {
    const rows = await client`
      INSERT INTO rpg_imperium_progress
        (user_id, week_index, difficulty, clears, rewards, cleared_at)
      VALUES
        (${userId}, ${weekIndex}, ${difficulty}, 1, ${JSON.stringify(rewards ?? {})},
         (EXTRACT(epoch FROM NOW()))::BIGINT)
      ON CONFLICT (user_id, week_index, difficulty) DO NOTHING
      RETURNING *
    `;
    return rows[0] ?? null;
  }

  async purgeOlderWeeks(currentWeekIndex, client = sql) {
    const rows = await client`
      DELETE FROM rpg_imperium_progress
      WHERE week_index < ${currentWeekIndex}
      RETURNING user_id
    `;
    await client`
      DELETE FROM rpg_imperium_runs
      WHERE status <> 'active' AND week_index < ${currentWeekIndex}
      RETURNING id
    `;
    return rows.length;
  }
}

export const imperiumModel = new ImperiumModel();
