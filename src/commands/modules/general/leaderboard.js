import { userModel, statsModel, walletModel } from '#storage/models/index.js';
import { F } from '#helpers/index.js';

const medal = (i) =>
  i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
const displayName = (u) => u.push_name || `@${u.jid.split('@')[0]}`;

export default {
  name: 'leaderboard',
  aliases: ['lb', 'ranking'],
  category: 'general',
  description: 'level, kekayaan, atau PvP',
  cooldown: 10_000,

  async execute(ctx) {
    const sub = ctx.args[0]?.toLowerCase();
    const limit = Math.min(parseInt(ctx.args[1]) || 10, 20);

    if (['kaya', 'rich', 'wealth'].includes(sub))
      return wealthBoard(ctx, limit);
    if (['pvp', 'battle'].includes(sub)) return pvpBoard(ctx, limit);
    return levelBoard(ctx, limit);
  },
};

async function levelBoard(ctx, limit) {
  const top = userModel.leaderboard(limit);
  if (!top.length) return ctx.reply('Belum ada data user.');
  let text = `⭐ *Leaderboard Level* (Top ${limit})\n\n`;
  top.forEach((u, i) => {
    text += `${medal(i)} *${displayName(u)}* — Level ${u.level} | 🪙${F.formatNumber(u.total_balance ?? 0)}\n`;
  });
  text += `\n_Kategori lain: \`lb kaya\` · \`lb pvp\`_`;
  await ctx.reply(text);
}

async function wealthBoard(ctx, limit) {
  const top = walletModel.leaderboard(limit);
  if (!top.length) return ctx.reply('Belum ada data kekayaan.');
  const lines = top.map(
    (r, i) =>
      `${medal(i)} ${r.push_name ? `*${r.push_name}*` : `@${r.jid.split('@')[0]}`} — 🪙${F.formatNumber(r.total)} (💵${F.formatNumber(r.cash)} + 🏦${F.formatNumber(r.bank)})`
  );
  await ctx.reply(
    `💰 *Leaderboard Kekayaan* (Top ${limit})\n\n${lines.join('\n')}`
  );
}

async function pvpBoard(ctx, limit) {
  const top = statsModel.topWins(limit);
  if (!top.length) return ctx.reply('Belum ada data PvP.');
  let text = `🏆 *Leaderboard PvP* (Top ${limit})\n\n`;
  top.forEach((u, i) => {
    const total = u.win + u.loss;
    const wr = total === 0 ? '0%' : `${Math.round((u.win / total) * 100)}%`;
    text += `${medal(i)} *${displayName(u)}* — ${u.win}W/${u.loss}L (${wr})\n`;
  });
  text += `\n_Kategori lain: \`lb kaya\` · \`lb level\`_`;
  await ctx.reply(text);
}
