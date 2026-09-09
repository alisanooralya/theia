import { F } from '#helpers/index.js';
import { phoneToJid } from '#helpers/identifier.js';
import { bankService } from '#features/economy/services/bank-service.js';

/** Target resolution mirrors group commands: mention > reply > phone > self. */
function resolveTarget(ctx) {
  return (
    ctx.mentions?.[0] ??
    (ctx.quoted?.sender && !ctx.quoted.sender.endsWith('@g.us')
      ? ctx.quoted.sender
      : null) ??
    (ctx.args?.[0] && ctx.args[0].includes('@')
      ? phoneToJid(ctx.args[0])
      : null) ??
    ctx.sender
  );
}

export default {
  name: 'balance',
  aliases: ['bal', 'saldo', 'dompet'],
  category: 'economy',
  description: 'Lihat saldo Coin dan Bank',
  cooldown: 5_000,

  async execute(ctx) {
    try {
      const target = resolveTarget(ctx);
      const balance = await bankService.getBalance(target, {
        pushName: ctx.pushName,
      });
      const tag = target === ctx.sender ? 'Kamu' : `@${target.split('@')[0]}`;
      await ctx.reply(
        [
          `💰 *Dompet ${tag}*`,
          '',
          `💰 Coin: ${F.formatNumber(balance.coin)}`,
          `🏦 Bank: ${F.formatNumber(balance.bank)}`,
          `💎 Total: ${F.formatNumber(balance.total)}`,
        ].join('\n'),
        target === ctx.sender ? {} : { mentions: [target] }
      );
    } catch (err) {
      await ctx.fail(err.message);
    }
  },
};
