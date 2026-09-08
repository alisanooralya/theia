/**
 * RPG 2.0 — Gacha service (validation, rolls, rewards, atomicity).
 *
 * Flow per request: validate count -> claim idempotency key -> lock
 * player row -> spend coin -> roll N independent pulls -> grant via
 * existing Card/Inventory services -> store results -> commit.
 * Any failure rolls everything back; retries return stored results.
 *
 * Pools are never listed here: mains come from Card Config, items from
 * Shop Config. Owned mains (including ones granted earlier in the same
 * request) resolve to zonk — never rerolled, never duplicated.
 */
import { randomUUID } from 'node:crypto';
import { sql } from '#storage/connection.js';
import {
  GACHA_CONFIG,
  gachaCost,
  rollPull,
  rollMainCard,
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

    /**
     * Run `count` pulls (must be a configured cost key: 1 or 10).
     * Returns { requestKey, count, total, results, duplicate }.
     */
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
        const results = [];
        for (let i = 0; i < count; i += 1) {
          const outcome = rollPull(random);
          if (outcome === 'main') {
            const cardId = rollMainCard(random);
            if (owned.has(cardId)) {
              results.push({ index: i + 1, type: 'zonk' });
              continue;
            }
            const granted = await cardSvc.grantCard(userId, cardId, tx);
            owned.add(cardId);
            results.push({
              index: i + 1,
              type: 'main',
              cardId,
              cardName: granted.card.definition.name,
            });
          } else if (outcome === 'shopItem') {
            const itemId = rollShopItem(random);
            const quantity = rollItemQuantity(random);
            await invSvc.addItem(userId, itemId, quantity, tx);
            const def = getShopItem(itemId);
            results.push({
              index: i + 1,
              type: 'shopItem',
              itemId,
              itemName: def ? def.name : itemId,
              quantity,
            });
          } else {
            results.push({ index: i + 1, type: 'zonk' });
          }
        }

        await requests.saveResults(key, results, tx);
        return { requestKey: key, count, total, results, duplicate: false };
      });
    },

    /** Main pool ids (live Card Config). */
    mainPool() {
      return Object.keys(MAIN_CARDS);
    },
  };
}

export const gachaService = createGachaService();
