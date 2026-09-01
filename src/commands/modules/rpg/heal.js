import { statsModel, userModel, walletModel } from '#storage/models/index.js';
import { artifactService } from '#features/rpg/artifact.js';
import { F } from '#helpers/index.js';

export default {
  name: 'heal',
  aliases: ['sembuh', 'recover'],
  category: 'rpg',
  description: 'Heal HP (semakin banyak bayar, semakin banyak HP)',
  cooldown: 6 * 60 * 60 * 1000,

  async execute(ctx) {
    await Promise.all([
      userModel.ensure(ctx.sender, { pushName: ctx.pushName }),
      statsModel.ensure(ctx.sender),
    ]);

    const [stats, pStats, wallet] = await Promise.all([
      statsModel.find(ctx.sender),
      artifactService.getPlayerStats(ctx.sender),
      walletModel.find(ctx.sender),
    ]);
    const hp = stats?.hp ?? 0;
    const maxHp = pStats.hp;
    const missing = Math.max(0, maxHp - hp);
    if (missing <= 0) {
      return ctx.fail('❤️ HP kamu sudah penuh.');
    }

    const fullPrice = Math.ceil(missing / 100) * 100;
    const coinsPerHp = fullPrice / missing;

    const cash = wallet?.cash ?? 0;
    const healable = Math.min(missing, Math.floor(cash / coinsPerHp));
    if (healable <= 0) {
      return ctx.fail(
        `❌ Cash tidak cukup untuk heal. Butuh 🪙${F.formatNumber(fullPrice)} untuk HP penuh.`
      );
    }

    const cost = Math.ceil(healable * coinsPerHp);
    await walletModel.addCash(ctx.sender, -cost);

    const newHp = Math.min(maxHp, hp + healable);
    await statsModel.setHp(ctx.sender, newHp);

    if (newHp >= maxHp) {
      await ctx.reply(
        `❤️ *Heal berhasil!* (-🪙${F.formatNumber(cost)})\nHP penuh: ${newHp}/${maxHp}`
      );
    } else {
      await ctx.reply(
        `❤️ *Heal berhasil!* (-🪙${F.formatNumber(cost)})\nHP: ${newHp}/${maxHp}\n💡 Kamu belum full HP. Coba lagi jika punya cukup cash (butuh 🪙${F.formatNumber(fullPrice - cost)} lagi).`
      );
    }
  },
};
