import { F } from '#helpers/index.js';
import { dailyService } from '#features/economy/services/daily-service.js';

export default {
  name: 'daily',
  aliases: ['claim', 'harian'],
  category: 'economy',
  description: 'Klaim reward harian (reset jam 00:00 WIB)',
  cooldown: 0,

  async execute(ctx) {
    try {
      const result = await dailyService.claimDaily(ctx.sender, {
        pushName: ctx.pushName,
      });
      if (result.status === 'already') {
        await ctx.reply(
          [
            '🎁 *DAILY REWARD*',
            '',
            '❌ Kamu sudah mengambil Daily Reward hari ini.',
            '',
            `🔥 Current Streak: *${result.streak} days*`,
            '',
            'Coba lagi besok.',
          ].join('\n')
        );
        return;
      }
      await ctx.reply(
        [
          '🎁 *DAILY REWARD*',
          '',
          `🪙 +${F.formatNumber(result.coin)} Coin`,
          `🔥 Streak: *${result.streak} days*`,
          '',
          'Daily reward berhasil diklaim!',
        ].join('\n')
      );
    } catch (err) {
      await ctx.fail(err.message);
    }
  },
};
