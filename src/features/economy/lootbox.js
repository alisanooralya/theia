import { db } from '#storage/connection.js';
import {
  inventoryModel,
  itemModel,
  walletModel,
  userModel,
} from '#storage/models/index.js';

const RARITY_WEIGHTS = [
  { rarity: 'legendary', weight: 1 },
  { rarity: 'epic', weight: 4 },
  { rarity: 'rare', weight: 10 },
  { rarity: 'uncommon', weight: 25 },
  { rarity: 'common', weight: 60 },
];
const TOTAL_WEIGHT = RARITY_WEIGHTS.reduce((s, r) => s + r.weight, 0);

const COIN_REWARD = {
  common: 500,
  uncommon: 1_200,
  rare: 3_000,
  epic: 6_000,
  legendary: 15_000,
};
const EXP_REWARD = {
  common: 20,
  uncommon: 50,
  rare: 120,
  epic: 250,
  legendary: 600,
};

class LootboxService {
  open(jid, lootboxId = 'lootbox_std') {
    if (!inventoryModel.hasItem(jid, lootboxId))
      throw new Error('Kamu tidak punya *Lootbox*. Beli dulu di toko!');

    const box = itemModel.findById(lootboxId);
    const mult = JSON.parse(box?.data ?? '{}').mult ?? 1;

    const rarity = this._rollRarity();
    const pool = itemModel
      .findAll()
      .filter((i) => i.rarity === rarity && i.category !== 'special');
    if (!pool.length) return this.open(jid, lootboxId);

    const item = pool[Math.floor(Math.random() * pool.length)];
    const hadBefore = inventoryModel.hasItem(jid, item.id);
    const coin = Math.floor((COIN_REWARD[rarity] ?? 0) * mult);
    const exp = Math.floor((EXP_REWARD[rarity] ?? 0) * mult);

    db.transaction(() => {
      inventoryModel.remove(jid, lootboxId, 1);
      inventoryModel.add(jid, item.id, 1);
      if (coin) walletModel.addCash(jid, coin);
      if (exp) userModel.addExp(jid, exp);
    })();

    return { item, rarity, isNew: !hadBefore, coin, exp, mult };
  }

  _rollRarity() {
    let roll = Math.random() * TOTAL_WEIGHT;
    for (const { rarity, weight } of RARITY_WEIGHTS) {
      roll -= weight;
      if (roll <= 0) return rarity;
    }
    return 'common';
  }
}

export const lootboxService = new LootboxService();
