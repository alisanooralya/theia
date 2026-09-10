import { rpgPlayerModel } from '../models/rpg-player.model.js';

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
    async getBaseStats(userId) {
      const row = await model.ensure(userId);
      return toBaseStats(row);
    },
  };
}

export const statService = createStatService();
