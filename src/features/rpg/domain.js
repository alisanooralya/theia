import {
  statsModel,
  walletModel,
  userModel,
} from '#storage/models/index.js';
import { artifactService } from '#features/rpg/artifact.js';

const CRIT_MULT = 1.5;
const MAX_ROUNDS = 30;

const DIFFICULTY = {
  easy: {
    name: 'Easy',
    boss: { name: 'Slime', hp: 500, atk: 50, def: 20 },
    coin: [100, 200],
    exp: [20, 40],
    artifactChance: 1.0,
    artifactCount: 1,
  },
  medium: {
    name: 'Medium',
    boss: { name: 'Golem', hp: 1000, atk: 100, def: 350 },
    coin: [300, 500],
    exp: [50, 80],
    artifactChance: 1.0,
    artifactCount: 2,
    secondArtifactChance: 0.1,
  },
  hard: {
    name: 'Hard',
    boss: { name: 'Dragon', hp: 2000, atk: 180, def: 500 },
    coin: [700, 1000],
    exp: [100, 150],
    artifactChance: 1.0,
    artifactCount: 2,
    secondArtifactChance: 0.3,
  },
};

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function calcDamage(attacker, defender) {
  const base = Math.max(1, attacker.atk - Math.floor(defender.def / 2));
  const vary = Math.floor(base * 0.2);
  let dmg = base + Math.floor(Math.random() * vary * 2) - vary;
  const crit = Math.random() < attacker.critRate;
  if (crit) dmg = Math.floor(dmg * CRIT_MULT);
  return { dmg: Math.max(1, dmg), crit };
}

function bar(value, max, size = 10) {
  const filled = Math.max(0, Math.min(size, Math.round((value / max) * size)));
  return '█'.repeat(filled) + '░'.repeat(size - filled);
}

class DomainService {
  get difficulty() {
    return DIFFICULTY;
  }

  getDifficultyConfig(difficulty) {
    return DIFFICULTY[difficulty] || null;
  }

  simulateBattle(jid, difficulty) {
    const config = DIFFICULTY[difficulty];
    if (!config) throw new Error('Difficulty tidak valid.');

    const base = statsModel.ensure(jid);
    if (base.hp <= 0) throw new Error('HP kamu 0! Heal dulu sebelum masuk Domain.');

    const pStats = artifactService.getPlayerStats(jid);
    const now = Math.floor(Date.now() / 1000);
    const effAtk = base.buff_expire > now ? pStats.atk + (base.buff_atk || 0) : pStats.atk;
    const effDef = base.buff_expire > now ? pStats.def + (base.buff_def || 0) : pStats.def;

    const player = {
      hp: base.hp,
      max_hp: base.max_hp,
      atk: effAtk,
      def: effDef,
      critRate: pStats.critRate / 100,
    };

    const boss = {
      hp: config.boss.hp,
      max_hp: config.boss.hp,
      atk: config.boss.atk,
      def: config.boss.def,
      critRate: 0.05,
    };

    const rounds = [];
    for (let i = 0; i < MAX_ROUNDS && player.hp > 0 && boss.hp > 0; i++) {
      const r = { round: i + 1, playerHp: player.hp, bossHp: boss.hp, events: [] };

      const pDmg = calcDamage(player, boss);
      boss.hp = Math.max(0, boss.hp - pDmg.dmg);
      r.events.push({ type: 'player_attack', dmg: pDmg.dmg, crit: pDmg.crit });
      r.bossHp = boss.hp;

      if (boss.hp <= 0) {
        r.playerHp = player.hp;
        rounds.push(r);
        break;
      }

      const bDmg = calcDamage(boss, player);
      player.hp = Math.max(0, player.hp - bDmg.dmg);
      r.events.push({ type: 'boss_attack', dmg: bDmg.dmg, crit: bDmg.crit });
      r.playerHp = player.hp;

      rounds.push(r);
    }

    const won = boss.hp <= 0;
    return { won, rounds, playerFinalHp: player.hp, bossFinalHp: boss.hp };
  }

  grantRewards(jid, difficulty) {
    const config = DIFFICULTY[difficulty];
    if (!config) throw new Error('Difficulty tidak valid.');

    const coinReward = randInt(config.coin[0], config.coin[1]);
    const expReward = randInt(config.exp[0], config.exp[1]);

    const artifacts = [];
    if (Math.random() < config.artifactChance) {
      const first = artifactService.generateArtifact(jid);
      artifacts.push(first);

      if (config.secondArtifactChance && Math.random() < config.secondArtifactChance) {
        const second = artifactService.generateArtifact(jid);
        artifacts.push(second);
      }
    }

    walletModel.reward(jid, coinReward, `domain ${difficulty}`);
    userModel.addExp(jid, expReward);

    return { coin: coinReward, exp: expReward, artifacts };
  }

  formatRoundPlayer(jid, round, config) {
    const pStats = artifactService.getPlayerStats(jid);
    return [
      '╭─── ୨୧ ───╮',
      `│ 🏰 DOMAIN • ${config.name.toUpperCase()}`,
      '│',
      `│ ⚔️ Round ${round.round}`,
      '│',
      `│ 👤 Player`,
      `│ ❤️ ${bar(round.playerHp, pStats.hp)} ${round.playerHp}/${pStats.hp}`,
      '│',
      `│ 👹 ${config.boss.name}`,
      `│ ❤️ ${bar(round.bossHp, config.boss.hp)} ${round.bossHp}/${config.boss.hp}`,
      '╰──────────╯',
    ].join('\n');
  }

  formatVictory(config, rewards, rounds) {
    const lines = [
      '╭─── ୨୧ ───╮',
      '│ 🏰 DOMAIN CLEAR',
      '│',
      `│ 👹 ${config.boss.name} defeated!`,
      `│ ⚔️ ${rounds} round${rounds > 1 ? 's' : ''}`,
      '│',
      '│ 🎁 Rewards',
      `│ • 🪙 +${rewards.coin} Coin`,
      `│ • ⭐ +${rewards.exp} EXP`,
    ];

    for (const art of rewards.artifacts) {
      lines.push(`│ • 🧿 Artifact #${art.user_id}`);
    }

    lines.push('╰──────────╯');
    return lines.join('\n');
  }

  formatDefeat(config, rounds) {
    return [
      '╭─── ୨୧ ───╮',
      '│ 🏰 DOMAIN FAILED',
      '│',
      '│ 💀 You were defeated.',
      `│ ⚔️ Survived ${rounds} round${rounds > 1 ? 's' : ''}`,
      '│',
      '│ Tidak ada reward.',
      '╰──────────╯',
    ].join('\n');
  }
}

export const domainService = new DomainService();
