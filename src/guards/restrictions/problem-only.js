export async function checkProblem(ctx, command) {
  if (!command.isProblem) return true;
  if (ctx.isOwner()) return true;
  await ctx.reply('⚠️ Fitur ini sedang dalam perbaikan, coba lagi nanti.');
  return false;
}
