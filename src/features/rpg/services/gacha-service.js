import { randomUUID } from 'node:crypto';
import { sql } from '#storage/connection.js';
import {
  GACHA_CONFIG,
  GACHA_DUPLICATE_COMPENSATION,
  GACHA_PITY,
  gachaCost,
  rollPull,
  rollMainCard,
  rollCardFrom,
  rollShopItem,
  rollItemQuantity,
} from '../config/gacha-config.js';
import { MAIN_CARDS } from '../config/card-config.js';
import { getShopItem } from '../config/shop-config.js';
import { rpgPlayerModel } from '../models/rpg-player.model.js';
import { rpgCoinModel } from '../models/rpg-coin.model.js';
import { rpgCardModel } from '../models/rpg-card.model.js';
import { rpgGachaModel } from '../models/rpg-gacha.model.js';
import { createCardService } from './card-service.js';
import { createInventoryService } from './inventory-service.js';

export function makeRequestKey(userId) {
  return `gacha:${userId}:${Date.now()}:${randomUUID()}`;
}

export function createGachaService({
  playerModel,
  coinModel,
  cardModel,
  gachaModel,
  cardService,
  inventoryService,
  db = sql,
} = {}) {
  const players = playerModel ?? rpgPlayerModel;
  const coins = coinModel ?? rpgCoinModel;
  const cards = cardModel ?? rpgCardModel;
  const requests = gachaModel ?? rpgGachaModel;
  const cardSvc = cardService ?? createCardService();
  const invSvc = inventoryService ?? createInventoryService();

  async function ownedMainIds(userId, client) {
    const rows = await cards.owned(userId, 'main', client);
    return new Set(rows.map((r) => r.card_id));
  }

  return {
    config: GACHA_CONFIG,

    async pull(
      userId,
      count,
      { requestKey = null, random = Math.random } = {}
    ) {
      const total = gachaCost(count);
      const key = requestKey ?? makeRequestKey(userId);
      await players.ensure(userId);
      await coins.ensure(userId);

      return db.begin(async (tx) => {
        const claimed = await requests.claim(key, userId, tx);
        if (!claimed) {
          const prior = await requests.getResults(key, userId, tx);
          if (!prior) throw new RangeError('Request gacha sudah diproses.');
          return {
            requestKey: key,
            count: prior.length,
            total,
            results: prior,
            duplicate: true,
          };
        }

        await tx`SELECT user_id FROM rpg_players WHERE user_id = ${userId} FOR UPDATE`;
        await coins.spendCoin(userId, total, tx);

        const owned = await ownedMainIds(userId, tx);
        const pityState = await requests.lockPity(userId, tx);
        let pityCount = Math.max(0, Number(pityState?.pity_count) || 0);
        let forceNew = Boolean(pityState?.force_new);
        const allMainIds = Object.keys(MAIN_CARDS);
        const results = [];
        for (let i = 0; i < count; i += 1) {
          pityCount += 1;
          let guaranteed = null;
          if (forceNew) {
            guaranteed = 'new';
          } else if (pityCount >= GACHA_PITY.guaranteedPulls) {
            guaranteed = 'pity';
          }

          let cardId = null;
          let isNew = false;
          if (guaranteed === 'new') {
            // Guarantee after a duplicate: must be a card the user lacks.
            forceNew = false;
            const unowned = allMainIds.filter((id) => !owned.has(id));
            if (unowned.length) {
              cardId = rollCardFrom(unowned, random);
              isNew = true;
            }
          } else if (guaranteed === 'pity') {
            // Pity guarantee resolved: 50:50 duplicate vs new, cycle restarts.
            pityCount = 0;
            if (random() < GACHA_PITY.newCardChance) {
              const unowned = allMainIds.filter((id) => !owned.has(id));
              if (unowned.length) {
                cardId = rollCardFrom(unowned, random);
                isNew = true;
              }
            }
          } else {
            const outcome = rollPull(random);
            if (outcome === 'shopItem') {
              const itemId = rollShopItem(random);
              const quantity = rollItemQuantity(random);
              await invSvc.addItem(userId, itemId, quantity, tx);
              const def = getShopItem(itemId);
              results.push({
                index: i + 1,
                type: 'shopItem',
                itemId,
                itemName: def ? def.name : itemId,
                emoji: def?.emoji ?? '📦',
                quantity,
              });
              continue;
            }
            if (outcome !== 'main') {
              results.push({ index: i + 1, type: 'zonk' });
              continue;
            }
            cardId = rollMainCard(random);
            isNew = !owned.has(cardId);
          }

          if (guaranteed && !cardId) {
            // Fallback when the preferred pool is empty (e.g. all cards owned).
            const ownedIds = [...owned];
            if (ownedIds.length) {
              cardId = rollCardFrom(ownedIds, random);
            } else {
              const unowned = allMainIds.filter((id) => !owned.has(id));
              if (unowned.length) {
                cardId = rollCardFrom(unowned, random);
                isNew = true;
              }
            }
          }

          const cardName = MAIN_CARDS[cardId]?.name ?? cardId;
          if (!isNew) {
            // Duplicate: no second copy, grant consolation instead of zonk.
            // Next pull is guaranteed to be a card the user does not own yet.
            if (guaranteed !== 'new') forceNew = true;
            await invSvc.addItem(
              userId,
              GACHA_DUPLICATE_COMPENSATION.itemId,
              GACHA_DUPLICATE_COMPENSATION.quantity,
              tx
            );
            const result = {
              index: i + 1,
              type: 'duplicate',
              cardId,
              cardName,
              compensation: { ...GACHA_DUPLICATE_COMPENSATION },
            };
            results.push(result);
            continue;
          }
          const granted = await cardSvc.grantCard(userId, cardId, tx);
          owned.add(cardId);
          pityCount = 0;
          results.push({
            index: i + 1,
            type: 'main',
            cardId,
            cardName: granted.card.definition.name,
          });
        }

        await requests.savePity(userId, pityCount, forceNew, tx);
        await requests.saveResults(key, results, tx);
        return { requestKey: key, count, total, results, duplicate: false };
      });
    },

    mainPool() {
      return Object.keys(MAIN_CARDS);
    },
  };
}

export const gachaService = createGachaService();
