import { sql } from '#storage/connection.js';
import {
  cardModel,
  inventoryModel,
  raidModel,
  statsModel,
  walletModel,
} from '#storage/models/index.js';

export const CARD_CORE_ID = 'card_core';
export const CARD_MAX_LEVEL = 100;
export const CARD_PASSIVE_LEVEL = 50;

export const RAID_SHOP = Object.freeze({
  card_core: { name: 'Card Core', price: 2, quantity: 1, type: 'material' },
  raid_emblem: {
    name: 'Raid Emblem',
    price: 30,
    quantity: 1,
    type: 'support',
  },
});

const PASSIVE_DESCRIPTIONS = Object.freeze({
  girgas: 'Melee Drive: damage serangan +20%.',
  lena: 'Star Stacks: setiap serangan memberi +10% ATK/DEF, maksimal 3 stack.',
  ameris: 'Choco Support: Crit Rate +20%; setiap serangan ketiga mendapat +30% ATK.',
  daisy:
    'Last Stand: damage +10% dan damage diterima -10%; saat HP <=30%, damage tambahan +20%.',
  raid_emblem: 'Raid Focus: damage serangan +5%.',
});

export function calculateCardStats(card, level = card.level) {
  if (card.type !== 'main') return { hp: 0, atk: 0, def: 0 };
  const safeLevel = Math.max(5, Math.min(CARD_MAX_LEVEL, Number(level)));
  const ratio = 0.2 + (0.8 * (safeLevel - 5)) / 95;
  const scale = (maximum) =>
    safeLevel === CARD_MAX_LEVEL
      ? Number(maximum)
      : Math.round(Number(maximum) * ratio);
  return {
    hp: scale(card.max_hp),
    atk: scale(card.max_atk),
    def: scale(card.max_def),
  };
}

export function getCardUpgradeCost(level) {
  if (level >= CARD_MAX_LEVEL) return null;
  return {
    coin: 500 + level * 50,
    material: Math.ceil(level / 10),
  };
}

export function passiveDescription(card) {
  return PASSIVE_DESCRIPTIONS[card.card_id] ?? card.passive;
}

export function combatModifiersForCards(main, support) {
  const modifiers = {
    damageMultiplier: support?.card_id === 'raid_emblem' ? 1.05 : 1,
    incomingDamageMultiplier: 1,
    critRateBonus: 0,
  };
  if (!main || main.level < CARD_PASSIVE_LEVEL) return modifiers;
  if (main.card_id === 'girgas') modifiers.damageMultiplier *= 1.2;
  if (main.card_id === 'lena') {
    modifiers.stackPerHit = 0.1;
    modifiers.maxStacks = 3;
  }
  if (main.card_id === 'ameris') {
    modifiers.critRateBonus = 20;
    modifiers.thirdHitAtk = 1.3;
  }
  if (main.card_id === 'daisy') {
    modifiers.damageMultiplier *= 1.1;
    modifiers.incomingDamageMultiplier = 0.9;
    modifiers.lowHpDamageMultiplier = 1.2;
  }
  return modifiers;
}

export function applyOutgoingCardDamage(damage, fighter) {
  const modifiers = fighter.cardModifiers;
  if (!modifiers) return damage;
  let multiplier = modifiers.damageMultiplier ?? 1;
  if (modifiers.lowHpDamageMultiplier && fighter.hp / fighter.max_hp <= 0.3) {
    multiplier *= modifiers.lowHpDamageMultiplier;
  }
  return Math.max(1, Math.floor(damage * multiplier));
}

export function applyIncomingCardDamage(damage, fighter) {
  return Math.max(
    1,
    Math.floor(damage * (fighter.cardModifiers?.incomingDamageMultiplier ?? 1))
  );
}

export function cardTurnStats(fighter) {
  const modifiers = fighter.cardModifiers;
  const hits = fighter.cardHits ?? 0;
  let atk = fighter.atk;
  let def = fighter.def;
  if (modifiers?.stackPerHit) {
    const stacks = Math.min(hits, modifiers.maxStacks);
    atk = Math.floor(atk * (1 + modifiers.stackPerHit * stacks));
    def = Math.floor(def * (1 + modifiers.stackPerHit * stacks));
  }
  if (modifiers?.thirdHitAtk && (hits + 1) % 3 === 0) {
    atk = Math.floor(atk * modifiers.thirdHitAtk);
  }
  return { atk, def };
}

