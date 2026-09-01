import { walletModel } from '#storage/models/index.js';
import { F } from '#helpers/index.js';

export default {
  name: 'bank',
  aliases: ['deposit', 'withdraw', 'tabung', 'ambil'],
  category: 'economy',
  description: 'Deposit atau withdraw uang dari bank',
  cooldown: 5_000,

  async execute(ctx) {
    const sub = ctx.args[0]?.toLowerCase();
    const amount = parseInt(ctx.args[1]) || 0;
    if (!amount || amount <= 0)
      ctx.fail('Usage: `!bank deposit/withdraw <amount>`');

    try {
      if (sub === 'deposit' || sub === 'tabung') {
        await walletModel.deposit(ctx.sender, amount);
        const wallet = await walletModel.find(ctx.sender);
        await ctx.reply(
          `✅ Deposit *${F.formatNumber(amount)}* ke bank berhasil!\n🏦 Bank: *${F.formatNumber(wallet.bank)}* / ${F.formatNumber(wallet.bank_limit)}`
        );
      } else if (sub === 'withdraw' || sub === 'ambil') {
        await walletModel.withdraw(ctx.sender, amount);
        await ctx.reply(
          `✅ Withdraw *${F.formatNumber(amount)}* dari bank berhasil!`
        );
      } else {
        ctx.fail(
          'Usage: `!bank deposit <amount>` atau `!bank withdraw <amount>`'
        );
      }
    } catch (err) {
      return ctx.fail(`❌ ${err.message}`);
    }
  },
};
