import { F } from '#helpers/index.js';
import { imperiumService } from '#features/rpg/services/imperium-service.js';

function diffLine(d) {
  const mark = d.cleared ? '✅' : d.unlocked ? '🔓' : '🔒';
  const state = d.cleared ? 'Clear' : d.unlocked ? 'Open' : 'Locked';
  return `${mark} Diff ${d.diff} — *${d.bossName}* (${state})`;
}

function statusView(s) {
  const lines = [
    '👑 *IMPERIUM*',
    `📅 Week: *${s.weekId}* • 🃏 Weekly: *${s.weeklyCard.name}* (${s.weeklyCard.role})`,
    `⭐ Level: *${s.level}* (min. ${s.minLevel})${s.canEnter ? '' : ' ⛔'}`,
    '',
    ...s.diffs.map(diffLine),
    '',
    'Mulai: `.imperium <1-5>` • Pilih: `.imperium pick <A/B/C>`',
  ];
  return lines.join('\n');
}

function fateView(start) {
  return [
    `👑 *IMPERIUM — DIFF ${start.diff}*`,
    `👹 Boss: *${start.bossName}*`,
    '',
    '🎭 *CHOOSE YOUR FATE*',
    '',
    'A. ❓ Unknown',
    'B. ❓ Unknown',
    'C. ❓ Unknown',
    '',
    'Pilih: `.imperium pick <A/B/C>`',
  ].join('\n');
}

function revealView(r) {
  const title = r.fate.kind === 'blessing' ? '✨ *BLESSING*' : '☠️ *CURSE*';
  const head = [title, `${r.fate.icon} *${r.fate.name}*`, r.fate.reveal, ''];
  if (!r.won) {
    return [
      ...head,
      `💀 Kalah di Diff *${r.diff}* vs *${r.bossName}*.`,
      `Sisa HP: ${F.formatNumber(Math.max(0, r.playerHp))}`,
      '',
      'Retry: `.imperium pick` tidak berlaku — mulai lagi `.imperium ' + r.diff + '`',
    ].join('\n');
  }
  return [
    ...head,
    `🏆 *DIFF ${r.diff} CLEAR!* ${r.bossName} tumbang.`,
    '',
    '🎁 Reward',
    `🪙 +${F.formatNumber(r.rewards.coin)} Coin`,
    `⭐ +${F.formatNumber(r.rewards.exp)} EXP`,
    `🧪 +${F.formatNumber(r.rewards.cerelia)} Cerelia`,
    ...(r.leveledUp ? ['', '⭐ *Level Up!*'] : []),
  ].join('\n');
}

export default {
  name: 'imperium',
  aliases: ['imp'],
  category: 'rpg',
  description: 'Weekly endgame challenge (5 Diff)',
  cooldown: 5_000,

  async execute(ctx) {
    const [subRaw, ...rest] = ctx.args ?? [];
    const sub = (subRaw ?? '').toLowerCase();
    try {
      if (!sub || sub === 'status') {
        if (rest.length) return ctx.fail('Pakai: `.imperium`, `.imperium <1-5>`, `.imperium pick <A/B/C>`');
        const s = await imperiumService.status(ctx.sender);
        return ctx.reply(statusView(s));
      }
      if (sub === 'pick') {
        const [slot] = rest;
        if (!slot || rest.length > 1) {
          return ctx.fail('Pakai: `.imperium pick <A/B/C>`');
        }
        const result = await imperiumService.pick(ctx.sender, slot);
        return ctx.reply(revealView(result));
      }
      if (/^[1-5]$/.test(sub) && rest.length === 0) {
        const start = await imperiumService.start(ctx.sender, Number(sub));
        return ctx.reply(fateView(start));
      }
      if (/^[abc]$/.test(sub) && rest.length === 0) {
        const result = await imperiumService.pick(ctx.sender, sub);
        return ctx.reply(revealView(result));
      }
      return ctx.fail('Pakai: `.imperium`, `.imperium <1-5>`, `.imperium pick <A/B/C>`');
    } catch (err) {
      await ctx.fail(err.message);
    }
  },
};
