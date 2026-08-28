import { redeemCodeModel } from '#storage/models/index.js';
import { broadcastService } from '#features/broadcast.js';
import { getOwnerPhoneJids } from '#helpers/owner.js';
import { F } from '#helpers/index.js';

export default {
  name: 'redeemcode',
  aliases: ['buatkode', 'createcode'],
  category: 'owner',
  description: 'Buat redeem code untuk user',
  cooldown: 0,
  ownerOnly: true,

  async execute(ctx) {
    const code = ctx.args[0]?.trim().toUpperCase();
    const amount = Number(ctx.args[1]);
    const durationMs = Number(ctx.args[2]);

    if (!code || !Number.isSafeInteger(amount) || amount <= 0)
      ctx.fail('Usage: `!redeemcode <kode> <cash> <expired_ms>`');
    if (!Number.isSafeInteger(durationMs) || durationMs <= 0)
      ctx.fail('Expired harus berupa angka milidetik lebih dari 0.');

    try {
      const redeemCode = redeemCodeModel.create(
        code,
        amount,
        Date.now() + durationMs
      );
      const message =
        `🎁 *Redeem Code Tersedia!*\n\n` +
        `Hubungi owner untuk mendapatkan kode redeem.\n` +
        `⏳ Berlaku selama ${durationMs} ms.`;
      const result = await broadcastService.toAllGroups(ctx.sock, {
        text: `${message}\n👤 Owner: @6287760363490`,
        mentions: ['6287760363490@s.whatsapp.net'],
      });
      await ctx.reply(
        `✅ Redeem code \`${redeemCode.code}\` dibuat dengan hadiah ${F.formatNumber(amount)} cash.\n` +
          `📡 Notifikasi grup: ${result.sent} terkirim, ${result.failed} gagal.`
      );
    } catch (err) {
      if (err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY')
        return ctx.reply('❌ Kode tersebut sudah ada. Gunakan kode lain.');
      await ctx.reply(`❌ Gagal membuat redeem code: ${err.message}`);
    }
  },
};
