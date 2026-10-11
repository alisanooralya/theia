import SETTINGS from '#environment/settings.js';
import { isGroupAdmin } from '#helpers/admin-check.js';

const REPLY = {
  group: 'Bot hanya merespons di dalam grup.',
  private: 'Bot hanya merespons di chat pribadi.',
};

export async function checkRespondScope(ctx) {
  const mode = SETTINGS.respondScope;
  if (mode !== 'group' && mode !== 'private') return true;

  const match = mode === 'group' ? ctx.isGroup : !ctx.isGroup;
  if (match) return true;

  if (ctx.isOwner()) return true;
  if (ctx.isGroup && (await isGroupAdmin(ctx))) return true;

  await ctx.reply(REPLY[mode]);
  return false;
}
