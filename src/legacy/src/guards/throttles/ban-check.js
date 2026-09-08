import { userModel } from '#storage/models/index.js';

export async function checkBanned(ctx, _command) {
  if (ctx.isOwner()) return true;
  if (await userModel.isBanned(ctx.sender)) return false;
  return true;
}
