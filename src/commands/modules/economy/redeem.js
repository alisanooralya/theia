import { userModel, redeemCodeModel } from '#storage/models/index.js';
import { F } from '#helpers/index.js';

export default {
  name: 'redeem',
  aliases: ['tukar', 'redeemcodeclaim'],
  category: 'economy',
  description: 'Tukar redeem code menjadi cash',
  cooldown: 3000,

  async execute(ctx) {
    const code = ctx.args[0]?.trim().toUpperCase();
    if (!code) return ctx.fail('Usage: `!redeem <kode>`');

    await userModel.ensure(ctx.sender, { pushName: ctx.pushName });
    try {
      const reward = await redeemCodeModel.redeem(code, ctx.sender);
      await ctx.reply(
        `✅ Redeem berhasil! Kamu mendapatkan ${F.formatNumber(reward.amount)} cash.`
      );
    } catch (err) {
      await ctx.reply(`❌ ${err.message}`);
    }
  },
};
