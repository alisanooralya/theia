/**
 * RPG 2.0 — Final Stat service (official source for Final Stats).
 *
 * Formula:
 *   Base Stats + Main Card Stats + Sign Card Stats = Final Stats
 *
 * Pipeline:
 *   StatService  -> Base Stats (rpg_players row)
 *   CardService  -> equipped Main Card (HP/ATK/DEF at its level)
 *                -> equipped Sign Card (ATK/DEF at its level)
 *   This service adds the three layers. Nothing else in the codebase
 *   may reimplement this summation — Profile, Combat, Battle, and other
 *   future systems must call getFinalStats().
 *
 * Rules:
 * - Computed on demand, never persisted to the database.
 * - Base Stats and card configs are only read, never mutated.
 * - `currentHp` is persistent state from `rpg_players` and is never
 *   derived from Max HP: card bonuses raise Max HP only.
 * - Only equipped cards grant bonuses (service constraint: max 1 main,
 *   max 1 sign). Skill/passive combat effects are NOT folded into these
 *   numbers; combat consumes them separately via getActiveEffects().
 * - No card-id branching; all values come from existing data/config.
 */
import { statService as defaultStatService } from './stat-service.js';
import { cardService as defaultCardService } from './card-service.js';

const ZERO_BONUS = Object.freeze({ hp: 0, atk: 0, def: 0 });

export function createFinalStatService({ statService, cardService } = {}) {
  const stats = statService ?? defaultStatService;
  const cards = cardService ?? defaultCardService;

  return {
    /**
     * Final stats for a user:
     * { level, exp, maxHp, currentHp, atk, def, critRate, critDmg }.
     * critRate stays fractional (0.05 = 5%), critDmg stays a
     * multiplier (2.0 = 2.0x), matching the base-stat conventions.
     */
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
