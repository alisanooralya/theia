import { randomUUID } from 'node:crypto';
import { sql } from '#storage/connection.js';

export function makeSessionId() {
  return `pvp_${randomUUID()}`;
}

class PvpModel {
  async create(
    challenger,
    target,
    { confirmMsgId = null, expiresAt = 0 } = {},
    client = sql
  ) {
    // One live battle per player regardless of role. The partial unique
    // indexes only cover same-role duplicates (challenger↔challenger,
    // target↔target), so A→B + C→A would both insert. Serialize creators
    // per participant with advisory locks (stable order: no deadlock) and
    // re-check both columns before inserting.
    const txRunner = client?.begin ? client : sql;
    try {
      return await txRunner.begin(async (tx) => {
        const [first, second] =
          challenger < target
            ? [challenger, target]
            : [target, challenger];
        await tx`SELECT pg_advisory_xact_lock(hashtext(${'pvp:' + first}))`;
        await tx`SELECT pg_advisory_xact_lock(hashtext(${'pvp:' + second}))`;
        const busy = await tx`
          SELECT 1 FROM rpg_pvp_sessions
          WHERE status IN ('pending','accepted','running')
            AND (challenger = ${challenger} OR target = ${challenger}
              OR challenger = ${target} OR target = ${target})
          LIMIT 1
        `;
        if (busy.length) return null;
        const rows = await tx`
          INSERT INTO rpg_pvp_sessions (id, challenger, target, status, confirm_msg_id, expires_at)
          VALUES (${makeSessionId()}, ${challenger}, ${target}, 'pending', ${confirmMsgId || null}, ${expiresAt})
          RETURNING *
        `;
        return rows[0] ?? null;
      });
    } catch (err) {
      if (err?.code === '23505') return null;
      throw err;
    }
  }

  async find(id, client = sql) {
    const rows = await client`SELECT * FROM rpg_pvp_sessions WHERE id = ${id}`;
    return rows[0] ?? null;
  }

  async findByConfirmMsgId(msgId, client = sql) {
    const rows = await client`
      SELECT * FROM rpg_pvp_sessions WHERE confirm_msg_id = ${msgId}
        AND status IN ('pending','accepted')
    `;
    return rows[0] ?? null;
  }

  async expireStale(nowSec, staleRunningSec, client = sql) {
    await client`
      UPDATE rpg_pvp_sessions
      SET status = 'expired', updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
      WHERE status = 'pending' AND expires_at > 0 AND expires_at <= ${nowSec}
    `;
    // Accepted but never started (e.g. crash between accept and run):
    // started_at stays 0 so the running-rule below would never catch it.
    await client`
      UPDATE rpg_pvp_sessions
      SET status = 'expired', updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
      WHERE status = 'accepted' AND started_at = 0
        AND expires_at > 0 AND expires_at <= ${nowSec}
    `;
    if (staleRunningSec > 0) {
      await client`
        UPDATE rpg_pvp_sessions
        SET status = 'cancelled', updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
        WHERE status IN ('accepted','running')
          AND started_at > 0 AND started_at <= ${nowSec - staleRunningSec}
      `;
    }
  }

  async accept(
    id,
    nowSec = Math.floor(Date.now() / 1000),
    client = sql,
    runGraceSec = 180
  ) {
    // Refresh expires_at so the accepted session cannot be reaped between
    // accept and start; accepted-never-started rows still expire via
    // expireStale once the refreshed deadline passes.
    const rows = await client`
      UPDATE rpg_pvp_sessions
      SET status = 'accepted',
          expires_at = ${nowSec + runGraceSec},
          updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
      WHERE id = ${id} AND status = 'pending'
        AND (expires_at = 0 OR expires_at > ${nowSec})
      RETURNING *
    `;
    return rows[0] ?? null;
  }

  async start(id, client = sql) {
    const rows = await client`
      UPDATE rpg_pvp_sessions
      SET status = 'running',
          started_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT,
          updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
      WHERE id = ${id} AND status = 'accepted'
      RETURNING *
    `;
    return rows[0] ?? null;
  }

  async cancel(id, client = sql) {
    await client`
      UPDATE rpg_pvp_sessions
      SET status = 'cancelled', updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
      WHERE id = ${id} AND status IN ('pending','accepted','running')
    `;
  }

  async finish(id, result, client = sql) {
    const rows = await client`
      UPDATE rpg_pvp_sessions
      SET status = 'finished', result = ${JSON.stringify(result)},
          updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
      WHERE id = ${id} AND status = 'running'
      RETURNING *
    `;
    return rows[0] ?? null;
  }

  async recordWin(userId, client = sql) {
    await client`
      UPDATE rpg_players
      SET pvp_wins = pvp_wins + 1, pvp_win_streak = pvp_win_streak + 1,
          updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
      WHERE user_id = ${userId}
    `;
  }

  async recordLoss(userId, client = sql) {
    await client`
      UPDATE rpg_players
      SET pvp_losses = pvp_losses + 1, pvp_win_streak = 0,
          updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
      WHERE user_id = ${userId}
    `;
  }

  async getStreak(userId, client = sql) {
    const rows = await client`
      SELECT pvp_win_streak FROM rpg_players WHERE user_id = ${userId}
    `;
    return Number(rows[0]?.pvp_win_streak ?? 0);
  }
}

export const pvpModel = new PvpModel();
