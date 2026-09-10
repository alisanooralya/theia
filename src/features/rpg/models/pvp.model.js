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
    try {
      const rows = await client`
        INSERT INTO rpg_pvp_sessions (id, challenger, target, status, confirm_msg_id, expires_at)
        VALUES (${makeSessionId()}, ${challenger}, ${target}, 'pending', ${confirmMsgId || null}, ${expiresAt})
        RETURNING *
      `;
      return rows[0] ?? null;
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
    if (staleRunningSec > 0) {
      await client`
        UPDATE rpg_pvp_sessions
        SET status = 'cancelled', updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
        WHERE status IN ('accepted','running')
          AND started_at > 0 AND started_at <= ${nowSec - staleRunningSec}
      `;
    }
  }

  async accept(id, nowSec = Math.floor(Date.now() / 1000), client = sql) {
    const rows = await client`
      UPDATE rpg_pvp_sessions
      SET status = 'accepted', updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
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
      WHERE id = ${id} AND status IN ('pending','accepted')
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
      WHERE id = ${id} AND status IN ('accepted','running')
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
