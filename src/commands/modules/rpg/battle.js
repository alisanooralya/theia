import { battleService } from '#features/combat/battle.js'
import { registerPendingBattle, BATTLE_CONFIRM_TTL } from '#features/combat/battle-pending.js'
import { userModel, statsModel } from '#storage/models/index.js'
import { F } from '#helpers/index.js'
import { phoneToJid } from '#helpers/identifier.js'

export async function runBattle(ctx, challenger, target) {
  const aStats = statsModel.ensure(challenger)
  const dStats = statsModel.ensure(target)
  if (aStats.hp <= 0) return ctx.reply('❤️ HP kamu 0! Pakai `!heal` dulu.')
  if (dStats.hp <= 0) return ctx.reply('❤️ HP lawan sedang 0, tunggu dia heal dulu.')

  try {
    await ctx.react('⚔️')
    const result = battleService.fight(challenger, target)
    const roundLines = result.rounds.slice(0, 3).map(r => {
      const evts = r.events.map(e => {
        if (e.type === 'dodge') return `  💨 @${e.by.split('@')[0]} dodge!`
        const icon = e.type === 'crit' ? '💥' : '⚔️'
        return `  ${icon} @${e.by.split('@')[0]} hit *${F.formatNumber(e.dmg)}*${e.type === 'crit' ? ' CRIT!' : ''}`
      }).join('\n')
      return `*Ronde ${r.round}*\n${evts}\n  ❤️ ${r.aHp} vs ${r.dHp}`
    }).join('\n\n')

    const text = [
      `⚔️ *BATTLE RESULT!*`,
      '',
      roundLines,
      result.rounds.length > 3 ? `\n  _...${result.rounds.length - 3} ronde lagi..._` : '',
      '',
      `🏆 *Menang: @${result.winner.split('@')[0]}*`,
      `💀 Kalah : @${result.loser.split('@')[0]}`,
      '',
      `🎁 Reward pemenang:`,
      `  🪙 +${F.formatNumber(result.reward.cash)}`,
      `  ⭐ +${result.reward.exp} EXP`,
      `💸 @${result.loser.split('@')[0]} kehilangan 🪙${F.formatNumber(result.reward.loserLoss)}`,
    ].join('\n')

    await ctx.reply(text, { mentions: [result.winner, result.loser] })
  } catch (err) {
    await ctx.reply(`❌ ${err.message}`)
  }
}

export default {
  name: 'battle',
  aliases: ['fight', 'lawan', 'duel'],
  category: 'rpg',
  description: 'Tantang user lain untuk battle',
  cooldown: 120_000,

  async execute(ctx) {
    const targetJid = ctx.mentions[0]
      ?? (ctx.quoted?.sender && !ctx.quoted.sender.endsWith('@g.us') ? ctx.quoted.sender : null)
      ?? (ctx.args[0] ? phoneToJid(ctx.args[0]) : null)
    if (!targetJid) ctx.fail('Usage: `.battle @tag`, reply pesan target, atau `.battle <nomor>`')
    if (targetJid === ctx.sender) ctx.fail('❌ Tidak bisa battle sama diri sendiri.')

    userModel.ensure(ctx.sender, { pushName: ctx.pushName })
    const target = userModel.findById(targetJid)
    if (!target) ctx.fail('❌ User tersebut belum terdaftar.')

    const aStats = statsModel.ensure(ctx.sender)
    const dStats = statsModel.ensure(targetJid)
    if (aStats.hp <= 0) return ctx.fail('❤️ HP kamu 0! Pakai `!heal` dulu.')
    if (dStats.hp <= 0) return ctx.fail('❤️ HP lawan sedang 0, tunggu dia heal dulu.')

    await ctx.react('⚔️')

    const confirmMsg = await ctx.reply(
      `⚔️ *Konfirmasi Battle*\n\n@${ctx.sender.split('@')[0]} menantang @${targetJid.split('@')[0]} untuk duel!\n\nBalas pesan ini dengan *yes* untuk menerima tantangan.`,
      { mentions: [ctx.sender, targetJid] }
    )

    registerPendingBattle(confirmMsg.key.id, {
      challenger: ctx.sender,
      target: targetJid,
      jid: ctx.jid,
      expires: Date.now() + BATTLE_CONFIRM_TTL,
    })

    return confirmMsg
  },
}
