import { statsModel, walletModel, userModel } from '#storage/models/index.js';
import { domainService } from '#features/rpg/domain.js';
import { F } from '#helpers/index.js';

// Combat memakai mesin Domain (simulateBattleAgainst), jadi di sini cukup
// mendefinisikan buronan + hadiah Coin per difficulty.
const DIFFICULTY = {
  easy: {
    name: 'Easy',
    label: '🟢 EASY',
    coin: [6_000, 8_000],
    exp: [20, 40],
    targets: [
      {
        id: 'copet',
        name: 'Copet Pasar',
        emoji: '🪙',
        hp: 3_500,
        atk: 250,
        def: 120,
      },
      {
        id: 'garong',
        name: 'Garong Kampung',
        emoji: '🗡️',
        hp: 4_200,
        atk: 300,
        def: 150,
      },
      {
        id: 'rampok',
        name: 'Rampok Jalanan',
        emoji: '🪓',
        hp: 5_000,
        atk: 350,
        def: 180,
      },
    ],
  },
  medium: {
    name: 'Medium',
    label: '🟡 MEDIUM',
    coin: [13_000, 17_000],
    exp: [50, 80],
    targets: [
      {
        id: 'bandit',
        name: 'Bandit Elite',
        emoji: '🏹',
        hp: 12_000,
        atk: 550,
        def: 400,
      },
      {
        id: 'preman',
        name: 'Preman Pelabuhan',
        emoji: '🥊',
        hp: 14_000,
        atk: 650,
        def: 480,
      },
      {
        id: 'sindikat',
        name: 'Bos Sindikat',
        emoji: '🎭',
        hp: 16_000,
        atk: 750,
        def: 550,
      },
    ],
  },
  hard: {
    name: 'Hard',
    label: '🔴 HARD',
    coin: [21_000, 27_000],
    exp: [100, 120],
    targets: [
      {
        id: 'assassin',
        name: 'Shadow Assassin',
        emoji: '🥷',
        hp: 25_000,
        atk: 1_200,
        def: 700,
      },
      {
        id: 'warlord',
        name: 'Warlord',
        emoji: '⚔️',
        hp: 30_000,
        atk: 1_400,
        def: 850,
      },
      {
        id: 'overlord',
        name: 'Cursed Overlord',
        emoji: '👹',
        hp: 35_000,
        atk: 1_600,
        def: 1_000,
      },
    ],
  },
};

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

class BountyService {
  get difficulty() {
    return DIFFICULTY;
  }

  getDifficultyConfig(difficulty) {
    if (!difficulty) return null;
    return DIFFICULTY[String(difficulty).toLowerCase()] ?? null;
  }

  getTarget(difficulty, targetId) {
    const config = this.getDifficultyConfig(difficulty);
    if (!config || !targetId) return null;
    const id = String(targetId).toLowerCase();
    return config.targets.find((target) => target.id === id) ?? null;
  }

  // Dipakai command sebelum cooldown dipasang, supaya pesan gagalnya jelas.
  async ensureAlive(jid) {
    const base = await statsModel.ensure(jid);
    if (!base || base.hp <= 0)
      throw new Error('HP kamu 0! Heal dulu sebelum berburu buronan.');
    return base;
  }

  async simulateBattle(jid, difficulty, targetId) {
    const target = this.getTarget(difficulty, targetId);
    if (!target) throw new Error('Target bounty tidak valid.');

    return domainService.simulateBattleAgainst(jid, target);
  }

  async grantReward(jid, difficulty, target) {
    const config = this.getDifficultyConfig(difficulty);
    if (!config) throw new Error('Difficulty tidak valid.');

    const coin = randInt(config.coin[0], config.coin[1]);
    const exp = randInt(config.exp[0], config.exp[1]);

    await walletModel.reward(
      jid,
      coin,
      `bounty ${String(difficulty).toLowerCase()}: ${target?.id ?? 'unknown'}`
    );
    await userModel.addExp(jid, exp);

    return { coin, exp };
  }

  targetStatLine(target) {
    return `HP ${target.hp} • ATK ${target.atk} • DEF ${target.def}`;
  }

  rewardRange(config) {
    return `${config.coin[0] / 1000}k-${config.coin[1] / 1000}k Coin`;
  }

  formatVictory(config, target, reward, rounds) {
    return [
      '🎯 BOUNTY CLEAR',
      '',
      `${target.emoji} ${target.name} tertangkap!`,
      `⚔️ ${rounds} round${rounds > 1 ? 's' : ''}`,
      '',
      '🎁 Reward',
      `🪙 +${F.formatNumber(reward.coin)} Coin`,
      `⭐ +${reward.exp} EXP`,
    ].join('\n');
  }

  formatDefeat(config, target, rounds) {
    return [
      '🎯 BOUNTY FAILED',
      '',
      `💀 Kamu kalah dari ${target.name}.`,
      `⚔️ Survived ${rounds} round${rounds > 1 ? 's' : ''}`,
      '',
      'Tidak ada reward.',
    ].join('\n');
  }
}

export const bountyService = new BountyService();
