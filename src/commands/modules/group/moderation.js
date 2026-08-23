function normalizeJid(j = '') { return j.replace(/:\d+(?=@)/, '') }

function getTargets(ctx) {
  const targets = new Set()
  for (const m of ctx.mentions ?? []) targets.add(normalizeJid(m))
  if (ctx.quoted?.sender && !ctx.quoted.sender.endsWith('@g.us')) targets.add(normalizeJid(ctx.quoted.sender))
  return targets.size ? [...targets] : null
}

function usageReply(ctx, cmd, example) {
  ctx.fail(`Usage: \`${cmd} @tag\` atau reply pesan target lalu ketik \`${cmd}\`${example ? `\nContoh: \`${example}\`` : ''}`)
}

export const kickCommand = {
  name: 'kick',
  aliases: ['keluarkan', 'remove'],
  category: 'group',
  description: 'Kick member dari grup',
  cooldown: 5_000, groupOnly: true, adminOnly: true, requireBotAdmin: true,

  async execute(ctx) {
    const targets = getTargets(ctx)
    if (!targets) return usageReply(ctx, 'kick')
    for (const jid of targets) {
      if (jid === ctx.sender) ctx.fail('❌ Tidak bisa kick diri sendiri.')
      try { await ctx.sock.groupParticipantsUpdate(ctx.jid, [jid], 'remove') } catch (err) { ctx.fail(`❌ ${err.message}`) }
    }
    const names = targets.map(j => `@${j.split('@')[0]}`).join(', ')
    await ctx.reply(`✅ ${names} berhasil di-kick.`, { mentions: targets })
  },
}

export const promoteCommand = {
  name: 'promote',
  aliases: ['jadiadmin', 'promot'],
  category: 'group',
  description: 'Jadikan member sebagai admin',
  cooldown: 5_000, groupOnly: true, adminOnly: true, requireBotAdmin: true,

  async execute(ctx) {
    const targets = getTargets(ctx)
    if (!targets) return usageReply(ctx, 'promote')
    try {
      await ctx.sock.groupParticipantsUpdate(ctx.jid, targets, 'promote')
      const names = targets.map(j => `@${j.split('@')[0]}`).join(', ')
      await ctx.reply(`✅ ${names} sekarang jadi admin!`, { mentions: targets })
    } catch (err) { await ctx.reply(`❌ ${err.message}`) }
  },
}

export const demoteCommand = {
  name: 'demote',
  aliases: ['cabutadmin', 'turunkan'],
  category: 'group',
  description: 'Cabut status admin member',
  cooldown: 5_000, groupOnly: true, adminOnly: true, requireBotAdmin: true,

  async execute(ctx) {
    const targets = getTargets(ctx)
    if (!targets) return usageReply(ctx, 'demote')
    try {
      await ctx.sock.groupParticipantsUpdate(ctx.jid, targets, 'demote')
      const names = targets.map(j => `@${j.split('@')[0]}`).join(', ')
      await ctx.reply(`✅ Admin ${names} dicabut.`, { mentions: targets })
    } catch (err) { await ctx.reply(`❌ ${err.message}`) }
  },
}
