import { walletModel } from '#storage/models/index.js'
import { F } from '#helpers/index.js'

export default {
  name: 'coinflip',
  aliases: ['cf', 'flip', 'toss'],
  category: 'economy',
  description: 'Main tebak koin',
  cooldown: 5_000,

  async execute(ctx) {
    const side = ctx.args[0]?.toLowerCase()
    const bet = parseInt(ctx.args[1]) || 0

    if (!side || !['heads', 'tails', 'kepala', 'ekor'].includes(side)) ctx.fail('Usage: `!coinflip <heads/tails> <bet>`')
    if (bet < 100) return ctx.reply('Minimal taruhan: 🪙100')

    const wallet = walletModel.find(ctx.sender)
    if (!wallet || wallet.cash < bet) return ctx.reply('Saldo cash tidak cukup.')

    walletModel.addCash(ctx.sender, -bet)

    const result = Math.random() < 0.5 ? 'kepala' : 'ekor'
    const userChoice = { heads: 'kepala', tails: 'ekor', kepala: 'kepala', ekor: 'ekor' }[side]
    const won = result === userChoice

    if (won) {
      const multiplier = 1.6 + Math.random() * 0.6
      const prize = Math.floor(bet * multiplier)
      walletModel.addCash(ctx.sender, bet + prize)
      await ctx.reply(`🪙 *COINFLIP*\n\nHasil: *${result.toUpperCase()}*\n\n✨ *WIN!* Kamu dapat *${F.formatNumber(prize)}* (${(multiplier * 100).toFixed(0)}%)!`)
    } else {
      await ctx.reply(`🪙 *COINFLIP*\n\nHasil: *${result.toUpperCase()}*\n\n😔 *Kalah* — ${F.formatNumber(bet)} hangus.`)
    }
  },
}
