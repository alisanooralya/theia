import { getHealth, MAX_HEALTH } from '#commands/modules/group/warn.js'

function bar(health) {
  const filled = Math.round((health / MAX_HEALTH) * 10)
  return '❤️'.repeat(filled) + '🖤'.repeat(10 - filled)
}

export default {
  name: 'health',
  aliases: ['hp', 'warnstatus'],
  category: 'group',
  description: 'Cek health warn kamu di grup',
  cooldown: 3_000,

  async execute(ctx) {
    const target = ctx.mentions[0]
      ?? (ctx.quoted?.sender && !ctx.quoted.sender.endsWith('@g.us') ? ctx.quoted.sender : null)
      ?? ctx.sender
    const groupJid = ctx.isGroup ? ctx.jid : null

    const health = groupJid ? getHealth(target, groupJid) : MAX_HEALTH
    const who = target === ctx.sender ? 'Kamu' : `@${target.split('@')[0]}`

    await ctx.reply(
      `${who} memiliki health warn:\n${bar(health)}\n${health}/${MAX_HEALTH}` +
      (groupJid ? '' : '\n_Health hanya berlaku di dalam grup._'),
      { mentions: target === ctx.sender ? [] : [target] }
    )
  },
}
