export async function checkGroup(ctx, command) {
  if (!command.groupOnly) return true
  if (ctx.isGroup) return true
  if (ctx.isOwner()) return true
  await ctx.reply('Command ini hanya bisa dipakai di grup.')
  return false
}
