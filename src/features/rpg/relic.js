import { db } from '#storage/connection.js';
import { relicModel, walletModel, userModel, inventoryModel } from '#storage/models/index.js';

const SLOTS = {
  head: { name: 'Head', mainStats: ['hp_flat'], weights: [1] },
  hands: { name: 'Hands', mainStats: ['atk_flat'], weights: [1] },
  body: { name: 'Body', mainStats: ['crit_rate', 'hp_percent', 'def_percent'], weights: [1, 1, 1] },
  feet: { name: 'Feet', mainStats: ['spd_flat', 'def_percent', 'hp_percent'], weights: [1, 2, 2] },
};

const STAT_NAMES = {
  hp_flat: { name: 'HP', format: (v) => `+${v} HP` },
  atk_flat: { name: 'ATK', format: (v) => `+${v} ATK` },
  crit_rate: { name: 'Crit Rate', format: (v) => `+${(v / 10).toFixed(1)}% Crit Rate` },
  hp_percent: { name: 'HP%', format: (v) => `+${(v / 10).toFixed(1)}% HP` },
  def_percent: { name: 'DEF%', format: (v) => `+${(v / 10).toFixed(1)}% DEF` },
  spd_flat: { name: 'SPD', format: (v) => `+${v} SPD` },
};

const MAIN_STAT_VALUES = {
  hp_flat: { 1: 5, 15: 20 },
  atk_flat: { 1: 2, 15: 8 },
  crit_rate: { 1: 2, 15: 8 },
  hp_percent: { 1: 3, 15: 12 },
  def_percent: { 1: 3, 15: 12 },
  spd_flat: { 1: 2, 15: 6 },
};

const SUBSTAT_VALUES = {
  hp_flat: { 1: 3, 5: 5 },
  atk_flat: { 1: 1, 5: 2 },
  crit_rate: { 1: 1, 5: 2 },
  hp_percent: { 1: 2, 5: 3 },
  def_percent: { 1: 2, 5: 3 },
  spd_flat: { 1: 1, 5: 2 },
};

const ALL_SUBSTATS = ['hp_flat', 'atk_flat', 'crit_rate', 'hp_percent', 'def_percent', 'spd_flat'];

const LEVELING_COSTS = {
  1: { coins: 500, cerelia: 2, userExp: 0 },
  2: { coins: 600, cerelia: 3, userExp: 0 },
  3: { coins: 700, cerelia: 4, userExp: 0 },
  4: { coins: 800, cerelia: 5, userExp: 0 },
  5: { coins: 1000, cerelia: 0, userExp: 100 },
  6: { coins: 1100, cerelia: 3, userExp: 0 },
  7: { coins: 1200, cerelia: 4, userExp: 0 },
  8: { coins: 1300, cerelia: 5, userExp: 0 },
  9: { coins: 1400, cerelia: 6, userExp: 0 },
  10: { coins: 1800, cerelia: 0, userExp: 200 },
  11: { coins: 2000, cerelia: 5, userExp: 0 },
  12: { coins: 2200, cerelia: 6, userExp: 0 },
  13: { coins: 2400, cerelia: 7, userExp: 0 },
  14: { coins: 2600, cerelia: 8, userExp: 0 },
  15: { coins: 3000, cerelia: 0, userExp: 300 },
};

const DROP_TABLE = {
  easy: { chance: 0.3, min: 0, max: 1 },
  medium: { chance: 1, min: 1, max: 2, bonusChance: 0.1 },
  hard: { chance: 1, min: 0, max: 2, guaranteeTwo: 0.5 },
};

function weightedRandom(values, weights) {
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let random = Math.random() * totalWeight;
  for (let i = 0; i < values.length; i++) {
    if (random < weights[i]) return values[i];
    random -= weights[i];
  }
  return values[values.length - 1];
}

function interpolateStat(stat, level) {
  const values = MAIN_STAT_VALUES[stat];
  const ratio = (level - 1) / 14;
  return Math.floor(values[1] + (values[15] - values[1]) * ratio);
}

function rollMainStat(slot) {
  const config = SLOTS[slot];
  return weightedRandom(config.mainStats, config.weights);
}

function rollSubstats(count = 3) {
  const available = [...ALL_SUBSTATS];
  const substats = [];
  for (let i = 0; i < count && available.length > 0; i++) {
    const statIndex = Math.floor(Math.random() * available.length);
    const stat = available.splice(statIndex, 1)[0];
    substats.push({ stat, value: 0, rolls: 0 });
  }
  return substats;
}

