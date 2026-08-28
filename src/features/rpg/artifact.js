import { db } from '#storage/connection.js';
import {
  artifactModel,
  statsModel,
  walletModel,
  userModel,
} from '#storage/models/index.js';

const SLOTS = {
  flower: { mainStat: 'hp', substats: false },
  feather: { mainStat: 'atk', substats: false },
  sands: { mainStat: ['hp_percent', 'atk_percent', 'def_percent'], substats: true },
  goblet: { mainStat: ['hp_percent', 'atk_percent', 'def_percent'], substats: true },
  circlet: { mainStat: ['hp_percent', 'atk_percent', 'def_percent', 'crit_rate'], substats: true },
};

const STAT_NAMES = {
  hp: 'HP',
  atk: 'ATK',
  hp_percent: 'HP%',
  atk_percent: 'ATK%',
  def_percent: 'DEF%',
  crit_rate: 'CRIT Rate',
};

const STAT_FORMAT = {
  hp: (v) => `+${v} HP`,
  atk: (v) => `+${v} ATK`,
  hp_percent: (v) => `+${(v / 10).toFixed(1)}% HP`,
  atk_percent: (v) => `+${(v / 10).toFixed(1)}% ATK`,
  def_percent: (v) => `+${(v / 10).toFixed(1)}% DEF`,
  crit_rate: (v) => `+${(v / 10).toFixed(1)}% CRIT Rate`,
};

const MAIN_STAT_SCALING = {
  hp: { 0: 50, 20: 300 },
  atk: { 0: 10, 20: 56 },
  hp_percent: { 0: 2, 20: 18 },
  atk_percent: { 0: 2, 20: 18 },
  def_percent: { 0: 2, 20: 18 },
  crit_rate: { 0: 2, 20: 16 },
};

const SUBSTAT_VALUES = {
  hp: { base: 3, upgrade: 5 },
  atk: { base: 1, upgrade: 2 },
  def: { base: 1, upgrade: 2 },
};

const ALL_SUBSTATS = ['hp', 'atk', 'def'];

const UPGRADE_MILESTONES = [4, 8, 12, 16, 20];

const LEVELING_COSTS = {
  1: { coins: 250, exp: 0 },
  2: { coins: 300, exp: 0 },
  3: { coins: 350, exp: 0 },
  4: { coins: 500, exp: 50 },
  5: { coins: 550, exp: 0 },
  6: { coins: 600, exp: 0 },
  7: { coins: 650, exp: 0 },
  8: { coins: 800, exp: 80 },
  9: { coins: 850, exp: 0 },
  10: { coins: 900, exp: 0 },
  11: { coins: 950, exp: 0 },
  12: { coins: 1100, exp: 100 },
  13: { coins: 1200, exp: 0 },
  14: { coins: 1300, exp: 0 },
  15: { coins: 1400, exp: 0 },
  16: { coins: 1600, exp: 120 },
  17: { coins: 1700, exp: 0 },
  18: { coins: 1800, exp: 0 },
  19: { coins: 1900, exp: 0 },
};

const SLOT_EMOJI = {
  flower: '🌸',
  feather: '🪶',
  sands: '⏳',
  goblet: '🏆',
  circlet: '👑',
};

function weightedRandom(values, weights) {
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * totalWeight;
  for (let i = 0; i < values.length; i++) {
    if (r < weights[i]) return values[i];
    r -= weights[i];
  }
  return values[values.length - 1];
}

function interpolateMainStat(stat, level) {
  const scale = MAIN_STAT_SCALING[stat];
  if (!scale) return 0;
  const ratio = level / 20;
  return Math.floor(scale[0] + (scale[20] - scale[0]) * ratio);
}

function randomName(slot) {
  const prefixes = {
    flower: ['Flame', 'Rose', 'Lotus', 'Lily', 'Dawn', 'Star', 'Moon', 'Sun', 'Storm', 'Wind'],
    feather: ['Storm', 'Wind', 'Sky', 'Cloud', 'Gale', 'Zephyr', 'Feather', 'Wing', 'Plume', 'Gust'],
    sands: ['Time', 'Hour', 'Clock', 'Sand', 'Moment', 'Era', 'Age', 'Cycle', 'Epoch', 'Phase'],
    goblet: ['Chalice', 'Cup', 'Vessel', 'Grail', 'Wine', 'Dew', 'Nectar', 'Elixir', 'Draught', 'Draft'],
    circlet: ['Crown', 'Halo', 'Diadem', 'Wreath', 'Band', 'Circlet', 'Coronet', 'Tiara', 'Laurel', 'Ring'],
  };
  const suffixes = {
    flower: ['Petal', 'Bloom', 'Flora', 'Blossom', 'Bud', 'Garden', 'Field', 'Meadow'],
    feather: ['Feather', 'Plume', 'Wing', 'Quill', 'Fletch', 'Down', 'Pinion'],
    sands: ['Hourglass', 'Sands', 'Timer', 'Watch', 'Dial', 'Meridian', 'Equinox'],
    goblet: ['Goblet', 'Chalice', 'Cup', 'Vessel', 'Grail', 'Cradle', 'Basin'],
    circlet: ['Crown', 'Circlet', 'Diadem', 'Halo', 'Wreath', 'Coronet', 'Tiara'],
  };
  const p = prefixes[slot];
  const s = suffixes[slot];
  return `${p[Math.floor(Math.random() * p.length)]} ${s[Math.floor(Math.random() * s.length)]}`;
}

