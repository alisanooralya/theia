import { sql } from '#storage/connection.js';
import {
  walletModel,
  inventoryModel,
  itemModel,
} from '#storage/models/index.js';
import { artifactService } from '#features/rpg/artifact.js';

const GACHA_COST = 1600;
const ARTIFACT_RATE = 0.08;
const ZONK_RATE = 0.5;

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

function singlePull(pool) {
  const roll = Math.random();

  if (roll < ARTIFACT_RATE) {
    return { type: 'artifact' };
  }

  if (roll < ARTIFACT_RATE + ZONK_RATE) {
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

  async pull(jid, count) {
    const wallet = await walletModel.find(jid);
    const totalCost = GACHA_COST * count;

    if (!wallet || wallet.cash < totalCost) {
      throw new Error(`Saldo tidak cukup. Butuh 🪙${totalCost.toLocaleString()}, punya 🪙${(wallet?.cash ?? 0).toLocaleString()}.`);
    }

    const shopItems = await itemModel.shopItems();
    const pool = buildPool(shopItems);
    const results = [];

    await sql.begin(async (t) => {
      await walletModel.addCash(jid, -totalCost, t);

      for (let i = 0; i < count; i++) {
        const result = singlePull(pool);

        if (result.type === 'artifact') {
          try {
            const artifact = await artifactService.generateArtifact(jid);
            results.push({ type: 'artifact', artifact });
          } catch {
            results.push({ type: 'zonk' });
          }
        } else if (result.type === 'item') {
          await inventoryModel.add(jid, result.item.id, 1, t);
          results.push({ type: 'item', item: result.item });
        } else {
          results.push({ type: 'zonk' });
        }
      }
    });

    return results;
  }
}

export const gachaService = new GachaService();