function getEquippedStats(jid) {
  const inventory = relicModel.getInventory(jid);
  if (!inventory) return null;
  const stats = {
    hp_flat: 0,
    atk_flat: 0,
    crit_rate: 0,
    hp_percent: 0,
    def_percent: 0,
    spd_flat: 0,
  };
  const slots = ['head', 'hands', 'body', 'feet'];
  for (const slot of slots) {
    const relicId = inventory[`${slot}_id`];
    if (!relicId) continue;
    const relic = relicModel.find(relicId);
    if (!relic) continue;
    stats[relic.main_stat] += relic.main_value;
    for (const sub of relic.substats) {
      stats[sub.stat] += sub.value;
    }
  }
  return stats;
}

function applyRelicStats(state, stats) {
  if (!stats) return;
  const maxHpBonus = stats.hp_flat || 0;
  const hpPercent = (stats.hp_percent || 0) / 100;
  const defPercent = (stats.def_percent || 0) / 100;
  const atkFlat = stats.atk_flat || 0;
  const critRate = (stats.crit_rate || 0) / 100;
  const spdFlat = stats.spd_flat || 0;
  state.baseMaxHp += maxHpBonus + Math.floor(state.baseMaxHp * hpPercent);
  state.hp = Math.min(state.hp, state.baseMaxHp);
  state.relicAtk = atkFlat;
  state.relicDef = Math.floor(state.baseMaxHp * defPercent);
  state.relicCritRate = critRate;
  state.relicSpd = spdFlat;
}

class RelicService {
  get slots() {
    return SLOTS;
  }

  get statNames() {
    return STAT_NAMES;
  }

  rollDrop(difficulty) {
    const table = DROP_TABLE[difficulty];
    if (!table) return 0;
    if (difficulty === 'easy') {
      return Math.random() < table.chance ? 1 : 0;
    }
    if (difficulty === 'medium') {
      if (Math.random() < table.bonusChance) return 2;
      return 1;
    }
    if (difficulty === 'hard') {
      return Math.random() < table.guaranteeTwo ? 2 : 0;
    }
    return 0;
  }

  generateRelic(jid) {
    const slot = weightedRandom(
      Object.keys(SLOTS),
      [1, 1, 1, 1]
    );
    const mainStat = rollMainStat(slot);
    const level = 1;
    const mainValue = interpolateStat(mainStat, level);
    const substats = rollSubstats(3);
    for (const sub of substats) {
      sub.value = SUBSTAT_VALUES[sub.stat][1];
    }
    return relicModel.create({
      owner_jid: jid,
      slot,
      main_stat: mainStat,
      main_value: mainValue,
      substats,
      level,
    });
  }

  getRelics(jid) {
    return relicModel.findByOwner(jid);
  }

  getRelicsBySlot(jid, slot) {
    return relicModel.findByOwnerAndSlot(jid, slot);
  }

  getInventory(jid) {
    return relicModel.getInventory(jid);
  }

  equip(relicId, jid) {
    const relic = relicModel.find(relicId);
    if (!relic) throw new Error('Relic tidak ditemukan.');
    if (relic.owner_jid !== jid) throw new Error('Relic bukan milikmu.');
    const inventory = relicModel.getInventory(jid) || {
      head_id: null,
      hands_id: null,
      body_id: null,
      feet_id: null,
    };
    inventory[`${relic.slot}_id`] = relic.id;
    relicModel.setInventory(jid, inventory.head_id, inventory.hands_id, inventory.body_id, inventory.feet_id);
    return relic;
  }

  unequip(slot, jid) {
    const inventory = relicModel.getInventory(jid);
    if (!inventory) throw new Error('Tidak ada relic yang terpasang.');
    const relicId = inventory[`${slot}_id`];
    if (!relicId) throw new Error(`Tidak ada relic di slot ${slot}.`);
    inventory[`${slot}_id`] = null;
    relicModel.setInventory(jid, inventory.head_id, inventory.hands_id, inventory.body_id, inventory.feet_id);
    return relicModel.find(relicId);
  }

  canLevelUp(relic) {
    return relic.level < 15;
  }

  getLevelUpCost(relic) {
    if (!this.canLevelUp(relic)) return null;
    return LEVELING_COSTS[relic.level];
  }

