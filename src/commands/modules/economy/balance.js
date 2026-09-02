import { userModel, walletModel } from '#storage/models/index.js';
import { F } from '#helpers/index.js';

export default {
  name: 'balance',
  aliases: ['bal', 'saldo', 'dompet'],
  category: 'economy',
  description: 'Lihat saldo kamu',
  cooldown: 5_000,

  async execute(ctx) {
    const user = await userModel.ensure(ctx.sender, { pushName: ctx.pushName });
    const interest = await walletModel.accrueBankInterest(ctx.sender);
    const wallet = await walletModel.find(ctx.sender);
    const total = (wallet?.cash ?? 0) + (wallet?.bank ?? 0);

    const text = [
      `💰 *Dompet ${user.push_name || 'Kamu'}*`,
      '',
      `🪙 Cash  : *${F.formatNumber(wallet?.cash ?? 0)}*`,
      `🏦 Bank  : *${F.formatNumber(wallet?.bank ?? 0)}* / ${F.formatNumber(wallet?.bank_limit ?? 5_000_000)}`,
      `📊 Total : *${F.formatNumber(total)}*`,
      `⭐ Level : *${user.level}* (${F.formatNumber(user.exp)} / ${F.formatNumber(await userModel.expForLevel(user.level + 1))} EXP)`,
      `📈 Bunga : *${(walletModel.interestRate * 100).toFixed(1)}%* / hari (saldo bank)`,
    ];

    if (interest.applied) {
      text.push(
        '',
        `🌱 Pertumbuhan bank *${interest.days} hari*: +${F.formatNumber(interest.interest)}`
      );
      if (interest.capped) text.push('⚠️ Bunga terpotong karena limit bank.');
    }

    await ctx.reply(text.join('\n'));
  },
};
