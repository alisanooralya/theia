import { isGroupAdmin } from '#helpers/admin-check.js';

export async function checkAdmin(ctx, command) {
  if (!command.adminOnly) return true;

  if (!ctx.isGroup) {
    if (ctx.isOwner() && command.allowPrivateAdmin) return true;
    await ctx.reply('Command ini hanya bisa dipakai di grup.');
    return false;
  }

  if (ctx.isOwner()) return true;

  const isAdmin = await isGroupAdmin(ctx);
  if (isAdmin === null) {
    await ctx.reply('Gagal memeriksa status admin.');
    return false;
  }
  if (isAdmin) return true;

  await ctx.reply('Command ini khusus admin grup.');
  return false;
}
