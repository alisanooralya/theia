/**
 * RPG 2.0 — Stat service.
 *
 * Exposes BASE RPG stats only.
 *
 * Future architecture (Card NOT implemented yet):
 *   Base Stats (here)
 *     -> Card Bonuses (future Card system)
 *     -> Final Stats (computed at read time, never stored)
 *
 * There is intentionally no Final-stat calculation and no derived-stat
 * storage. Legacy systems from `src/legacy` are reference-only and are
 * not used here.
 */
import { rpgPlayerModel } from '../models/rpg-player.model.js';

/** Map a raw `rpg_players` row (snake_case) to base stats (camelCase). */
export function toBaseStats(row) {
  if (!row) return null;
  return {
    userId: row.user_id,
    level: row.level,
    exp: row.exp,
    maxHp: row.max_hp,
    currentHp: row.current_hp,
    atk: row.atk,
    def: row.def,
    critRate: row.crit_rate,
    critDmg: row.crit_dmg,
  };
}

export function createStatService({ playerModel } = {}) {
  const model = playerModel ?? rpgPlayerModel;
  return {
    /** Base stats for a user; creates the player with defaults on first call. */
    async getBaseStats(userId) {
      const row = await model.ensure(userId);
      return toBaseStats(row);
    },
  };
}

export const statService = createStatService();
