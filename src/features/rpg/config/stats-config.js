/**
 * RPG 2.0 — Stats config.
 *
 * Single source of truth for base-stat balance values and level/EXP
 * progression tuning. All RPG code must read defaults from here instead
 * of hardcoding numbers elsewhere.
 *
 * Conventions:
 * - `critRate` is a fraction: 0.05 = 5% chance to crit.
 * - `critDmg` is a damage multiplier: 2.0 = 2.0x damage on crit.
 *
 * Future stat pipeline (Card NOT implemented yet):
 *   Base Stats (this config + rpg_players row)
 *     -> Card Bonuses (future card-config / Card system)
 *     -> Final Stats (computed at read time, never stored)
 */

export const RPG_STATS_CONFIG = Object.freeze({
  startingLevel: 1,
  startingExp: 0,
  startingMaxHp: 100,
  startingCurrentHp: 100,
  startingAtk: 10,
  startingDef: 5,
  startingCritRate: 0.05,
  startingCritDmg: 2.0,

  // Minimal level/EXP tuning. Kept intentionally simple; no auto
  // level-up logic lives here. Complex progression comes later.
  progression: Object.freeze({
    baseExp: 100,
    growth: 1.5,
  }),
});

/**
 * EXP required to advance from `level` to `level + 1`.
 * Simple power curve: floor(baseExp * level ^ growth).
 */
export function expRequiredForLevel(level) {
  if (!Number.isInteger(level) || level < 1) {
    throw new RangeError('level must be an integer >= 1');
  }
  const { baseExp, growth } = RPG_STATS_CONFIG.progression;
  return Math.floor(baseExp * Math.pow(level, growth));
}

/**
 * Default persistent state for a brand-new RPG player.
 * Keys use DB (snake_case) column names.
 */
export function defaultRpgStats() {
  return {
    level: RPG_STATS_CONFIG.startingLevel,
    exp: RPG_STATS_CONFIG.startingExp,
    max_hp: RPG_STATS_CONFIG.startingMaxHp,
    current_hp: RPG_STATS_CONFIG.startingCurrentHp,
    atk: RPG_STATS_CONFIG.startingAtk,
    def: RPG_STATS_CONFIG.startingDef,
    crit_rate: RPG_STATS_CONFIG.startingCritRate,
    crit_dmg: RPG_STATS_CONFIG.startingCritDmg,
  };
}
