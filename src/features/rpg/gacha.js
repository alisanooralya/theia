import { sql } from '#storage/connection.js';
import {
  walletModel,
  inventoryModel,
  itemModel,
  cardModel,
} from '#storage/models/index.js';
import { artifactService } from '#features/rpg/artifact.js';
import { cardService } from '#features/rpg/card.js';

const GACHA_COST = 1600;
const ARTIFACT_RATE = 0.08;
const CARD_RATE = 0.04;
const ZONK_RATE = 0.55;

const RARITY_WEIGHTS = {
  common: 50,
  uncommon: 30,
  rare: 15,
  epic: 4,
  legendary: 1,
};

function weightedRandom(items, weights) {
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * totalWeight;
  for (let i = 0; i < items.length; i++) {
    if (r < weights[i]) return items[i];
    r -= weights[i];
  }
  return items[items.length - 1];
}

function buildPool(shopItems) {
  const pool = [];

  for (const item of shopItems) {
    const weight = RARITY_WEIGHTS[item.rarity] ?? RARITY_WEIGHTS.common;
    pool.push({ type: 'item', item, weight });
  }

  return pool;
}

export function singlePull(pool, random = Math.random) {
  const roll = random();

  if (roll < ARTIFACT_RATE) {
    return { type: 'artifact' };
  }

  if (roll < ARTIFACT_RATE + CARD_RATE) {
    return { type: 'card' };
  }

  if (roll < ARTIFACT_RATE + CARD_RATE + ZONK_RATE) {
    return { type: 'zonk' };
  }

  const items = pool.map((e) => e.item);
  const weights = pool.map((e) => e.weight);
  const item = weightedRandom(items, weights);
  return { type: 'item', item };
}

class GachaService {
  constructor() {
    this.COIN_COST = GACHA_COST;
  }

  async pull(jid, count, requestKey = null) {
    const wallet = await walletModel.find(jid);
    const totalCost = GACHA_COST * count;

    if (!wallet || wallet.cash < totalCost) {
      throw new Error(
        `Saldo tidak cukup. Butuh 🪙${totalCost.toLocaleString()}, punya 🪙${(wallet?.cash ?? 0).toLocaleString()}.`
      );
    }

    const shopItems = await itemModel.shopItems();
    const pool = buildPool(shopItems);
    const mainCards = await cardModel.definitions('main');
    const results = [];

    return sql.begin(async (t) => {
      if (requestKey) {
        const claimed = await t`
          INSERT INTO gacha_requests (request_key, jid) VALUES (${requestKey}, ${jid})
          ON CONFLICT (request_key) DO NOTHING RETURNING request_key
        `;
        if (!claimed[0]) {
          const prior = await t`
            SELECT results FROM gacha_requests WHERE request_key = ${requestKey} AND jid = ${jid}
          `;
          if (!prior[0]) throw new Error('Request gacha sudah diproses.');
          return JSON.parse(prior[0].results);
        }
      }

      await t`SELECT jid FROM users WHERE jid = ${jid} FOR UPDATE`;
      await walletModel.spendCash(jid, totalCost, t);

      for (let i = 0; i < count; i++) {
        const result = singlePull(pool);

        if (result.type === 'artifact') {
          try {
            const artifact = await artifactService.generateArtifact(
              jid,
              null,
              t
            );
            results.push({ type: 'artifact', artifact });
          } catch (error) {
            throw new Error(`Gagal memberikan Artifact: ${error.message}`, {
              cause: error,
            });
          }
        } else if (result.type === 'card') {
          const definition = weightedRandom(
            mainCards,
            mainCards.map(() => 1)
          );
          if (!definition) throw new Error('Pool Main Card kosong.');
          const card = await cardService.grant(
            jid,
            definition.id,
            requestKey ? `${requestKey}:${i}` : null,
            t
          );
          results.push({ type: 'card', card });
        } else if (result.type === 'item') {
          await inventoryModel.add(jid, result.item.id, 1, t);
          results.push({ type: 'item', item: result.item });
        } else {
          results.push({ type: 'zonk' });
        }
      }
      if (requestKey) {
        await t`
          UPDATE gacha_requests SET results = ${JSON.stringify(results)} WHERE request_key = ${requestKey}
        `;
      }
      return results;
    });
  }
}

export const gachaService = new GachaService();
