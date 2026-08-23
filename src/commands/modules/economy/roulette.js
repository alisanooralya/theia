import { walletModel } from '#storage/models/index.js'
import { F } from '#helpers/index.js'

const COLORS = {
  red: '🔴',
  orange: '🟠',
  yellow: '🟡',
  green: '🟢',
  blue: '🔵',
  purple: '🟣',
}
const WIN_MULT = 5

export default {
  name: 'roulette',
  aliases: ['roul', 'roda'],
  category: 'economy',
  description: 'Main roulette — tebak warna',
  cooldown: 60_000,

  async execute(ctx) {
    const color = ctx.args[0]?.toLowerCase()
    const bet = parseInt(ctx.args[1]) || 0
    const list = Object.keys(COLORS).join('/')

    if (!color || !COLORS[color]) ctx.fail(`Usage: \`!roulette <${list}> <bet>\``)
    if (bet < 100) return ctx.reply('Minimal taruhan: 🪙100')

    const wallet = walletModel.find(ctx.sender)
    if (!wallet || wallet.cash < bet) return ctx.reply('Saldo cash tidak cukup.')

    walletModel.addCash(ctx.sender, -bet)

    const keys = Object.keys(COLORS)
    const resultKey = keys[Math.floor(Math.random() * keys.length)]
    const result = COLORS[resultKey]
    const won = color === resultKey

    let msg = `🎡 *ROULETTE*\n\nHasil: ${result}\n`
    if (won) {
      const win = bet * WIN_MULT
      walletModel.addCash(ctx.sender, win)
      msg += `✨ *WIN!* Kamu dapat *${F.formatNumber(win)}* (x${WIN_MULT})!`
    } else {
      msg += `😔 *Kalah* — ${F.formatNumber(bet)} hangus.`
    }

    await ctx.reply(msg)
  },
}
