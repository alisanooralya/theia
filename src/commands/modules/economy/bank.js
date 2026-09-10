import { F } from '#helpers/index.js';
import { bankService } from '#features/economy/services/bank-service.js';

const USAGE = 'Usage: `.bank` deposit <jumlah> atau `.bank` withdraw <jumlah>';

const isDeposit = (sub) => sub === 'deposit' || sub === 'tabung';
const isWithdraw = (sub) => sub === 'withdraw' || sub === 'ambil';

export default {
  name: 'bank',
  aliases: [],
  category: 'economy',
  description: 'Simpan Coin di bank (deposit/withdraw)',
  cooldown: 5_000,

  async execute(ctx) {
    try {
      const sub = ctx.args[0]?.toLowerCase();

      if (!sub) {
        const balance = await bankService.getBalance(ctx.sender, {
          pushName: ctx.pushName,
        });
        await ctx.reply(
          [
            '🏦 *BANK*',
            '',
            `🏦 Bank: ${F.formatNumber(balance.bank)}`,
            `🪙 Coin: ${F.formatNumber(balance.coin)}`,
          ].join('\n')
        );
        return;
      }

      if (!isDeposit(sub) && !isWithdraw(sub)) ctx.fail(`❌ ${USAGE}`);
      if (ctx.args[1] === undefined) ctx.fail(`❌ ${USAGE}`);

      const action = isDeposit(sub) ? 'deposit' : 'withdraw';
      const result = await bankService[action](ctx.sender, ctx.args[1], {
        pushName: ctx.pushName,
      });
      const verb = action === 'deposit' ? 'ke bank' : 'dari bank';
      await ctx.reply(
        [
          `✅ ${action === 'deposit' ? 'Deposit' : 'Withdraw'} *${F.formatNumber(result.amount)}* ${verb} berhasil!`,
          `🏦 Bank: *${F.formatNumber(result.bank)}*`,
          `🪙 Coin: *${F.formatNumber(result.coin)}*`,
        ].join('\n')
      );
    } catch (err) {
      await ctx.fail(err.message);
    }
  },
};
