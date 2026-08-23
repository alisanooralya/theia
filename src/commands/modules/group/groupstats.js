import { groupActivityModel } from '#storage/models/index.js'
import { F } from '#helpers/index.js'

export default {
  name: 'groupstats',
  aliases: ['gstats', 'grupstat'],
  category: 'group',
  description: 'Statistik aktivitas grup',
  groupOnly: true,
  cooldown: 5000,
  async execute(ctx) {
    const s = groupActivityModel.stats(ctx.jid)
    const top = groupActivityModel.top(ctx.jid, 1)[0]
    const topLine = top ? `Top: @${top.user_jid.split('@')[0]} (Lv.${top.level})` : 'Belum ada data'
    await ctx.reply(
      `*Statistik Grup*\n\n` +
      `Member aktif: ${F.formatNumber(s.members ?? 0)}\n` +
      `Total pesan: ${F.formatNumber(s.total ?? 0)}\n` +
      `Total XP: ${F.formatNumber(s.total_xp ?? 0)}\n` +
      `${topLine}`,
      top ? { mentions: [top.user_jid] } : undefined
    )
  },
}
