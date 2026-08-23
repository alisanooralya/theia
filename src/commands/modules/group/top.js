import { groupActivityModel, userModel } from '#storage/models/index.js'
import { F } from '#helpers/index.js'

export default {
  name: 'top',
  aliases: ['topgrup', 'grouptop'],
  category: 'group',
  description: 'Top XP grup',
  cooldown: 3000, groupOnly: true,

  async execute(ctx) {
    const top = groupActivityModel.top(ctx.jid, 10)
    if (!top.length) return ctx.reply('Belum ada data. Chat dulu biar masuk leaderboard!')

    let groupName = ''
    try {
      const meta = await ctx.sock.groupMetadata(ctx.jid)
      groupName = meta.subject
    } catch {}

    const lines = top.map((r, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`
      const name = userModel.findById(r.user_jid)?.push_name || `@${r.user_jid.split('@')[0]}`
      return `${medal} *${name}* — Level ${r.level} (${F.formatNumber(r.xp)} XP)`
    })
    await ctx.reply(`🏆 *Top 10 XP — ${groupName || 'Grup'}*\n\n${lines.join('\n')}`)
  },
}