class CardService {
  calculateStats(card, level = card.level) {
    return calculateCardStats(card, level);
  }

  getUpgradeCost(level) {
    return getCardUpgradeCost(level);
  }

  passiveDescription(card) {
    return passiveDescription(card);
  }

  async grant(jid, cardId, rewardKey = null, client = sql) {
    const card = await cardModel.grant(jid, cardId, rewardKey, client);
    if (!card) throw new Error('Card tidak ditemukan.');
    return card;
  }

  async getCards(jid, type = null) {
    return cardModel.owned(jid, type);
  }

  async getCard(jid, id) {
    return cardModel.findOwned(jid, id);
  }

  async getEquipped(jid, slot = null) {
    return cardModel.equipped(jid, slot);
  }

  async upgrade(jid, id) {
    return sql.begin(async (t) => {
      const card = await cardModel.findOwned(jid, id, t, true);
      if (!card) throw new Error('Card tidak ditemukan.');
      if (card.type !== 'main') throw new Error('Support Card tidak dapat di-upgrade.');
      const cost = getCardUpgradeCost(card.level);
      if (!cost) throw new Error('Card sudah mencapai Lv.100.');

      await walletModel.spendCash(jid, cost.coin, t);
      try {
        await inventoryModel.remove(jid, CARD_CORE_ID, cost.material, t);
      } catch (error) {
        if (error.message === `Item tidak cukup: ${CARD_CORE_ID}`) {
          throw new Error(`Card Core tidak cukup. Butuh ${cost.material}.`, {
            cause: error,
          });
        }
        throw error;
      }
      const upgraded = await cardModel.updateLevel(jid, id, card.level + 1, t);
      if (!upgraded) throw new Error('Level Card berubah. Coba lagi.');
      return { card: upgraded, cost };
    });
  }

  async equip(jid, id) {
    const equipped = await sql.begin(async (t) => {
      const card = await cardModel.findOwned(jid, id, t, true);
      if (!card) throw new Error('Card tidak ditemukan.');
      if (card.type === 'support' && card.level !== 1) {
        throw new Error('Support Card harus tetap Lv.1.');
      }
      return cardModel.equip(jid, card.type, card.id, t);
    });
    await this.clampHp(jid);
    return equipped;
  }

  async unequip(jid, slot) {
    if (!['main', 'support'].includes(slot)) throw new Error('Slot Card tidak valid.');
    const current = await cardModel.equipped(jid, slot);
    if (!current) throw new Error(`Tidak ada ${slot} Card yang terpasang.`);
    await sql.begin(async (t) => {
      await cardModel.unequip(jid, slot, t);
    });
    await this.clampHp(jid);
    return current;
  }

  async getStatBonus(jid) {
    const main = await cardModel.equipped(jid, 'main');
    return main ? calculateCardStats(main) : { hp: 0, atk: 0, def: 0 };
  }

  async getCombatModifiers(jid) {
    const [main, support] = await Promise.all([
      cardModel.equipped(jid, 'main'),
      cardModel.equipped(jid, 'support'),
    ]);
    return combatModifiersForCards(main, support);
  }

  async buyRaidShop(jid, productId, quantity = 1) {
    const product = RAID_SHOP[productId];
    if (!product) throw new Error('Item Raid Shop tidak ditemukan.');
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
      throw new Error('Jumlah pembelian harus 1-100.');
    }
    if (product.type === 'support' && quantity !== 1) {
      throw new Error('Support Card hanya dapat dibeli satu per transaksi.');
    }
    return sql.begin(async (t) => {
      const cost = product.price * quantity;
      await raidModel.spendRaidCoin(jid, cost, t);
      let reward;
      if (product.type === 'material') {
        await inventoryModel.add(jid, productId, quantity, t);
        reward = { quantity };
      } else {
        reward = await this.grant(jid, productId, null, t);
      }
      return { product, cost, quantity, reward };
    });
  }

  async clampHp(jid) {
    const [{ artifactService }, base] = await Promise.all([
      import('#features/rpg/artifact.js'),
      statsModel.find(jid),
    ]);
    if (!base) return;
    const finalStats = await artifactService.getPlayerStats(jid);
    if (base.hp > finalStats.hp) await statsModel.setHp(jid, finalStats.hp);
  }
}

export const cardService = new CardService();
