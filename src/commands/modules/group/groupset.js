import { groupModel } from '#storage/models/index.js'
import SETTINGS from '#environment/settings.js'

export default {
  name: 'groupset',
  aliases: ['gset', 'grpset'],
  category: 'group',
  description: 'Atur pengaturan grup (antilink, mute, dll)',
  cooldown: 5_000, groupOnly: true, adminOnly: true, bypassMute: true,

  async execute(ctx) {
    const sub = ctx.args[0]?.toLowerCase()
    const value = ctx.args[1]?.toLowerCase()
    const targetJid = ctx.args.find(a => a.includes('@g.us'))
    const jid = ctx.isGroup ? ctx.jid : targetJid

    if (!ctx.isGroup && !jid) {
      return ctx.reply(`Kamu di chat pribadi. Sertakan ID grup:\n\`${SETTINGS.prefix}groupset <sub> <on/off> <id grup>@g.us\``)
    }

    if (!sub || !['antilink', 'mute', 'nsfw', 'antitoxic', 'greeting'].includes(sub) || !['on', 'off'].includes(value)) {
      const g = groupModel.find(jid)
      return ctx.reply(`*Pengaturan Grup*\n\n📎 Antilink: ${g?.antilink ? '✅' : '❌'}\n🔇 Mute: ${g?.mute ? '✅' : '❌'}\n🔞 NSFW: ${g?.nsfw ? '✅' : '❌'}\n🚫 Antitoxic: ${g?.antitoxic ? '✅' : '❌'}\n🌅 Greeting: ${g?.greeting ? '✅' : '❌'}\n\nUsage: \`${SETTINGS.prefix}groupset <antilink/mute/nsfw/antitoxic/greeting> <on/off>\`${ctx.isGroup ? '' : ' <id grup>@g.us'}`)
    }

    const updates = {}
    updates[sub] = value === 'on' ? 1 : 0
    groupModel.update(jid, updates)
    await ctx.reply(`✅ *${sub}* ${value === 'on' ? 'diaktifkan' : 'dinonaktifkan'}${!ctx.isGroup ? ` untuk \`${jid}\`` : ''}.`)
  },
}
