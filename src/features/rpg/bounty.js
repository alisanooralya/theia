import { statsModel, walletModel } from '#storage/models/index.js';
import { domainService } from '#features/rpg/domain.js';
import { F } from '#helpers/index.js';

// Combat memakai mesin Domain (simulateBattleAgainst), jadi di sini cukup
// mendefinisikan buronan + hadiah Coin per difficulty.
const DIFFICULTY = {
  easy: {
    name: 'Easy',
    coin: [6_000, 8_000],
    targets: [
      {
        id: 'copet',
        name: 'Copet Pasar',
        emoji: '🪙',
        hp: 420,
        atk: 40,
        def: 10,
      },
      {
        id: 'garong',
        name: 'Garong Kampung',
        emoji: '🗡️',
        hp: 520,
        atk: 50,
        def: 20,
      },
      {
        id: 'rampok',
        name: 'Rampok Jalanan',
        emoji: '🪓',
        hp: 620,
        atk: 55,
        def: 30,
      },
    ],
  },
  medium: {
    name: 'Medium',
    coin: [13_000, 17_000],
    targets: [
      {
        id: 'bandit',
        name: 'Bandit Elite',
        emoji: '🏹',
        hp: 1_400,
        atk: 95,
        def: 300,
      },
      {
        id: 'preman',
        name: 'Preman Pelabuhan',
        emoji: '🥊',
        hp: 1_650,
        atk: 105,
        def: 340,
      },
      {
        id: 'sindikat',
        name: 'Bos Sindikat',
        emoji: '🎭',
        hp: 1_800,
        atk: 115,
        def: 360,
      },
    ],
  },
  hard: {
    name: 'Hard',
    coin: [21_000, 27_000],
    targets: [
      {
        id: 'assassin',
        name: 'Shadow Assassin',
        emoji: '🥷',
        hp: 2_700,
        atk: 215,
        def: 450,
      },
      {
        id: 'warlord',
        name: 'Warlord',
        emoji: '⚔️',
        hp: 3_100,
        atk: 190,
        def: 520,
      },
      {
        id: 'overlord',
        name: 'Cursed Overlord',
        emoji: '👹',
        hp: 3_400,
        atk: 200,
        def: 560,
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
    await walletModel.reward(
      jid,
      coin,
      `bounty ${String(difficulty).toLowerCase()}: ${target?.id ?? 'unknown'}`
    );

    return { coin };
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
