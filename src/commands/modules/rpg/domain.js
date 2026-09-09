import { F } from '#helpers/index.js';
import { getDomain, getDomains } from '#features/rpg/config/domain-config.js';
import {
  domainService,
  makeDomainKey,
} from '#features/rpg/services/domain-service.js';

export const DOMAIN_USAGE = '🏰 *RPG DOMAIN*\n\nChoose Difficulty:';

export function formatDomainList() {
  const lines = [DOMAIN_USAGE, ''];
  for (const domain of getDomains()) {
    lines.push(
      `${domain.emoji} *${domain.name}* — \`.domain ${domain.id}\``,
      `${domain.description}`,
      `Reward: EXP ${domain.rewards.exp.min}–${domain.rewards.exp.max} / ` +
        `Coin ${F.formatNumber(domain.rewards.coin.min)}–${F.formatNumber(domain.rewards.coin.max)} / ` +
        `Cerelia ${domain.rewards.cerelia.min}–${domain.rewards.cerelia.max}`,
      ''
    );
  }
  return lines.join('\n');
}

export function formatDomainResult(outcome) {
  if (outcome.status === 'WIN') {
    const lines = [
      '🏆 *DOMAIN CLEAR!*',
      '',
      `👹 ${outcome.bossName} defeated.`,
      '',
      '🎁 *Rewards:*',
      `• EXP +${F.formatNumber(outcome.rewards.exp)}`,
      `• Coin +${F.formatNumber(outcome.rewards.coin)}`,
      `• Cerelia ×${outcome.rewards.cerelia}`,
    ];
    if (outcome.leveledUp) lines.push('', '⭐ *Level Up!*');
    if (outcome.duplicate) lines.push('', '_(cached result)_');
    return lines.join('\n');
  }
  if (outcome.status === 'LOSE') {
    return [
      '💀 *DOMAIN FAILED*',
      '',
      `${outcome.bossName} defeated you.`,
      '',
      'No rewards received.',
    ].join('\n');
  }
  return [
    '🤝 *DOMAIN DRAW*',
    '',
    `${outcome.bossName} stands its ground.`,
    '',
    'No rewards received.',
  ].join('\n');
}

export async function executeDomain(ctx) {
  const [difficulty] = (ctx.args ?? []).map((a) => a.toLowerCase());
  try {
    if (!difficulty) {
      await ctx.reply(formatDomainList());
      return;
    }
    const domain = getDomain(difficulty);
    if (!domain) {
      await ctx.fail(
        `Unknown difficulty: ${difficulty}. Choose: easy, medium, hard.`
      );
      return;
    }

    const msg = await ctx.reply(
      `🏰 *DOMAIN — ${domain.name.toUpperCase()}*\n\n👹 Boss: *${domain.boss.name}*\n❤️ HP: *${domain.boss.stats.maxHp}*\n\n⚔️ Battle started...`
    );
    const outcome = await domainService.runDomain(ctx.sender, domain.id, {
      requestKey: makeDomainKey(ctx.sender, domain.id),
    });

    await ctx.sock.sendMessage(ctx.jid, {
      text: formatDomainResult(outcome),
      edit: msg.key,
    });
  } catch (err) {
    await ctx.fail(err.message);
  }
}

export default {
  name: 'domain',
  aliases: ['dungeon', 'dg'],
  category: 'rpg',
  description: 'Lawan boss Domain (.domain easy/medium/hard)',
  cooldown: 60 * 60 * 1_000,

  async execute(ctx) {
    await executeDomain(ctx);
  },
};
