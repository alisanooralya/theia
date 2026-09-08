import { expRequiredForLevel } from '../config/stats-config.js';
import { finalStatService as defaultFinalStats } from './final-stat-service.js';
import { cardService as defaultCardService } from './card-service.js';

function formatCooldown(ms) {
  return `${Number((ms / 1000).toFixed(2))}s`;
}

/**
 * Skill block lines: name, status, config description, cooldown for
 * actives. Descriptions always show so players can preview locked skills.
 */
function skillLines(icon, label, skill, { cooldownMs = null } = {}) {
  const lines = [`${icon} ${label} ${skill.name}`];
  if (!skill.unlocked) {
    lines.push(`🔒 Unlocks at Lv.${skill.unlockLevel}`);
  } else {
    lines.push(`🟢 Unlocked${skill.upgraded ? ' (Upgraded)' : ''}`);
  }
  if (skill.description) lines.push(skill.description);
  if (cooldownMs !== null)
    lines.push(`⏱️ Cooldown: ${formatCooldown(cooldownMs)}`, '');
  return lines;
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
                description: main.definition.active.description,
                cooldownMs: main.definition.active.cooldownMs,
                unlocked: main.skills.active.unlocked,
                upgraded: main.skills.active.upgraded,
                unlockLevel: main.definition.active.unlockLevel,
              },
              passive: {
                name: main.definition.passive.name,
                description: main.definition.passive.description,
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
              passiveDescription: sign.definition.passive.description,
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
      '',
      ...skillLines('⚡', 'Active', data.main.active, {
        cooldownMs: data.main.active.cooldownMs,
      }),
      ...skillLines('✨', 'Passive', data.main.passive)
    );

    liness.push('', '🔰 *Sign Card*');
    if (data.sign) {
      liness.push(
        `*${data.sign.name}* - Lv.${data.sign.level}`,
        `⚔️ ATK +${data.sign.atk}  🛡️ DEF +${data.sign.def}`,
        '',
        data.sign.compatible
          ? `🟢 Passive: Active (${data.sign.passiveName})`
          : `🔴 Passive: Inactive (${data.sign.passiveName})`
      );
      if (data.sign.passiveDescription)
        liness.push(data.sign.passiveDescription);
      if (!data.sign.compatible) {
        liness.push(`Requires: ${data.sign.needsMainCard}`);
      }
    } else {
      liness.push('Belum ada Sign Card');
    }

    return liness.join('\n');
  }

  return lines.join('\n');
}