class ArtifactService {
  get slots() {
    return SLOTS;
  }

  get slotEmoji() {
    return SLOT_EMOJI;
  }

  get statNames() {
    return STAT_NAMES;
  }

  getStatFormat(stat) {
    return STAT_FORMAT[stat] || ((v) => `+${v}`);
  }

  generateArtifact(jid, forceSlot = null) {
    const slot = forceSlot || weightedRandom(
      Object.keys(SLOTS),
      [1, 1, 1, 1, 1]
    );
    const config = SLOTS[slot];
    const mainStat = Array.isArray(config.mainStat)
      ? config.mainStat[Math.floor(Math.random() * config.mainStat.length)]
      : config.mainStat;
    const level = 1;
    const mainValue = interpolateMainStat(mainStat, level);
    const substats = {};
    if (config.substats) {
      const available = [...ALL_SUBSTATS];
      const count = Math.floor(Math.random() * 3) + 1;
      for (let i = 0; i < count && available.length > 0; i++) {
        const idx = Math.floor(Math.random() * available.length);
        const stat = available.splice(idx, 1)[0];
        substats[stat] = SUBSTAT_VALUES[stat].base;
      }
    }
    const name = randomName(slot);
    return artifactModel.create({
      owner_jid: jid,
      name,
      slot,
      level,
      main_stat: mainStat,
      main_value: mainValue,
      substats,
    });
  }

  getArtifacts(jid) {
    return artifactModel.findByOwner(jid);
  }

  getArtifactsBySlot(jid, slot) {
    return artifactModel.findByOwnerAndSlot(jid, slot);
  }

  getArtifact(jid, userId) {
    return artifactModel.find(jid, userId);
  }

  getInventory(jid) {
    return artifactModel.getInventory(jid);
  }

  equip(jid, userId) {
    const artifact = artifactModel.find(jid, userId);
    if (!artifact) throw new Error('Artifact tidak ditemukan.');
    const inventory = artifactModel.getInventory(jid) || {
      flower_id: null, feather_id: null, sands_id: null, goblet_id: null, circlet_id: null,
    };
    const slotKey = `${artifact.slot}_id`;
    inventory[slotKey] = artifact.id;
    artifactModel.setInventory(
      jid,
      inventory.flower_id, inventory.feather_id,
      inventory.sands_id, inventory.goblet_id, inventory.circlet_id
    );
    return artifact;
  }

  unequip(slot, jid) {
    if (!SLOTS[slot]) throw new Error(`Slot tidak valid: ${slot}. Slot yang tersedia: flower, feather, sands, goblet, circlet.`);
    const inventory = artifactModel.getInventory(jid);
    if (!inventory) throw new Error('Tidak ada artifact yang terpasang.');
    const slotKey = `${slot}_id`;
    const artifactId = inventory[slotKey];
    if (!artifactId) throw new Error(`Tidak ada artifact di slot ${slot}.`);
    inventory[slotKey] = null;
    artifactModel.setInventory(
      jid,
      inventory.flower_id, inventory.feather_id,
      inventory.sands_id, inventory.goblet_id, inventory.circlet_id
    );
    return artifactModel.findById(artifactId);
  }

  canUpgrade(artifact) {
    return artifact.level < 20;
  }

  getUpgradeCost(artifact) {
    if (!this.canUpgrade(artifact)) return null;
    return LEVELING_COSTS[artifact.level];
  }

