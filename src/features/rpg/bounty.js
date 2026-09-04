import { statsModel, walletModel, userModel } from '#storage/models/index.js';
import { domainService } from '#features/rpg/domain.js';
import { F } from '#helpers/index.js';

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
        hp: 2_450,
        atk: 175,
        def: 84,
      },
      {
        id: 'garong',
        name: 'Garong Kampung',
        emoji: '🗡️',
        hp: 2_940,
        atk: 210,
        def: 105,
      },
      {
        id: 'rampok',
        name: 'Rampok Jalanan',
        emoji: '🪓',
        hp: 3_500,
        atk: 245,
        def: 126,
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
        hp: 8_400,
        atk: 385,
        def: 280,
      },
      {
        id: 'preman',
        name: 'Preman Pelabuhan',
        emoji: '🥊',
        hp: 9_800,
        atk: 455,
        def: 336,
      },
      {
        id: 'sindikat',
        name: 'Bos Sindikat',
        emoji: '🎭',
        hp: 11_200,
        atk: 525,
        def: 385,
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
        hp: 15_750,
        atk: 756,
        def: 441,
      },
      {
        id: 'warlord',
        name: 'Warlord',
        emoji: '⚔️',
        hp: 18_900,
        atk: 882,
        def: 536,
      },
      {
        id: 'overlord',
        name: 'Cursed Overlord',
        emoji: '👹',
        hp: 22_050,
        atk: 1_008,
        def: 630,
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
