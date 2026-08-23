import { statsModel, userModel, walletModel } from '#storage/models/index.js'
import { F } from '#helpers/index.js'

export default {
  name: 'heal',
  aliases: ['sembuh', 'recover'],
  category: 'rpg',
  description: 'Heal HP kamu ke maksimum',
  cooldown: 12 * 60 * 60 * 1000,

  async execute(ctx) {
    userModel.ensure(ctx.sender, { pushName: ctx.pushName })
    statsModel.ensure(ctx.sender)

    const stats = statsModel.find(ctx.sender)
    const hp = stats?.hp ?? 0

    let price
    if (hp < 20) price = 1000
    else if (hp > 60) price = 500
    else price = 750

    try {
      walletModel.addCash(ctx.sender, -price)
    } catch {
      return ctx.fail(`❌ Cash tidak cukup untuk heal. Butuh 🪙${F.formatNumber(price)}.`)
    }

    statsModel.fullHeal(ctx.sender)
    const after = statsModel.find(ctx.sender)
    await ctx.reply(`❤️ *Heal berhasil!* (-🪙${F.formatNumber(price)})\nHP penuh: ${after.hp}/${after.max_hp}`)
  },
}
