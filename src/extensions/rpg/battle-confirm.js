import { buildContext } from '#messages/context.js';
import { runBattle } from '#commands/modules/rpg/battle.js';
import {
  getPendingBattle,
  clearPendingBattle,
} from '#features/combat/battle-pending.js';
import SETTINGS from '#environment/settings.js';

export default {
  name: 'battle-confirm',

  async processMessage(parsed, sock) {
    const quotedId = parsed.quoted?.key?.id;
    if (!quotedId) return true;

    const pending = getPendingBattle(quotedId);
    if (!pending) return true;
    if (parsed.sender !== pending.target) return true;

    const text = (parsed.text ?? '').trim();
    const normalized = text.startsWith(SETTINGS.prefix)
      ? text.slice(SETTINGS.prefix.length).trim().toLowerCase()
      : text.toLowerCase();

    if (normalized !== 'yes' && normalized !== 'ya') return true;

    clearPendingBattle(quotedId);

    const ctx = buildContext(parsed, sock);
    await runBattle(ctx, pending.challenger, pending.target);
    return false;
  },
};
