import { sql } from '#storage/connection.js';

// imperium_progress: 1 row per (user, week). cleared = bitmask diff
// (bit diff-1). Reward claim state == cleared bit (reward diberikan atomik
// saat clear). Restart-safe: week dihitung dari timestamp, bukan timer.
// imperium_pending: pilihan Blessing/Curse yang menunggu pick (1 row per
// user). Dihapus (consume) atomik di dalam transaksi battle.

class ImperiumModel {
  async getProgress(userId, weekId, client = sql) {
    const rows = await client`
      SELECT * FROM imperium_progress
      WHERE user_id = ${userId} AND week_id = ${weekId}
    `;
    return rows[0] ?? null;
  }

  async ensureProgress(userId, weekId, client = sql) {
    const rows = await client`
      INSERT INTO imperium_progress (user_id, week_id)
      VALUES (${userId}, ${weekId})
      ON CONFLICT (user_id, week_id) DO NOTHING
      RETURNING *
    `;
    if (rows[0]) return rows[0];
    return this.getProgress(userId, weekId, client);
  }

  async lockProgress(userId, weekId, client) {
    const rows = await client`
      SELECT * FROM imperium_progress
      WHERE user_id = ${userId} AND week_id = ${weekId}
      FOR UPDATE
    `;
    return rows[0] ?? null;
  }

  async markCleared(userId, weekId, bit, client = sql) {
    const rows = await client`
      UPDATE imperium_progress
      SET cleared = cleared | ${bit},
          updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
      WHERE user_id = ${userId} AND week_id = ${weekId}
        AND (cleared & ${bit}) = 0
      RETURNING *
    `;
    return rows[0] ?? null;
  }

  async savePending(userId, weekId, diff, choices, client = sql) {
    const payload = JSON.stringify(choices);
    const rows = await client`
      INSERT INTO imperium_pending (user_id, week_id, diff, choices)
      VALUES (${userId}, ${weekId}, ${diff}, ${payload})
      ON CONFLICT (user_id) DO UPDATE SET
        week_id = EXCLUDED.week_id,
        diff = EXCLUDED.diff,
        choices = EXCLUDED.choices,
        updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
      RETURNING *
    `;
    return rows[0] ?? null;
  }

  async getPending(userId, client = sql) {
    const rows = await client`
      SELECT * FROM imperium_pending WHERE user_id = ${userId}
    `;
    return rows[0] ?? null;
  }

  async consumePending(userId, client) {
    const rows = await client`
      DELETE FROM imperium_pending WHERE user_id = ${userId}
      RETURNING *
    `;
    return rows[0] ?? null;
  }
}

export const imperiumModel = new ImperiumModel();
