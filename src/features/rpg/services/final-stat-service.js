import { statService as defaultStatService } from './stat-service.js';
import { cardService as defaultCardService } from './card-service.js';

const ZERO_BONUS = Object.freeze({ hp: 0, atk: 0, def: 0 });

export function createFinalStatService({ statService, cardService } = {}) {
  const stats = statService ?? defaultStatService;
  const cards = cardService ?? defaultCardService;

  return {
    async getFinalStats(userId) {
      const [base, bonuses] = await Promise.all([
        stats.getBaseStats(userId),
        cards.getCardBonuses(userId),
      ]);
      if (!base) throw new RangeError(`no base stats for user: ${userId}`);
      const main = bonuses.main ?? ZERO_BONUS;
      const sign = bonuses.sign ?? ZERO_BONUS;
      return {
        level: base.level,
        exp: base.exp,
        maxHp: base.maxHp + main.hp,
        currentHp: base.currentHp,
        atk: base.atk + main.atk + sign.atk,
        def: base.def + main.def + sign.def,
        critRate: base.critRate,
        critDmg: base.critDmg,
      };
    },
  };
}

export const finalStatService = createFinalStatService();