  upgrade(jid, userId) {
    const artifact = artifactModel.find(jid, userId);
    if (!artifact) throw new Error('Artifact tidak ditemukan.');
    if (!this.canUpgrade(artifact)) throw new Error('Artifact sudah mencapai level maksimum (20).');

    const wallet = walletModel.find(jid);
    const user = userModel.findById(jid);
    let coins = wallet?.cash ?? 0;
    let exp = user?.exp ?? 0;
    let totalCostCoins = 0;
    let totalCostExp = 0;
    let targetLevel = artifact.level;

    for (let lv = artifact.level; lv < 20; lv++) {
      const cost = LEVELING_COSTS[lv];
      if (!cost) break;
      if (coins < cost.coins) break;
      if (cost.exp > 0 && exp < cost.exp) break;
      coins -= cost.coins;
      exp -= cost.exp;
      totalCostCoins += cost.coins;
      totalCostExp += cost.exp;
      targetLevel = lv + 1;
    }

    if (targetLevel === artifact.level) {
      const nextCost = LEVELING_COSTS[artifact.level];
      throw new Error(`Butuh ${nextCost.coins} koin untuk upgrade. Kamu hanya punya ${wallet?.cash ?? 0}.`);
    }

    const fromLevel = artifact.level;
    db.transaction(() => {
      walletModel.addCash(jid, -totalCostCoins);
      if (totalCostExp > 0) {
        userModel.addExp(jid, -totalCostExp);
      }
      artifact.level = targetLevel;
      artifact.main_value = interpolateMainStat(artifact.main_stat, artifact.level);
      for (let lv = fromLevel + 1; lv <= targetLevel; lv++) {
        if (UPGRADE_MILESTONES.includes(lv)) {
          const subKeys = Object.keys(artifact.substats);
          if (subKeys.length > 0) {
            const key = subKeys[Math.floor(Math.random() * subKeys.length)];
            artifact.substats[key] += SUBSTAT_VALUES[key].upgrade;
          }
        }
      }
      artifactModel.update(artifact);
    })();
    return artifact;
  }

  getPlayerStats(jid) {
    const base = statsModel.find(jid);
    const baseHp = base?.max_hp ?? 1200;
    const baseAtk = base?.atk ?? 30;
    const baseDef = base?.def ?? 20;
    const baseCritRate = base?.crit_rate ?? 5;
    let artifactHp = 0;
    let artifactAtk = 0;
    let artifactDef = 0;
    let artifactCritRate = 0;
    const inventory = artifactModel.getInventory(jid);
    if (inventory) {
      const slots = ['flower', 'feather', 'sands', 'goblet', 'circlet'];
      for (const slot of slots) {
        const artifactId = inventory[`${slot}_id`];
        if (!artifactId) continue;
        const artifact = artifactModel.findById(artifactId);
        if (!artifact) continue;
        switch (artifact.main_stat) {
          case 'hp': artifactHp += artifact.main_value; break;
          case 'atk': artifactAtk += artifact.main_value; break;
          case 'hp_percent': artifactHp += Math.floor(baseHp * artifact.main_value / 100); break;
          case 'atk_percent': artifactAtk += Math.floor(baseAtk * artifact.main_value / 100); break;
          case 'def_percent': artifactDef += Math.floor(baseDef * artifact.main_value / 100); break;
          case 'crit_rate': artifactCritRate += artifact.main_value / 10; break;
        }
        for (const [stat, value] of Object.entries(artifact.substats)) {
          switch (stat) {
            case 'hp': artifactHp += value; break;
            case 'atk': artifactAtk += value; break;
            case 'def': artifactDef += value; break;
          }
        }
      }
    }
    return {
      hp: baseHp + artifactHp,
      atk: baseAtk + artifactAtk,
      def: baseDef + artifactDef,
      critRate: baseCritRate + artifactCritRate,
    };
  }

  getRawBaseStats(jid) {
    const base = statsModel.find(jid);
    return {
      hp: base?.max_hp ?? 1200,
      atk: base?.atk ?? 30,
      def: base?.def ?? 20,
      critRate: base?.crit_rate ?? 5,
    };
  }

  formatArtifact(artifact) {
    const mainStatName = STAT_NAMES[artifact.main_stat] || artifact.main_stat;
    const mainFormatted = this.getStatFormat(artifact.main_stat)(artifact.main_value);
    const subLines = Object.entries(artifact.substats).map(([stat, value]) => {
      const name = STAT_NAMES[stat] || stat;
      const formatted = this.getStatFormat(stat)(value);
      return `  - ${name}: ${formatted}`;
    });
    return {
      slot: artifact.slot,
      level: artifact.level,
      mainStat: `${mainStatName}: ${mainFormatted}`,
      substats: subLines,
    };
  }

  formatArtifactFull(artifact) {
    const formatted = this.formatArtifact(artifact);
    const equipped = artifactModel.isEquipped(artifact.id);
    return [
      `*[${SLOT_EMOJI[artifact.slot]} ${artifact.name}]*`,
      `Slot: ${artifact.slot} | Lv.${artifact.level}`,
      `Main: ${formatted.mainStat}`,
      formatted.substats.length > 0 ? 'Substats:' : 'Substats: (tidak ada)',
      ...formatted.substats,
      equipped ? 'Status: *Equipped*' : '',
    ].filter(Boolean).join('\n');
  }
}

export const artifactService = new ArtifactService();
