/**
 * RPG 2.0 — Card service (business logic; no SQL here).
 *
 * Owns Main + Sign Card rules: ownership, leveling, equipment slots,
 * milestone-gated skills, sign compatibility, and the Card stat-bonus
 * layer that the future StatService will consume:
 *   Base Stats -> Main Card bonuses -> Sign Card bonuses -> Final Stats.
 *
 * Notes:
 * - Database work stays in rpg-card.model.js; config in card-config.js.
 * - `levelUp` persists the new level and returns its cost. There is no
 *   wallet/inventory system yet, so spending coin/Cerelia is the caller's
 *   job (future Shop); the returned `cost` is what must be charged.
 * - No combat integration. No support cards. No legacy `src/legacy`
 *   dependencies.
 */
import { rpgPlayerModel } from '../models/rpg-player.model.js';
import { rpgCardModel } from '../models/rpg-card.model.js';
import {
  CARD_MIN_LEVEL,
  bulkLevelCost,
  cardKind,
  cardStatsAtLevel,
  getCardDefinition,
  maxLevelFor,
} from '../config/card-config.js';
import {
  isSignCompatible,
  mainSkillState,
  signPassiveState,
} from './skill-engine.js';

function requireDefinition(cardId) {
  const def = getCardDefinition(cardId);
  if (!def) throw new RangeError(`unknown card id: ${cardId}`);
  return def;
}

/** Attach definition + level-scaled stats + skill state to a DB row. */
export function enrichCard(row, kind) {
  if (!row) return null;
  const def = requireDefinition(row.card_id);
  const stats = cardStatsAtLevel(def, row.level);
  const enriched = {
    userId: row.user_id,
    cardId: row.card_id,
    kind,
    level: row.level,
    equipped: row.equipped === 1,
    definition: def,
    stats,
  };
  if (kind === 'main') {
    enriched.skills = mainSkillState(def, row.level);
  } else {
    enriched.passive = def.passive;
  }
  return enriched;
}

