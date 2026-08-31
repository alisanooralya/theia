import { raidService as raid } from '#features/rpg/raid.js';
import { userModel } from '#storage/models/index.js';

export default {
  name: 'raidshop',
  aliases: ['raidershop', 'rs'],
  category: 'shop',
  description: 'Toko item Raid Coin',
  cooldown: 5_000,

  async execute(ctx) {
    try {
      await userModel.ensure(ctx.sender, { pushName: ctx.pushName });
      const raidCoin = await raid.getRaidCoin(ctx.sender);

      return ctx.reply([
        '╭──── 🏪 *RAID SHOP* ────╮',
        '│',
        `│ 💠 Raid Coin: *${raidCoin}*`,
        '│',
        '│ Shop saat ini kosong.',
        '│',
        '╰──────────────────────╯',
      ].join('\n'));
    } catch (error) {
      return ctx.fail(error.message);
    }
  },
};
