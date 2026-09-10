export const RPG_STATS_CONFIG = Object.freeze({
  startingLevel: 1,
  startingExp: 0,
  startingMaxHp: 173,
  startingCurrentHp: 173,
  startingAtk: 23,
  startingDef: 9,
  startingCritRate: 0.25,
  startingCritDmg: 1.3,

  progression: Object.freeze({
    baseExp: 100,
    growth: 1.5,
  }),
});

export function expRequiredForLevel(level) {
  if (!Number.isInteger(level) || level < 1) {
    throw new RangeError('level must be an integer >= 1');
  }
  const { baseExp, growth } = RPG_STATS_CONFIG.progression;
  return Math.floor(baseExp * Math.pow(level, growth));
}

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
