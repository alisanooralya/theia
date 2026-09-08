/**
 * RPG 2.0 — Card service (business logic; no SQL here).
 *
 * Owns Main + Sign Card rules: ownership, atomic leveling (coin +
 * Cerelia spent in one transaction), equipment slots, milestone-gated
 * skills, sign compatibility, and the Card stat-bonus layer:
 *   Base Stats -> Main Card bonuses -> Sign Card bonuses -> Final Stats.
 *
 * Notes:
 * - Database work stays in the model files; config in card-config.js.
 * - Leveling charges coin + Cerelia from the RPG wallet/inventory inside
 *   a transaction: any failure rolls everything back.
 * - No combat integration. No support cards. No legacy `src/legacy`
 *   dependencies.
 */
import { sql } from '#storage/connection.js';
import { rpgPlayerModel } from '../models/rpg-player.model.js';
import { rpgCardModel } from '../models/rpg-card.model.js';
import { rpgCoinModel } from '../models/rpg-coin.model.js';
import { rpgInventoryModel } from '../models/rpg-inventory.model.js';
import {
  CARD_LEVELING,
  CARD_MIN_LEVEL,
  affordableLevels,
  cardKind,
  cardStatsAtLevel,
  getBulkLevelUpCost,
  getCardDefinition,
  getLevelUpCost,
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

export function createCardService({
  playerModel,
  cardModel,
  coinModel,
  inventoryModel,
  db = sql,
} = {}) {
  const players = playerModel ?? rpgPlayerModel;
  const cards = cardModel ?? rpgCardModel;
  const coins = coinModel ?? rpgCoinModel;
  const inventory = inventoryModel ?? rpgInventoryModel;

  async function owned(userId, cardId) {
    const kind = cardKind(cardId);
    if (!kind) throw new RangeError(`unknown card id: ${cardId}`);
    const row = await cards.find(userId, cardId, kind);
    return enrichCard(row, kind);
  }

  async function bulkLevelUp(userId, cardId, targetLevel) {
    const def = requireDefinition(cardId);
    const max = maxLevelFor(def.kind);
    const current = await cards.find(userId, cardId, def.kind);
    if (!current) throw new RangeError(`card not owned: ${cardId}`);
    if (!Number.isInteger(targetLevel)) {
      throw new RangeError('target level must be an integer');
    }
    if (targetLevel > max) {
      throw new RangeError(`target level exceeds max level (${max})`);
    }
    if (targetLevel < current.level) {
      throw new RangeError('target level must be above current level');
    }
    if (targetLevel === current.level) {
      // Idempotent no-op (safe retries / lost races): nothing to charge.
      return {
        card: enrichCard(current, def.kind),
        fromLevel: current.level,
        toLevel: current.level,
        levels: 0,
        cost: { coin: 0, cerelia: 0, materialId: CARD_LEVELING.materialId },
        noop: true,
      };
    }
    // Authoritative cost is computed inside the transaction on freshly
    // locked state, so concurrent callers serialize instead of double
    // charging: a loser whose target is already reached becomes a no-op.
    const result = await db.begin(async (tx) => {
      const fresh = await cards.find(userId, cardId, def.kind, tx, true);
      if (!fresh) throw new RangeError(`card not owned: ${cardId}`);
      if (fresh.level >= targetLevel) return { row: fresh, noop: true };
      const cost = getBulkLevelUpCost(def.kind, fresh.level, targetLevel);
      await coins.spendCoin(userId, cost.coin, tx);
      await inventory.remove(userId, cost.materialId, cost.cerelia, tx);
      const row = await cards.setLevel(
        userId,
        cardId,
        def.kind,
        cost.toLevel,
        tx
      );
      return { row, fromLevel: fresh.level, cost, noop: false };
    });
    if (result.noop) {
      return {
        card: enrichCard(result.row, def.kind),
        fromLevel: result.row.level,
        toLevel: result.row.level,
        levels: 0,
        cost: { coin: 0, cerelia: 0, materialId: CARD_LEVELING.materialId },
        noop: true,
      };
    }
    const { cost } = result;
    return {
      card: enrichCard(result.row, def.kind),
      fromLevel: result.fromLevel,
      toLevel: cost.toLevel,
      levels: cost.levels,
      cost: {
        coin: cost.coin,
        cerelia: cost.cerelia,
        materialId: cost.materialId,
      },
      noop: false,
    };
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

    /**
     * Auto-level the equipped card of a slot ('main' | 'sign') as far as
     * current Coin + Cerelia reach (existing affordableLevels curve).
     * No level argument by design. Throws when nothing is equipped or
     * the card is maxed; returns { leveled: false } when resources
     * cover zero levels — never partial-charges. The actual level-up
     * revalidates inside its own transaction, so concurrent callers
     * serialize on fresh state.
     */
    async autoLevelUp(userId, kind) {
      if (kind !== 'main' && kind !== 'sign') {
        throw new RangeError(`unknown equip slot: ${kind}`);
      }
      const equipped = await cards.equipped(userId, kind);
      if (!equipped)
        throw new RangeError(
          `no equipped ${kind === 'main' ? 'main card' : 'sign card'}`
        );
      const max = maxLevelFor(kind);
      if (equipped.level >= max) {
        const def = requireDefinition(equipped.card_id);
        return {
          leveled: false,
          maxed: true,
          card: enrichCard(equipped, kind),
          name: def.name,
          level: equipped.level,
          max,
        };
      }
      const costProbe = getLevelUpCost(kind, equipped.level);
      const [coin, cerelia] = await Promise.all([
        coins.getBalance(userId),
        inventory.getQuantity(userId, costProbe.materialId),
      ]);
      const affordable = affordableLevels(equipped.level, coin, cerelia, max);
      if (affordable.levels <= 0) {
        const def = requireDefinition(equipped.card_id);
        return {
          leveled: false,
          maxed: false,
          card: enrichCard(equipped, kind),
          name: def.name,
          level: equipped.level,
          max,
        };
      }
      const done = await bulkLevelUp(userId, equipped.card_id, affordable.toLevel).catch(
        async (err) => {
          // Stale target after a concurrent level-up advanced past it:
          // re-read and report current state instead of failing.
          if (err instanceof RangeError && /above current level/.test(err.message)) {
            const current = await cards.equipped(userId, kind);
            return {
              card: enrichCard(current, kind),
              fromLevel: current.level,
              toLevel: current.level,
              levels: 0,
              cost: { coin: 0, cerelia: 0, materialId: CARD_LEVELING.materialId },
              noop: true,
            };
          }
          throw err;
        }
      );
      if (done.levels === 0) {
        // Lost a race: someone else finished first. Re-read for accuracy.
        const current = await cards.equipped(userId, kind);
        const def = requireDefinition(current.card_id);
        return {
          leveled: false,
          maxed: current.level >= max,
          card: enrichCard(current, kind),
          name: def.name,
          level: current.level,
          max,
        };
      }
      return {
        ...done,
        leveled: true,
        maxed: false,
        name: done.card.definition.name,
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
     * as-is with isNew: false (never duplicated). Accepts an optional
     * transaction client so callers (gacha, rewards) stay atomic.
     */
    async grantCard(userId, cardId, client) {
      const def = requireDefinition(cardId);
      await players.ensure(userId, client);
      const { row, isNew } = await cards.grant(
        userId,
        cardId,
        def.kind,
        client
      );
      return { card: enrichCard(row, def.kind), isNew };
    },

    /**
     * Single-step cost for a kind at a level. Thin wrapper over config.
     */
    getLevelUpCost(kind, currentLevel) {
      return getLevelUpCost(kind, currentLevel);
    },

    /**
     * Bulk cost from current to target by summing every step.
     * Thin wrapper over config.
     */
    getBulkLevelUpCost(kind, currentLevel, targetLevel) {
      return getBulkLevelUpCost(kind, currentLevel, targetLevel);
    },

    /**
     * Dry-run check: can this card reach `targetLevel` (default +1)?
     * Returns { can, reason, cost, fromLevel, toLevel }. Never mutates.
     */
    async canLevelUp(userId, cardId, targetLevel = null) {
      const def = requireDefinition(cardId);
      const max = maxLevelFor(def.kind);
      const current = await cards.find(userId, cardId, def.kind);
      if (!current)
        return {
          can: false,
          reason: 'not-owned',
          cost: null,
          fromLevel: null,
          toLevel: null,
        };
      const toLevel = targetLevel ?? current.level + 1;
      if (!Number.isInteger(toLevel) || toLevel <= current.level) {
        return {
          can: false,
          reason: 'invalid-target',
          cost: null,
          fromLevel: current.level,
          toLevel,
        };
      }
      if (toLevel > max) {
        return {
          can: false,
          reason: 'exceeds-max',
          cost: null,
          fromLevel: current.level,
          toLevel,
        };
      }
      const cost = getBulkLevelUpCost(def.kind, current.level, toLevel);
      const [coin, cerelia] = await Promise.all([
        coins.getBalance(userId),
        inventory.getQuantity(userId, cost.materialId),
      ]);
      if (coin < cost.coin) {
        return {
          can: false,
          reason: 'insufficient-coin',
          cost,
          fromLevel: current.level,
          toLevel,
        };
      }
      if (cerelia < cost.cerelia) {
        return {
          can: false,
          reason: 'insufficient-cerelia',
          cost,
          fromLevel: current.level,
          toLevel,
        };
      }
      return {
        can: true,
        reason: null,
        cost,
        fromLevel: current.level,
        toLevel,
      };
    },

    /**
     * Level a card up by `levels` steps (default 1). The target must not
     * exceed the kind max — overshooting is rejected, never silently
     * capped. Coin + Cerelia are spent and the level persisted inside
     * one transaction: any failure rolls everything back.
     */
    async levelUp(userId, cardId, levels = 1) {
      const def = requireDefinition(cardId);
      const current = await cards.find(userId, cardId, def.kind);
      if (!current) throw new RangeError(`card not owned: ${cardId}`);
      if (!Number.isInteger(levels) || levels < 1) {
        throw new RangeError('levels must be a positive integer');
      }
      return bulkLevelUp(userId, cardId, current.level + levels);
    },

    /**
     * Level a card to an exact `targetLevel`. Same atomic guarantees as
     * levelUp: validate -> spend coin -> remove Cerelia -> set level ->
     * commit, with full rollback on any failure.
     */
    bulkLevelUp,

    /**
     * Equip a Main Card, replacing the current one. Returns the enriched
     * equipped card.
     */
    async equipMainCard(userId, cardId) {
      const def = requireDefinition(cardId);
      if (def.kind !== 'main')
        throw new RangeError(`not a main card: ${cardId}`);
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
      if (def.kind !== 'sign')
        throw new RangeError(`not a sign card: ${cardId}`);
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
      enriched.signCompatible = main
        ? isSignCompatible(def, main.card_id)
        : false;
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
