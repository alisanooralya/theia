/**
 * RPG 2.0 — PvP repository.
 *
 * Sole data-access layer for `rpg_pvp_sessions` and the PvP streak
 * columns on `rpg_players`. Concurrency is enforced at the row level:
 *
 * - The partial unique indexes make a "one live challenge per side"
 *   rule impossible to violate even with concurrent writers.
 * - `accept` and `start` are compare-and-swap status transitions, so a
 *   pending challenge can be accepted once and an accepted battle can be
 *   started once; retries and late responses get zero rows.
 * - `recordOutcome` writes results + rewards under a user row lock, so
 *   two concurrent finishes for the same player serialize instead of a
 *   lost update.
 */
import { randomUUID } from 'node:crypto';
import { sql } from '#storage/connection.js';

export function makeSessionId() {
  return `pvp_${randomUUID()}`;
}

class PvpModel {
  /**
   * Insert a pending challenge. Returns null when either player already
   * has a live session (unique-index violation) — the caller turns that
   * into a friendly error.
   */
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

  /**
   * Sweep stale rows: expired pending -> 'expired'; accepted/running
   * older than the battle TTL -> 'cancelled' (crash recovery — no
   * rewards were persisted, so nothing is lost).
   */
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

  /**
   * Accept a pending challenge (CAS). Only a still-pending, unexpired
   * session flips to 'accepted'; a second accept or a late reply
   * returns null.
   */
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

  /** CAS pending/accepted -> running. Returns the row or null. */
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

  /**
   * Record the outcome. Rewards are applied inside the caller's
   * transaction; streaks/wins/losses are plain conditional updates that
   * serialize on the player row.
   */
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
