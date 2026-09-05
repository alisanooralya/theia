import { sql } from '#storage/connection.js';
import { meteorModel, walletModel, userModel } from '#storage/models/index.js';
import { F } from '#helpers/index.js';
import { logger } from '#helpers/logger.js';
import SETTINGS from '#environment/settings.js';

const CONFIG = Object.freeze({
  maxHp: 20_000,
  maxPointsPerDay: 3,
  damageMin: 80,
  damageMax: 150,
  critChance: 0.2,
  critMultiplier: 2,
  coinPerHp: 12,
  expPerHp: 0.15,
  minCoinReward: 500,
  minExpReward: 5,
});

const dayKeyFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: SETTINGS.timezone || 'Asia/Jakarta',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

class MeteorService {
  get config() {
    return CONFIG;
  }

  dayKey(date = new Date()) {
    return dayKeyFormat.format(date);
  }

  rollDamage() {
    const base = randInt(CONFIG.damageMin, CONFIG.damageMax);
    const crit = Math.random() < CONFIG.critChance;
    return {
      damage: crit ? base * CONFIG.critMultiplier : base,
      base,
      crit,
    };
  }

  async getState(jid) {
    const dayKey = this.dayKey();
    let meteor = await meteorModel.getActive();

    if (!meteor) {
      const today = await meteorModel.findByDayKey(dayKey);
      if (!today) {
        meteor = await meteorModel.create(dayKey, CONFIG.maxHp);
        if (meteor) {
          logger.info(
            { meteorId: meteor.id, dayKey, hp: meteor.hp },
            '[Meteor] new meteor created'
          );
        } else {
          meteor = await meteorModel.getActive();
        }
      }
    }

    const pointsUsed = await meteorModel.getPoints(jid, dayKey);
    const pointsLeft = Math.max(0, CONFIG.maxPointsPerDay - pointsUsed);

    if (!meteor) {
      return {
        meteor: null,
        miners: 0,
        contribution: null,
        pointsUsed,
        pointsLeft,
        dayKey,
        finishedToday: true,
      };
    }

    const [miners, contribution] = await Promise.all([
      meteorModel.countMiners(meteor.id),
      meteorModel.getContribution(meteor.id, jid),
    ]);

    return {
      meteor,
      miners,
      contribution,
      pointsUsed,
      pointsLeft,
      dayKey,
      finishedToday: false,
    };
  }

  async mine(jid) {
    const dayKey = this.dayKey();

    return sql.begin(async (t) => {
      const meteor = await meteorModel.lockActive(t);
      if (!meteor) {
        throw new Error(
          'Tidak ada Meteor aktif saat ini. Coba lagi nanti atau tunggu Meteor berikutnya.'
        );
      }
      if (meteor.hp <= 0) {
        throw new Error('Meteor ini sudah hancur.');
      }

      const used = await meteorModel.consumePoint(
        jid,
        dayKey,
        CONFIG.maxPointsPerDay,
        t
      );
      if (used === null) {
        throw new Error(
          `Mining Point kamu habis (0/${CONFIG.maxPointsPerDay}). Reset jam 00:00.`
        );
      }

      const roll = this.rollDamage();
      const applied = Math.min(roll.damage, meteor.hp);
      const newHp = meteor.hp - applied;

      const contribution = await meteorModel.addContribution(
        meteor.id,
        jid,
        applied,
        t
      );
      await meteorModel.setHp(meteor.id, newHp, t);

      const result = {
        meteor: { ...meteor, hp: newHp },
        damage: applied,
        rolled: roll.damage,
        crit: roll.crit,
        pointsUsed: used,
        pointsLeft: Math.max(0, CONFIG.maxPointsPerDay - used),
        contribution,
        cleared: false,
        nextToday: false,
        rewards: [],
        totalDamage: 0,
      };

      if (newHp > 0) return result;

      const closed = await meteorModel.markCleared(meteor.id, t);
      if (!closed) return result;

      const distribution = await this._distributeRewards(closed, t);
      logger.info(
        {
          meteorId: meteor.id,
          dayKey,
          miners: distribution.rewards.length,
          totalDamage: distribution.totalDamage,
        },
        '[Meteor] meteor cleared, rewards distributed'
      );

      return {
        ...result,
        cleared: true,
        nextToday: closed.day_key !== dayKey,
        ...distribution,
      };
    });
  }

