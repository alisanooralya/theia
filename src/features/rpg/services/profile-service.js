import { expRequiredForLevel } from '../config/stats-config.js';
import { finalStatService as defaultFinalStats } from './final-stat-service.js';
import { cardService as defaultCardService } from './card-service.js';

function skillLine(icon, skill) {
  if (!skill.unlocked)
    return `${icon} ${skill.name}: 🔒 Lv.${skill.unlockLevel}`;
  if (skill.upgraded) return `${icon} ${skill.name}: ✅ Upgraded`;
  return `${icon} ${skill.name}: ⚡ Unlocked`;
}

export function createProfileService({ finalStatsService, cardService } = {}) {
  const finals = finalStatsService ?? defaultFinalStats;
  const cards = cardService ?? defaultCardService;

  return {
    /** Read-only snapshot for rendering. Never writes. */
    async getProfileData(userId) {
      const [final, main, sign] = await Promise.all([
        finals.getFinalStats(userId),
        cards.getEquippedMainCard(userId),
        cards.getEquippedSignCard(userId),
      ]);
      return {
        userId,
        level: final.level,
        exp: final.exp,
        expNeeded: expRequiredForLevel(final.level),
        maxHp: final.maxHp,
        currentHp: final.currentHp,
        atk: final.atk,
        def: final.def,
        critRate: final.critRate,
        critDmg: final.critDmg,
        main: main
          ? {
              name: main.definition.name,
              level: main.level,
              active: {
                name: main.definition.active.name,
                unlocked: main.skills.active.unlocked,
                upgraded: main.skills.active.upgraded,
                unlockLevel: main.definition.active.unlockLevel,
              },
              passive: {
                name: main.definition.passive.name,
                unlocked: main.skills.passive.unlocked,
                upgraded: main.skills.passive.upgraded,
                unlockLevel: main.definition.passive.unlockLevel,
              },
            }
          : null,
        sign: sign
          ? {
              name: sign.definition.name,
              level: sign.level,
              atk: sign.stats.atk,
              def: sign.stats.def,
              passiveName: sign.definition.passive.name,
              compatible: sign.signCompatible,
              needsMainCard: sign.definition.compatibleCard,
            }
          : null,
      };
    },
  };
}

export const profileService = createProfileService();

function formatPercent(fraction) {
  return `${Number((fraction * 100).toFixed(2))}%`;
}

export function formatProfile(data) {
  const lines = [
    '👤 *RPG PROFILE*',
    '',
    `⭐ Level: *${data.level}*`,
    `✨ EXP: *${data.exp} / ${data.expNeeded}*`,
    '',
    `❤️ HP: *${data.currentHp} / ${data.maxHp}*${data.currentHp <= 0 ? ' 💀' : ''}`,
    `⚔️ ATK: *${data.atk}*`,
    `🛡️ DEF: *${data.def}*`,
    `🎯 Crit Rate: *${formatPercent(data.critRate)}*`,
    `💥 Crit DMG: *${data.critDmg}x*`,
    '',
    '🃏 *Main Card*',
    'Belum ada Main Card',
    '',
    '🔰 *Sign Card*',
    'Belum ada Main Card',
  ];

  if (data.main) {
    const liness = ['👤 *RPG PROFILE*', '', '🃏 *Main Card*'];

    liness.push(
      `*${data.main.name}* - Lv.${data.main.level}`,
      skillLine('⚡ Active', data.main.active),
      skillLine('✨ Passive', data.main.passive)
    );

    liness.push('', '🔰 *Sign Card*');
    if (data.sign) {
      liness.push(
        `*${data.sign.name}* - Lv.${data.sign.level}`,
        `⚔️ ATK +${data.sign.atk}  🛡️ DEF +${data.sign.def}`,
        '',
        data.sign.compatible
          ? `✅ Passive: Active (${data.sign.passiveName})`
          : `⛔ Passive: Inactive (butuh ${data.sign.needsMainCard})`
      );
    } else {
      liness.push('Belum ada Main Card');
    }

    return liness.join('\n');
  }

  return lines.join('\n');
}
