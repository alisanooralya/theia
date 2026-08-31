import { statsModel, userModel, walletModel } from '#storage/models/index.js';
import { artifactService } from '#features/rpg/artifact.js';
import { F } from '#helpers/index.js';

export default {
  name: 'heal',
  aliases: ['sembuh', 'recover'],
  category: 'rpg',
  description: 'Heal HP kamu ke maksimum',
  cooldown: 12 * 60 * 60 * 1000,

  async execute(ctx) {
    await Promise.all([
      userModel.ensure(ctx.sender, { pushName: ctx.pushName }),
      statsModel.ensure(ctx.sender),
    ]);

    const [stats, pStats] = await Promise.all([
      statsModel.find(ctx.sender),
      artifactService.getPlayerStats(ctx.sender),
    ]);
    const hp = stats?.hp ?? 0;
    const maxHp = pStats.hp;
    const missing = Math.max(0, maxHp - hp);
    if (missing <= 0) {
      return ctx.fail('❤️ HP kamu sudah penuh.');
    }

    const price = Math.ceil(missing / 100) * 100;

    try {
      await walletModel.addCash(ctx.sender, -price);
    } catch {
      return ctx.fail(
        `❌ Cash tidak cukup untuk heal. Butuh 🪙${F.formatNumber(price)}.`
      );
    }

    await statsModel.setHp(ctx.sender, maxHp);
    const after = await statsModel.find(ctx.sender);
    await ctx.reply(
      `❤️ *Heal berhasil!* (-🪙${F.formatNumber(price)})\nHP penuh: ${after.hp}/${maxHp}`
    );
  },
};