  async _distributeRewards(meteor, client) {
    const meteorId = meteor.id;
    const contributions = await meteorModel.getContributions(meteorId, client);
    const totalDamage = contributions.reduce((sum, c) => sum + c.damage, 0);
    if (totalDamage <= 0) return { rewards: [], totalDamage: 0 };

    const coinPool = Math.floor(meteor.max_hp * CONFIG.coinPerHp);
    const expPool = Math.floor(meteor.max_hp * CONFIG.expPerHp);
    const rewards = [];

    for (const c of contributions) {
      const ratio = c.damage / totalDamage;
      const coin = Math.max(CONFIG.minCoinReward, Math.floor(coinPool * ratio));
      const exp = Math.max(CONFIG.minExpReward, Math.floor(expPool * ratio));

      await walletModel.reward(c.jid, coin, `meteor mine #${meteorId}`, client);
      const level = await userModel.addExp(c.jid, exp, client);
      await meteorModel.setReward(meteorId, c.jid, coin, exp, client);

      rewards.push({
        jid: c.jid,
        damage: c.damage,
        hits: c.hits,
        ratio,
        coin,
        exp,
        leveledUp: level?.leveledUp ?? false,
        newLevel: level?.newLevel ?? 0,
      });
    }

    return { rewards, totalDamage };
  }

  hpBar(hp, maxHp, width = 10) {
    const ratio = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
    const filled = Math.round(ratio * width);
    return `${'█'.repeat(filled)}${'░'.repeat(width - filled)}`;
  }

  formatStatus(state) {
    const { meteor, miners, contribution, pointsLeft } = state;

    const lines = [
      '',
      `HP: ${F.formatNumber(meteor.hp)} / ${F.formatNumber(meteor.max_hp)}`,
      `${this.hpBar(meteor.hp, meteor.max_hp)}`,
      `Penambang: ${miners}`,
      '',
      `🔋 Mining Point: ${pointsLeft}/${CONFIG.maxPointsPerDay}`,
    ];

    if (contribution?.damage > 0) {
      lines.push(
        `⛏️ Kontribusi kamu: ${F.formatNumber(contribution.damage)} damage (${contribution.hits}x)`
      );
    }

    return lines.join('\n');
  }

  formatMineResult(result) {
    const { meteor, damage, crit, pointsLeft, contribution } = result;

    return [
      crit ? '💥 *CRITICAL HIT!*' : '⛏️ *MINING!*',
      '',
      `Damage: *${F.formatNumber(damage)}*${crit ? ` (${CONFIG.critMultiplier}x)` : ''}`,
      `HP: ${F.formatNumber(meteor.hp)} / ${F.formatNumber(meteor.max_hp)}`,
      `${this.hpBar(meteor.hp, meteor.max_hp)}`,
      '',
      `⛏️ Kontribusi kamu: ${F.formatNumber(contribution?.damage ?? damage)} damage`,
      `🔋 Mining Point: ${pointsLeft}/${CONFIG.maxPointsPerDay}`,
    ].join('\n');
  }

  formatCleared(result, jid) {
    const { rewards, totalDamage, meteor } = result;
    const lines = [
      '🎉 *METEOR HANCUR!*',
      '',
      `Total damage: *${F.formatNumber(totalDamage)}*`,
      `Penambang: ${rewards.length}`,
      '',
      '*Reward dibagi berdasarkan kontribusi:*',
    ];

    for (const [index, r] of rewards.entries()) {
      const you = r.jid === jid ? ' ← kamu' : '';
      lines.push(
        `${index + 1}. @${r.jid.split('@')[0]} — ${F.formatNumber(r.damage)} dmg (${(r.ratio * 100).toFixed(1)}%)`,
        `    🪙 +${F.formatNumber(r.coin)} • ⭐ +${F.formatNumber(r.exp)}${you}`
      );
    }

    const me = rewards.find((r) => r.jid === jid);
    if (me?.leveledUp) {
      lines.push('', `🎉 *LEVEL UP!* Kamu sekarang level *${me.newLevel}*!`);
    }

    lines.push(
      '',
      result.nextToday &&
        `Meteor #${meteor.id} selesai. Meteor berikutnya besok.`
    );

    return { text: lines.join('\n'), mentions: rewards.map((r) => r.jid) };
  }
}

export const meteorService = new MeteorService();
