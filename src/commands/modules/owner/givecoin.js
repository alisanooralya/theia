import { F } from '#helpers/index.js';
import { phoneToJid } from '#helpers/identifier.js';
import { rpgPlayerModel } from '#features/rpg/models/rpg-player.model.js';
import { rpgCoinModel } from '#features/rpg/models/rpg-coin.model.js';

/**
 * Owner-only debug command for testing the RPG economy.
 * `.givecoin <jumlah> [@user|nomor]` — target defaults to sender.
 */
export default {
  name: 'givecoin',
  aliases: ['addcoin'],
  category: 'owner',
  description: '[Owner] Beri Coin RPG untuk testing',
  cooldown: 0,
  ownerOnly: true,

  async execute(ctx) {
    try {
      const amount = Number(ctx.args[0]);
      if (!Number.isInteger(amount) || amount < 1) {
        await ctx.reply('Usage: `.givecoin <jumlah> [@user]`');
        return;
      }
      const target =
        ctx.mentions[0] ??
        (ctx.args[1] ? phoneToJid(ctx.args[1]) : null) ??
        ctx.sender;
      await rpgPlayerModel.ensure(target);
      await rpgCoinModel.ensure(target);
      await rpgCoinModel.addCoin(target, amount);
      const balance = await rpgCoinModel.getBalance(target);
      await ctx.reply(
        `✅ +${F.formatNumber(amount)} Coin → @${target.split('@')[0]}\n💰 Saldo: ${F.formatNumber(balance)} Coin`,
        { mentions: [target] }
      );
    } catch (err) {
      await ctx.reply(`Gagal: ${err.message}`);
    }
  },
};
