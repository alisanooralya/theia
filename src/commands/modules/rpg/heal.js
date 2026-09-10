import { F } from '#helpers/index.js';
import { healService } from '#features/rpg/services/heal-service.js';
import { HEAL_CONFIG } from '#features/rpg/config/heal-config.js';

export default {
  name: 'heal',
  aliases: ['sembuh', 'recover'],
  category: 'rpg',
  description: 'Heal HP penuh (1 Coin per HP)',
  cooldown: 3 * 60 * 60 * 1000,

  async execute(ctx) {
    try {
      const result = await healService.heal(ctx.sender, {
        pushName: ctx.pushName,
      });
      await ctx.reply(
        [
          '❤️ *Heal berhasil!*',
          '',
          `💊 Pulih: ${result.healed} HP`,
          `🪙 Biaya: ${F.formatNumber(result.cost)} Coin (${HEAL_CONFIG.coinPerHp}/HP)`,
          `❤️ HP: ${result.currentHp}/${result.maxHp}`,
        ].join('\n')
      );
    } catch (err) {
      await ctx.fail(err.message);
    }
  },
};