export function createCardService({ playerModel, cardModel } = {}) {
  const players = playerModel ?? rpgPlayerModel;
  const cards = cardModel ?? rpgCardModel;

  async function owned(userId, cardId) {
    const kind = cardKind(cardId);
    if (!kind) throw new RangeError(`unknown card id: ${cardId}`);
    const row = await cards.find(userId, cardId, kind);
    return enrichCard(row, kind);
  }

  return {
    /** All owned cards, grouped by slot kind. */
    async getOwnedCards(userId) {
      const [mainRows, signRows] = await Promise.all([
        cards.owned(userId, 'main'),
        cards.owned(userId, 'sign'),
      ]);
      return {
        main: mainRows.map((row) => enrichCard(row, 'main')),
        sign: signRows.map((row) => enrichCard(row, 'sign')),
      };
    },

    /** Enriched owned card or null. Throws for unknown card ids. */
    async getCard(userId, cardId) {
      return owned(userId, cardId);
    },

    /** True when the user owns the card. Throws for unknown card ids. */
    async hasCard(userId, cardId) {
      return (await owned(userId, cardId)) !== null;
    },

    /**
     * Grant a card. Unknown ids throw; already-owned cards are returned
     * as-is with isNew: false (never duplicated).
     */
    async grantCard(userId, cardId) {
      const def = requireDefinition(cardId);
      await players.ensure(userId);
      const { row, isNew } = await cards.grant(userId, cardId, def.kind);
      return { card: enrichCard(row, def.kind), isNew };
    },

    /**
     * Level a card up by `levels` steps (default 1), capped at the kind
     * max (main 100, sign 50). Persists the new level and returns the
     * coin/Cerelia cost for the caller (future Shop) to charge.
     */
    async levelUp(userId, cardId, levels = 1) {
      const def = requireDefinition(cardId);
      const max = maxLevelFor(def.kind);
      const current = await cards.find(userId, cardId, def.kind);
      if (!current) throw new RangeError(`card not owned: ${cardId}`);
      const cost = bulkLevelCost(current.level, levels, max);
      if (cost.levels <= 0) {
        throw new RangeError(`card is already at max level (${max})`);
      }
      const row = await cards.setLevel(userId, cardId, def.kind, cost.toLevel);
      return {
        card: enrichCard(row, def.kind),
        fromLevel: current.level,
        toLevel: cost.toLevel,
        levels: cost.levels,
        cost: { coin: cost.coin, cerelia: cost.cerelia, materialId: cost.materialId },
      };
    },

    /**
     * Equip a Main Card, replacing the current one. Returns the enriched
     * equipped card.
     */
    async equipMainCard(userId, cardId) {
      const def = requireDefinition(cardId);
      if (def.kind !== 'main') throw new RangeError(`not a main card: ${cardId}`);
      const current = await cards.find(userId, cardId, 'main');
      if (!current) throw new RangeError(`card not owned: ${cardId}`);
      const row = await cards.equip(userId, cardId, 'main');
      return enrichCard(row, 'main');
    },

    /**
     * Equip a Sign Card, replacing the current one. Any sign fits any
     * main (incompatible signs keep ATK/DEF, passive stays inactive),
     * but a sign cannot be equipped with no Main Card equipped.
     */
    async equipSignCard(userId, cardId) {
      const def = requireDefinition(cardId);
      if (def.kind !== 'sign') throw new RangeError(`not a sign card: ${cardId}`);
      const current = await cards.find(userId, cardId, 'sign');
      if (!current) throw new RangeError(`card not owned: ${cardId}`);
      const main = await cards.equipped(userId, 'main');
      if (!main) {
        throw new RangeError('a sign card requires an equipped main card');
      }
      const row = await cards.equip(userId, cardId, 'sign');
      const enriched = enrichCard(row, 'sign');
      enriched.signCompatible = isSignCompatible(def, main.card_id);
      return enriched;
    },

    /**
     * Unequip a slot ('main' | 'sign'). Unequipping the main also
     * unequips the sign, since a sign cannot float without a main.
     * Returns the unequipped enriched card(s), or null when empty.
     */
    async unequip(userId, kind) {
      if (kind !== 'main' && kind !== 'sign') {
        throw new RangeError(`unknown equip slot: ${kind}`);
      }
      const row = await cards.unequip(userId, kind);
      if (kind === 'main') {
        await cards.unequip(userId, 'sign');
      }
      return enrichCard(row, kind);
    },

    /** Enriched equipped Main Card, or null. */
    async getEquippedMainCard(userId) {
      return enrichCard(await cards.equipped(userId, 'main'), 'main');
    },

    /** Enriched equipped Sign Card (with compatibility flag), or null. */
    async getEquippedSignCard(userId) {
      const row = await cards.equipped(userId, 'sign');
      if (!row) return null;
      const def = requireDefinition(row.card_id);
      const main = await cards.equipped(userId, 'main');
      const enriched = enrichCard(row, 'sign');
      enriched.signCompatible = main ? isSignCompatible(def, main.card_id) : false;
      return enriched;
    },

    /**
     * Card stat-bonus layer for the future Final-stat computation.
     * Sign ATK/DEF always apply; sign passive only when compatible.
     */
    async getCardBonuses(userId) {
      const [mainRow, signRow] = await Promise.all([
        cards.equipped(userId, 'main'),
        cards.equipped(userId, 'sign'),
      ]);
      const main = enrichCard(mainRow, 'main');
      let sign = null;
      if (signRow) {
        const def = requireDefinition(signRow.card_id);
        sign = enrichCard(signRow, 'sign');
        sign.signCompatible = main ? isSignCompatible(def, main.cardId) : false;
      }
      return {
        main: main
          ? { cardId: main.cardId, level: main.level, ...main.stats }
          : null,
        sign: sign
          ? {
              cardId: sign.cardId,
              level: sign.level,
              atk: sign.stats.atk,
              def: sign.stats.def,
              compatible: sign.signCompatible,
            }
          : null,
      };
    },

    /**
     * Currently active card effects: unlocked main skills (base or
     * upgraded set per milestone) plus the sign passive when compatible.
     */
    async getActiveEffects(userId) {
      const effects = [];
      const mainRow = await cards.equipped(userId, 'main');
      if (mainRow) {
        const def = requireDefinition(mainRow.card_id);
        const skills = mainSkillState(def, mainRow.level);
        if (skills.active.unlocked) {
          effects.push({
            source: 'main-active',
            cardId: mainRow.card_id,
            name: def.active.name,
            upgraded: skills.active.upgraded,
            cooldownMs: skills.active.cooldownMs,
            effects: skills.active.effects,
          });
        }
        if (skills.passive.unlocked) {
          effects.push({
            source: 'main-passive',
            cardId: mainRow.card_id,
            name: def.passive.name,
            upgraded: skills.passive.upgraded,
            cooldownMs: null,
            effects: skills.passive.effects,
          });
        }
        const signRow = await cards.equipped(userId, 'sign');
        if (signRow) {
          const signDef = requireDefinition(signRow.card_id);
          const passive = signPassiveState(signDef, mainRow.card_id);
          if (passive.active) {
            effects.push({
              source: 'sign-passive',
              cardId: signRow.card_id,
              name: signDef.passive.name,
              upgraded: false,
              cooldownMs: null,
              effects: passive.effects,
            });
          }
        }
      }
      return effects;
    },

    /** Minimum card level (1). Exposed so callers avoid magic numbers. */
    minLevel: CARD_MIN_LEVEL,
  };
}

export const cardService = createCardService();
