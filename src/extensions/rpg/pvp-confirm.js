import { buildContext } from '#messages/context.js';
import { pvpService } from '#features/rpg/services/pvp-service.js';
import { runPvpBattle } from '#commands/modules/rpg/pvp.js';
import SETTINGS from '#environment/settings.js';
import { logger } from '#helpers/logger.js';

export default {
  name: 'pvp-confirm',

  async processMessage(parsed, sock) {
    const quotedId = parsed.quoted?.key?.id;
    if (!quotedId) return true;

    const text = (parsed.text ?? '').trim();
    const normalized = text.startsWith(SETTINGS.prefix)
      ? text.slice(SETTINGS.prefix.length).trim().toLowerCase()
      : text.toLowerCase();

    const isYes = normalized === 'yes' || normalized === 'ya';
    const isNo = normalized === 'no' || normalized === 'tidak';
    if (!isYes && !isNo) return true;

    let session;
    try {
      session = await pvpService.findPendingByConfirmMsg(quotedId);
    } catch (err) {
      logger.warn({ err }, '[PvP] confirm lookup failed');
      return true;
    }
    if (!session) return true;
    if (parsed.sender !== session.target) return true;

    if (isNo) {
      await pvpService.cancel(session.id);
      const ctx = buildContext(parsed, sock);
      await ctx
        .send(
          `⚔️ *PvP ditolak*\n\n@${session.target.split('@')[0]} menolak tantangan @${session.challenger.split('@')[0]}.`,
          { mentions: [session.challenger, session.target] }
        )
        .catch((err) => logger.warn({ err }, '[PvP] decline notice failed'));
      return false;
    }

    const accepted = await pvpService.acceptBySession(session.id);
    if (!accepted) return false;

    const ctx = buildContext(parsed, sock);
    await runPvpBattle(ctx, accepted);
    return false;
  },
};
