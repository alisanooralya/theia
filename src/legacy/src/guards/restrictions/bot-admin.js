import { jidNormalizedUser } from 'baileys';

export async function checkBotAdmin(ctx, command) {
  if (!command.requireBotAdmin) return true;
  if (!ctx.isGroup) return true;

  try {
    const meta = await ctx.sock.groupMetadata(ctx.jid);
    const botJids = [ctx.sock.user?.id, ctx.sock.user?.lid]
      .filter(Boolean)
      .map((j) => jidNormalizedUser(j));

    const isBotAdmin = meta.participants.some(
      (p) =>
        (p.admin === 'admin' || p.admin === 'superadmin') &&
        botJids.includes(jidNormalizedUser(p.id))
    );

    if (isBotAdmin) return true;

    await ctx.reply(
      '⚠️ Jadikan bot sebagai *admin grup* terlebih dahulu untuk menggunakan command ini.'
    );
    return false;
  } catch {
    await ctx.reply('Gagal memeriksa status admin bot.');
    return false;
  }
}
