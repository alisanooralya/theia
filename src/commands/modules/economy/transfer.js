import { F } from '#helpers/index.js';
import { phoneToJid } from '#helpers/identifier.js';
import { transferService } from '#features/economy/services/transfer-service.js';

const USAGE = 'Usage: `.transfer @tag <jumlah>`';

function resolveTarget(ctx) {
  return (
    ctx.mentions?.[0] ??
    (ctx.quoted?.sender && !ctx.quoted.sender.endsWith('@g.us')
      ? ctx.quoted.sender
      : null) ??
    (ctx.args?.[0] && ctx.args[0].includes('@')
      ? phoneToJid(ctx.args[0])
      : null)
  );
}

export default {
  name: 'transfer',
  aliases: ['tf', 'kirim'],
  category: 'economy',
  description: 'Kirim Coin ke user lain (tanpa fee)',
  cooldown: 10_000,

  async execute(ctx) {
    try {
      const target = resolveTarget(ctx);
      if (!target) ctx.fail(USAGE);
      if (target === ctx.sender)
        ctx.fail('❌ Tidak bisa transfer ke diri sendiri.');

      const rawAmount = ctx.args.find((a) => /^\d+$/.test(a));
      const result = await transferService.transfer(
        ctx.sender,
        target,
        rawAmount,
        {
          pushName: ctx.pushName,
        }
      );
      await ctx.reply(
        [
          `✅ Transfer *${F.formatNumber(result.amount)}* ke @${target.split('@')[0]} berhasil!`,
          `💰 Sisa Coin kamu: *${F.formatNumber(result.senderCoin)}*`,
        ].join('\n'),
        { mentions: [target] }
      );
    } catch (err) {
      await ctx.fail(err.message);
    }
  },
};
