import { walletModel } from '#storage/models/index.js';
import { F } from '#helpers/index.js';

function growthLine(interest) {
  if (!interest?.applied) return '';
  const extra = interest.capped ? ' _(dipotong limit)_' : '';
  return `\n🌱 Bunga bank *${interest.days} hari*: +${F.formatNumber(interest.interest)}${extra}`;
}

function depositFee(amount) {
  const fee = Math.floor(amount * 0.05);
  const net = amount - fee;
  return `\n💸 Biaya admin 5%: *${F.formatNumber(fee)}*\n🏦 Masuk bank: *${F.formatNumber(net)}*`;
}

export default {
  name: 'bank',
  aliases: ['deposit', 'withdraw', 'tabung', 'ambil'],
  category: 'economy',
  description: 'Deposit atau withdraw uang dari bank (bunga 0.8%/hari, deposit kena admin 5%)',
  cooldown: 5_000,

  async execute(ctx) {
    const sub = ctx.args[0]?.toLowerCase();
    const amount = parseInt(ctx.args[1]) || 0;
    const isDeposit = sub === 'deposit' || sub === 'tabung';
    const isWithdraw = sub === 'withdraw' || sub === 'ambil';

    if (!amount || amount <= 0)
      ctx.fail('Usage: `!bank deposit/withdraw <amount>`');
    if (!isDeposit && !isWithdraw)
      ctx.fail(
        '❌ Usage: `!bank deposit <amount>` atau `!bank withdraw <amount>`'
      );

    try {
      const interest = await walletModel.accrueBankInterest(ctx.sender);

      if (isDeposit) {
        await walletModel.deposit(ctx.sender, amount);
        const wallet = await walletModel.find(ctx.sender);
        await ctx.reply(
          `✅ Deposit *${F.formatNumber(amount)}* ke bank berhasil!\n🏦 Bank: *${F.formatNumber(wallet.bank)}* / ${F.formatNumber(wallet.bank_limit)}${depositFee(amount)}${growthLine(interest)}`
        );
      } else {
        await walletModel.withdraw(ctx.sender, amount);
        await ctx.reply(
          `✅ Withdraw *${F.formatNumber(amount)}* dari bank berhasil!${growthLine(interest)}`
        );
      }
    } catch (err) {
      return ctx.fail(`❌ ${err.message}`);
    }
  },
};
