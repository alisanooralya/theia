import { jidNormalizedUser } from 'baileys';

const norm = (j) => {
  try {
    return jidNormalizedUser(String(j));
  } catch {
    return String(j);
  }
};

export async function checkAdmin(ctx, command) {
  if (!command.adminOnly) return true;

  if (!ctx.isGroup) {
    await ctx.reply('Command ini hanya bisa dipakai di grup.');
    return false;
  }

  if (ctx.isOwner()) return true;

  try {
    const meta = await ctx.sock.groupMetadata(ctx.jid);
    const admins = meta.participants
      .filter((p) => p.admin === 'admin' || p.admin === 'superadmin')
      .flatMap((p) => [p.id, p.jid, p.phoneNumber].filter(Boolean))
      .map(norm);

    const candidates = [
      ctx.sender,
      ctx.msg?.senderAlt,
      ctx.msg?.senderLid,
      ctx.raw?.participant,
    ]
      .filter(Boolean)
      .map(norm);

    if (candidates.some((c) => admins.includes(c))) return true;

    await ctx.reply('Command ini khusus admin grup.');
    return false;
  } catch {
    await ctx.reply('Gagal memeriksa status admin.');
    return false;
  }
}
