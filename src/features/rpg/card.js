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
  treasure_hunter: {
    name: 'Treasure Hunter',
    price: 40,
    quantity: 1,
    type: 'support',
  },
  iron_will: {
    name: 'Iron Will',
    price: 40,
    quantity: 1,
    type: 'support',
  },
  critical_eye: {
    name: 'Critical Eye',
    price: 50,
    quantity: 1,
    type: 'support',
  },
});

/**
 * Efek pasif tiap Support Card (fraksi, kecuali critRate dalam persen).
 * Satu-satunya sumber kebenaran angka pasif support — dipakai oleh
 * combatModifiersForCards, CardBattleState, dan coin bonus.
 */
export const SUPPORT_EFFECTS = Object.freeze({
  raid_emblem: { damageDealt: 0.05 },
  treasure_hunter: { coinBonus: 0.08 },
  iron_will: { damageTaken: -0.05 },
  critical_eye: { critRate: 5 },
});

export function supportEffects(supportCard) {
  if (!supportCard) return {};
  return SUPPORT_EFFECTS[supportCard.card_id] ?? {};
}

export const PASSIVE_DESCRIPTIONS = Object.freeze({
  girgas:
    'Lollipop: Setiap serangan berhasil memberi 1 Lollipop (+10% Damage per stack, maks 2 stack, durasi 8s, cooldown 2s).',
  lena: 'Star Fragment: Saat terkena serangan musuh mendapat 1 Star Fragment (+10% ATK & DEF per stack, maks 3 stack, durasi 5s, cooldown 4s).',
  ameris:
    'Critical Support: Setiap 3 serangan berhasil, mengaktifkan Crit Rate +10% dan CDM 2.5x selama 4s (cooldown 6s).',
  daisy:
    'Last Stand: Damage dealt +10%~+40% dan Damage taken -10%~-20% dinamis sesuai sisa HP.',
  raid_emblem: 'Raid Focus: damage serangan +5%.',
  treasure_hunter: 'Treasure Hunter: reward Coin dari aktivitas RPG +8%.',
  iron_will: 'Iron Will: damage yang diterima -5%.',
  critical_eye: 'Critical Eye: Crit Rate +5%.',
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

/**
 * Pengali reward Coin aktivitas RPG dari Support Card yang equipped.
 * Murni dari data SUPPORT_EFFECTS — tidak menyentuh base amount.
 */
export function supportCoinMultiplier(supportCard) {
  const fx = supportEffects(supportCard);
  return 1 + (fx.coinBonus ?? 0);
}

export function combatModifiersForCards(main, support) {
  const fx = supportEffects(support);
  const modifiers = {
    damageMultiplier: 1 + (fx.damageDealt ?? 0),
    incomingDamageMultiplier: 1 + (fx.damageTaken ?? 0),
    critRateBonus: fx.critRate ?? 0,
  };
  if (!main || main.level < CARD_PASSIVE_LEVEL) return modifiers;
  if (main.card_id === 'girgas') modifiers.damageMultiplier *= 1.2;
  if (main.card_id === 'lena') {
    modifiers.stackPerHit = 0.1;
    modifiers.maxStacks = 3;
  }
  if (main.card_id === 'ameris') {
    modifiers.critRateBonus += 10;
    modifiers.cdm = 2.5;
  }
  if (main.card_id === 'daisy') {
    modifiers.damageMultiplier *= 1.1;
    modifiers.incomingDamageMultiplier *= 0.8;
  }
  return modifiers;
}

export class CardBattleState {
  constructor(mainCard, supportCard = null) {
    this.mainCard = mainCard ?? null;
    this.supportCard = supportCard ?? null;
    this.isActive = Boolean(
      mainCard &&
      mainCard.type === 'main' &&
      Number(mainCard.level) >= CARD_PASSIVE_LEVEL
    );
    this.cardId = this.isActive ? mainCard.card_id : null;

    const sfx = supportEffects(supportCard);
    this.supportDamageMultiplier = 1 + (sfx.damageDealt ?? 0);
    this.supportIncomingMultiplier = 1 + (sfx.damageTaken ?? 0);
    this.supportCritRateBonus = sfx.critRate ?? 0;

    // Girgas state
    this.lollipopStacks = 0;
    this.lollipopExpiresAt = 0;
    this.lastLollipopTrigger = -Infinity;

    // Lena state
    this.starFragmentStacks = 0;
    this.starFragmentExpiresAt = 0;
    this.lastStarFragmentTrigger = -Infinity;

    // Ameris state
    this.userHits = 0;
    this.amerisActiveUntil = 0;
    this.lastAmerisActivation = -Infinity;
  }

  reset() {
    this.lollipopStacks = 0;
    this.lollipopExpiresAt = 0;
    this.lastLollipopTrigger = -Infinity;

    this.starFragmentStacks = 0;
    this.starFragmentExpiresAt = 0;
    this.lastStarFragmentTrigger = -Infinity;

    this.userHits = 0;
    this.amerisActiveUntil = 0;
    this.lastAmerisActivation = -Infinity;
  }

  onHitDealt(now = Date.now()) {
    if (!this.isActive) return;

    if (this.cardId === 'girgas') {
      if (now >= this.lollipopExpiresAt) {
        this.lollipopStacks = 0;
      }
      if (now - this.lastLollipopTrigger >= 2000) {
        this.lollipopStacks = Math.min(2, this.lollipopStacks + 1);
        this.lollipopExpiresAt = now + 8000;
        this.lastLollipopTrigger = now;
      }
    } else if (this.cardId === 'ameris') {
      this.userHits++;
      if (this.userHits % 3 === 0) {
        if (now - this.lastAmerisActivation >= 6000) {
          this.amerisActiveUntil = now + 4000;
          this.lastAmerisActivation = now;
        }
      }
    }
  }

  onHitReceived(now = Date.now()) {
    if (!this.isActive) return;

    if (this.cardId === 'lena') {
      if (now >= this.starFragmentExpiresAt) {
        this.starFragmentStacks = 0;
      }
      if (now - this.lastStarFragmentTrigger >= 4000) {
        this.starFragmentStacks = Math.min(3, this.starFragmentStacks + 1);
        this.starFragmentExpiresAt = now + 5000;
        this.lastStarFragmentTrigger = now;
      }
    }
  }

  getStatModifiers(baseAtk, baseDef, now = Date.now()) {
    let atk = baseAtk;
    let def = baseDef;

    if (this.isActive && this.cardId === 'lena') {
      const stacks =
        now < this.starFragmentExpiresAt ? this.starFragmentStacks : 0;
      if (stacks > 0) {
        const bonus = stacks * 0.1;
        atk = Math.floor(baseAtk * (1 + bonus));
        def = Math.floor(baseDef * (1 + bonus));
      }
    }

    return { atk, def };
  }

  getCritModifiers(now = Date.now()) {
    let critRateBonus = this.supportCritRateBonus;
    let cdm = 2.0;

    if (this.isActive && this.cardId === 'ameris') {
      if (now < this.amerisActiveUntil) {
        critRateBonus += 10;
        cdm = 2.5;
      }
    }

    return { critRateBonus, cdm };
  }

  getDamageModifiers(currentHp, maxHp, now = Date.now()) {
    let damageMultiplier = this.supportDamageMultiplier;
    let incomingDamageMultiplier = this.supportIncomingMultiplier;

    if (!this.isActive) {
      return { damageMultiplier, incomingDamageMultiplier };
    }

    if (this.cardId === 'girgas') {
      const stacks = now < this.lollipopExpiresAt ? this.lollipopStacks : 0;
      damageMultiplier *= 1 + stacks * 0.1;
    } else if (this.cardId === 'daisy') {
      const hpRatio = maxHp > 0 ? currentHp / maxHp : 0;
      let dealtBonus;
      let takenMult;

      if (hpRatio > 0.75) {
        dealtBonus = 0.1;
        takenMult = 0.8;
      } else if (hpRatio > 0.5) {
        dealtBonus = 0.2;
        takenMult = 0.9;
      } else if (hpRatio > 0.25) {
        dealtBonus = 0.3;
        takenMult = 0.9;
      } else {
        dealtBonus = 0.4;
        takenMult = 0.9;
      }

      damageMultiplier *= 1 + dealtBonus;
      incomingDamageMultiplier *= takenMult;
    }

    return { damageMultiplier, incomingDamageMultiplier };
  }
}

export function createCardBattleState(main, support = null) {
  return new CardBattleState(main, support);
}

export function applyOutgoingCardDamage(damage, fighter, now = Date.now()) {
  if (fighter?.cardBattleState) {
    const { damageMultiplier } = fighter.cardBattleState.getDamageModifiers(
      fighter.hp,
      fighter.max_hp,
      now
    );
    return Math.max(1, Math.floor(damage * damageMultiplier));
  }
  const modifiers = fighter?.cardModifiers;
  if (!modifiers) return damage;
  let multiplier = modifiers.damageMultiplier ?? 1;
  if (modifiers.lowHpDamageMultiplier && fighter.hp / fighter.max_hp <= 0.3) {
    multiplier *= modifiers.lowHpDamageMultiplier;
  }
  return Math.max(1, Math.floor(damage * multiplier));
}

export function applyIncomingCardDamage(damage, fighter, now = Date.now()) {
  if (fighter?.cardBattleState) {
    const { incomingDamageMultiplier } =
      fighter.cardBattleState.getDamageModifiers(
        fighter.hp,
        fighter.max_hp,
        now
      );
    return Math.max(1, Math.floor(damage * incomingDamageMultiplier));
  }
  return Math.max(
    1,
    Math.floor(damage * (fighter?.cardModifiers?.incomingDamageMultiplier ?? 1))
  );
}

export function cardTurnStats(fighter, now = Date.now()) {
  if (fighter?.cardBattleState) {
    return fighter.cardBattleState.getStatModifiers(
      fighter.atk,
      fighter.def,
      now
    );
  }
  const modifiers = fighter?.cardModifiers;
  const hits = fighter?.cardHits ?? 0;
  let atk = fighter?.atk ?? 0;
  let def = fighter?.def ?? 0;
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

export function getCardCdm(fighter, now = Date.now()) {
  if (fighter?.cardBattleState) {
    return fighter.cardBattleState.getCritModifiers(now).cdm;
  }
  return 2.0;
}

export function getCardCritRate(fighter, now = Date.now()) {
  const baseRate = fighter?.critRate ?? 0.05;
  const bonus =
    (fighter?.cardBattleState?.getCritModifiers(now).critRateBonus ?? 0) / 100;
  return Math.max(0, Math.min(0.95, baseRate + bonus));
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
      if (card.type !== 'main')
        throw new Error('Support Card tidak dapat di-upgrade.');
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
    if (!['main', 'support'].includes(slot))
      throw new Error('Slot Card tidak valid.');
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

  async getBattleState(jid) {
    const [main, support] = await Promise.all([
      cardModel.equipped(jid, 'main'),
      cardModel.equipped(jid, 'support'),
    ]);
    return new CardBattleState(main, support);
  }

  /**
   * Total Coin reward aktivitas RPG setelah bonus Support Card
   * (Treasure Hunter +8%). Dipakai HANYA di titik reward normal;
   * transfer/bank/shop/market/refund tidak lewat sini.
   */
  async coinRewardTotal(jid, baseAmount, client = sql) {
    const support = await cardModel.equipped(jid, 'support', client);
    return Math.max(
      0,
      Math.floor(Number(baseAmount) * supportCoinMultiplier(support))
    );
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
      if (product.type === 'support') {
        const ownedSupports = await cardModel.owned(jid, 'support', t);
        if (ownedSupports.some((c) => c.card_id === productId)) {
          throw new Error(`Kamu sudah memiliki *${product.name}*.`);
        }
      }
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
