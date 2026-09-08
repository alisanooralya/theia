/**
 * RPG 2.0 — Player repository.
 *
 * Sole data-access layer for the `rpg_players` table. All SQL for RPG
 * player/base-stat state lives here; callers go through these methods.
 *
 * Notes:
 * - One RPG player per user: `user_id` is the PRIMARY KEY.
 * - `current_hp` is independent persistent state. It is never derived
 *   from `max_hp` here: changing Max HP does not touch Current HP.
 * - No derived/Final stats are stored. No Card logic.
 */
import { sql } from '#storage/connection.js';
import { defaultRpgStats } from '../config/stats-config.js';

const ALLOWED_UPDATE_FIELDS = [
  'level',
  'exp',
  'max_hp',
  'current_hp',
  'atk',
  'def',
  'crit_rate',
  'crit_dmg',
];

class RpgPlayerModel {
  async get(userId, client = sql) {
    const rows = await client`SELECT * FROM rpg_players WHERE user_id = ${userId}`;
    return rows[0] ?? null;
  }

  async ensure(userId, client = sql) {
    const defaults = defaultRpgStats();
    const rows = await client`
      INSERT INTO rpg_players
        (user_id, level, exp, max_hp, current_hp, atk, def, crit_rate, crit_dmg)
      VALUES
        (${userId}, ${defaults.level}, ${defaults.exp}, ${defaults.max_hp}, ${defaults.current_hp}, ${defaults.atk}, ${defaults.def}, ${defaults.crit_rate}, ${defaults.crit_dmg})
      ON CONFLICT (user_id) DO NOTHING
      RETURNING *
    `;
    if (rows[0]) return rows[0];
    return this.get(userId, client);
  }

  async update(userId, fields, client = sql) {
    const entries = Object.entries(fields ?? {}).filter(([key]) =>
      ALLOWED_UPDATE_FIELDS.includes(key)
    );
    if (!entries.length) return this.get(userId, client);
    const setClauses = entries.map((_, i) => `${entries[i][0]} = $${i + 1}`);
    const params = entries.map(([, value]) => value);
    setClauses.push('updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT');
    params.push(userId);
    const rows = await client.unsafe(
      `UPDATE rpg_players SET ${setClauses.join(', ')} WHERE user_id = $${params.length} RETURNING *`,
      params
    );
    return rows[0] ?? null;
  }

  /**
   * Persistent HP state. Floored at 0, deliberately NOT clamped to
   * max_hp so Current HP stays independent from Max HP.
   */
  async setCurrentHp(userId, hp, client = sql) {
    if (!Number.isInteger(hp)) {
      throw new RangeError('hp must be an integer');
    }
    const rows = await client`
      UPDATE rpg_players
      SET current_hp = GREATEST(0, ${hp}),
          updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
      WHERE user_id = ${userId}
      RETURNING *
    `;
    return rows[0] ?? null;
  }

  async setLevel(userId, level, client = sql) {
    if (!Number.isInteger(level) || level < 1) {
      throw new RangeError('level must be an integer >= 1');
    }
    return this.update(userId, { level }, client);
  }

  async setExp(userId, exp, client = sql) {
    if (!Number.isInteger(exp) || exp < 0) {
      throw new RangeError('exp must be an integer >= 0');
    }
    return this.update(userId, { exp }, client);
  }
}

export const rpgPlayerModel = new RpgPlayerModel();
