import { userModel } from '#storage/models/index.js';
import { phoneToJid } from '#helpers/identifier.js';
import { formatRemaining } from '#features/economy/config/crime-config.js';

function resolveTarget(ctx) {
  return (
    ctx.mentions?.[0] ??
    (ctx.quoted?.sender && !ctx.quoted.sender.endsWith('@g.us')
      ? ctx.quoted.sender
      : null) ??
    (ctx.args?.[0] ? phoneToJid(ctx.args[0]) : null)
  );
}

export default {
  name: 'bebas',
  aliases: ['free', 'unjail', 'bebaskan'],
  category: 'owner',
  description: 'Bebaskan user dari penjara',
  cooldown: 0,
  ownerOnly: true,

  async execute(ctx) {
    const targetJid = resolveTarget(ctx);
    if (!targetJid)
      ctx.fail('Usage: `.bebas @tag` atau reply chat target lalu `.bebas`');

    await userModel.ensure(targetJid);

    const nowSec = Math.floor(Date.now() / 1000);
    const until = await userModel.getPrisonUntil(targetJid);
    const remaining = Math.max(0, until - nowSec);

    if (remaining <= 0) {
      return ctx.reply(
        `✅ @${targetJid.split('@')[0]} tidak sedang dipenjara.`,
        { mentions: [targetJid] }
      );
    }

    const sisa = formatRemaining(remaining);
    await userModel.setPrisonUntil(targetJid, 0);

    await ctx.reply(
      `🔓 @${targetJid.split('@')[0]} berhasil dibebaskan dari penjara!\n\n⏱️ Sisa hukuman yang dihapus: ${sisa}`,
      { mentions: [targetJid] }
    );
  },
};
