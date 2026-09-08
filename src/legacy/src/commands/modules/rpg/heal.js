import { statsModel, userModel, walletModel } from '#storage/models/index.js';
import { artifactService } from '#features/rpg/artifact.js';
import { F } from '#helpers/index.js';

/**
 * Hitung rencana heal dari Current HP menuju Final Max HP. Murni
 * (tanpa DB) supaya bisa dites langsung.
 *
 * - missing: HP yang hilang (0 kalau sudah penuh).
 * - fullPrice: harga full heal (100 coin per 100 HP, dibulatkan ke atas).
 * - healable: HP yang bisa dibayar dengan cash yang ada.
 * - cost: coin yang terpakai. newHp: HP akhir (tidak melebihi maxHp).
 */
export function calcHealPlan(hp, maxHp, cash) {
  const missing = Math.max(0, maxHp - hp);
  if (missing <= 0) {
    return { missing: 0, full: true, healable: 0, cost: 0, newHp: hp };
  }
  const fullPrice = Math.ceil(missing / 100) * 100;
  const coinsPerHp = fullPrice / missing;
  const healable = Math.min(missing, Math.floor(cash / coinsPerHp));
  const cost = Math.ceil(healable * coinsPerHp);
  const newHp = Math.min(maxHp, hp + healable);
  return { missing, full: false, fullPrice, healable, cost, newHp };
}

export default {
  name: 'heal',
  aliases: ['sembuh', 'recover'],
  category: 'rpg',
  description: 'Heal HP',
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
    const plan = calcHealPlan(hp, maxHp, wallet?.cash ?? 0);
    if (plan.full) {
      return ctx.fail('❤️ HP kamu sudah penuh.');
    }

    if (plan.healable <= 0) {
      return ctx.fail(
        `❌ Cash tidak cukup untuk heal. Butuh 🪙${F.formatNumber(plan.fullPrice)} untuk HP penuh.`
      );
    }

    const cost = plan.cost;
    await walletModel.addCash(ctx.sender, -cost);

    const newHp = plan.newHp;
    await statsModel.setHp(ctx.sender, newHp);

    if (newHp >= maxHp) {
      await ctx.reply(
        `❤️ *Heal berhasil!* (-🪙${F.formatNumber(cost)})\nHP penuh: ${newHp}/${maxHp}`
      );
    } else {
      await ctx.reply(
        `❤️ *Heal berhasil!* (-🪙${F.formatNumber(cost)})\nHP: ${newHp}/${maxHp}\n💡 Kamu belum full HP. Coba lagi jika punya cukup coin (butuh 🪙${F.formatNumber(plan.fullPrice - cost)} lagi).`
      );
    }
  },
};
