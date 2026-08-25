import { robService } from '#features/combat/rob.js';
import { userModel } from '#storage/models/index.js';
import { F } from '#helpers/index.js';
import { phoneToJid } from '#helpers/identifier.js';
import { isOwnerJid } from '#helpers/owner.js';

export default {
  name: 'rob',
  aliases: ['rampok', 'mencuri'],
  category: 'rpg',
  description: 'Rampok cash user lain',
  cooldown: 24 * 60 * 60 * 1000,

  async execute(ctx) {
    const targetJid =
      ctx.mentions[0] ??
      (ctx.quoted?.sender && !ctx.quoted.sender.endsWith('@g.us')
        ? ctx.quoted.sender
        : null) ??
      (ctx.args[0] ? phoneToJid(ctx.args[0]) : null);
    if (!targetJid)
      ctx.fail('Usage: `.rob @tag`, reply pesan target, atau `.rob <nomor>`');
    if (targetJid === ctx.sender)
      ctx.fail('❌ Tidak bisa merampok diri sendiri.');
    if (isOwnerJid(targetJid)) {
      await ctx.reply('Serius mau rampok owner? makan tuh cooldown yahaha!');
      return;
    }

    userModel.ensure(ctx.sender, { pushName: ctx.pushName });
    const target = userModel.findById(targetJid);
    if (!target) ctx.fail('❌ User belum terdaftar.');

    try {
      await ctx.typing();
      const result = robService.attempt(ctx.sender, targetJid);
      if (result.success) {
        await ctx.reply(
          `✅ *Berhasil merampok!*\n🪙 +${F.formatNumber(result.stolen)}\n🎯 Chance: ${result.chance}%`
        );
      } else {
        await ctx.reply(
          `❌ *Gagal!* Kamu ketangkap!\n💸 Denda: 🪙${F.formatNumber(result.penalty)}`
        );
      }
    } catch (err) {
      await ctx.reply(`❌ ${err.message}`);
    }
  },
};
