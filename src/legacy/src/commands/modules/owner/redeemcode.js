import { redeemCodeModel } from '#storage/models/index.js';
import { F } from '#helpers/index.js';

export default {
  name: 'redeemcode',
  aliases: ['buatkode', 'createcode'],
  category: 'owner',
  description: 'Buat redeem code untuk user',
  cooldown: 0,
  ownerOnly: true,

  async execute(ctx) {
    const code = ctx.args[0]?.trim().toUpperCase();
    const amount = Number(ctx.args[1]);
    const durationMs = Number(ctx.args[2]);

    if (!code || !Number.isSafeInteger(amount) || amount <= 0)
      ctx.fail('Usage: `!redeemcode <kode> <coin> <expired_ms>`');
    if (!Number.isSafeInteger(durationMs) || durationMs <= 0)
      ctx.fail('Expired harus berupa angka milidetik lebih dari 0.');

    try {
      const redeemCode = await redeemCodeModel.create(
        code,
        amount,
        Date.now() + durationMs
      );
      await ctx.reply(
        `✅ Redeem code \`${redeemCode.code}\` dibuat dengan hadiah ${F.formatNumber(amount)} coin.\n`
      );
    } catch (err) {
      ctx.fail(err.message);
    }
  },
};