  levelUp(relicId, jid) {
    const relic = relicModel.find(relicId);
    if (!relic) throw new Error('Relic tidak ditemukan.');
    if (relic.owner_jid !== jid) throw new Error('Relic bukan milikmu.');
    if (!this.canLevelUp(relic)) throw new Error('Relic sudah mencapai level maksimum (15).');

    const wallet = walletModel.find(jid);
    const user = userModel.findById(jid);
    let coins = wallet?.cash ?? 0;
    let exp = user?.exp ?? 0;
    let cereliaItem = inventoryModel.getItem(jid, 'cerelia');
    let cerelia = cereliaItem?.quantity ?? 0;
    let totalCostCoins = 0;
    let totalCostExp = 0;
    let totalCostCerelia = 0;
    let targetLevel = relic.level;

    for (let lv = relic.level; lv < 15; lv++) {
      const cost = LEVELING_COSTS[lv];
      if (!cost) break;
      if (coins < cost.coins) break;
      if (cost.cerelia > 0 && cerelia < cost.cerelia) break;
      if (cost.userExp > 0 && exp < cost.userExp) break;
      coins -= cost.coins;
      cerelia -= cost.cerelia;
      exp -= cost.userExp;
      totalCostCoins += cost.coins;
      totalCostCerelia += cost.cerelia;
      totalCostExp += cost.userExp;
      targetLevel = lv + 1;
    }

    if (targetLevel === relic.level) {
      const nextCost = LEVELING_COSTS[relic.level];
      throw new Error(`Butuh ${nextCost.coins} koin${nextCost.cerelia > 0 ? ` + ${nextCost.cerelia} Cerelia` : ''}${nextCost.userExp > 0 ? ` + ${nextCost.userExp} EXP` : ''} untuk upgrade. Kamu tidak punya cukup resources.`);
    }

    const fromLevel = relic.level;
    db.transaction(() => {
      walletModel.addCash(jid, -totalCostCoins);
      if (totalCostCerelia > 0) {
        inventoryModel.remove(jid, 'cerelia', totalCostCerelia);
      }
      if (totalCostExp > 0) {
        userModel.addExp(jid, -totalCostExp);
      }
      relic.level = targetLevel;
      relic.main_value = interpolateStat(relic.main_stat, relic.level);
      for (let lv = fromLevel + 1; lv <= targetLevel; lv++) {
        if (lv % 5 === 0 && relic.substats.length > 0) {
          const subIndex = Math.floor(Math.random() * relic.substats.length);
          const sub = relic.substats[subIndex];
          const upgradeValues = SUBSTAT_VALUES[sub.stat];
          sub.value += upgradeValues[5] || upgradeValues[1];
          sub.rolls += 1;
        }
      }
      relicModel.update(relic);
    })();
    return relic;
  }

  smelt(relicId, jid) {
    const relic = relicModel.find(relicId);
    if (!relic) throw new Error('Relic tidak ditemukan.');
    if (relic.owner_jid !== jid) throw new Error('Relic bukan milikmu.');
    const inventory = relicModel.getInventory(jid);
    if (inventory) {
      const equipped = ['head_id', 'hands_id', 'body_id', 'feet_id'].some(
        (key) => inventory[key] === relic.id
      );
      if (equipped) throw new Error('Tidak bisa melebur relic yang sedang terpasang.');
    }
    const coins = relic.level * 200;
    let cerelia = 0;
    if (relic.level >= 15) {
      cerelia = 2;
    } else if (relic.level > 5) {
      cerelia = 1;
    }

    db.transaction(() => {
      walletModel.addCash(jid, coins);
      if (cerelia > 0) {
        inventoryModel.add(jid, 'cerelia', cerelia);
      }
      relicModel.delete(relic.id);
    })();

    return { coins, cerelia, relic };
  }

  getEquippedStats(jid) {
    return getEquippedStats(jid);
  }

  applyRelicStats(state, stats) {
    applyRelicStats(state, stats);
  }

  formatRelic(relic) {
    const slotName = SLOTS[relic.slot]?.name || relic.slot;
    const mainStatName = STAT_NAMES[relic.main_stat]?.name || relic.main_stat;
    const mainStatFormatted = STAT_NAMES[relic.main_stat]?.format(relic.main_value) || `+${relic.main_value}`;
    const substatLines = relic.substats.map((sub) => {
      const name = STAT_NAMES[sub.stat]?.name || sub.stat;
      const formatted = STAT_NAMES[sub.stat]?.format(sub.value) || `+${sub.value}`;
      const rolls = sub.rolls > 0 ? ` (${sub.rolls}x upgrade)` : '';
      return `  - ${name}: ${formatted}${rolls}`;
    });
    return {
      slot: slotName,
      level: relic.level,
      mainStat: `${mainStatName}: ${mainStatFormatted}`,
      substats: substatLines,
    };
  }

  formatRelicFull(relic) {
    const formatted = this.formatRelic(relic);
    const equipped = relicModel.isEquipped(relic.id);
    return [
      `*[${formatted.slot} Relic]* Lv.${relic.level}`,
      `Main: ${formatted.mainStat}`,
      'Substats:',
      ...formatted.substats,
      equipped ? 'Status: *Equipped*' : '',
    ].filter(Boolean).join('\n');
  }
}

export const relicService = new RelicService();
