/**
 * RPG 2.0 — PvP confirm extension (migrated from legacy battle-confirm).
 *
 * Watches replies to a PvP confirm message: the challenged player
 * replies yes/ya to accept (atomic DB claim) or no/tidak to decline.
 * Only the challenge target can respond, and only while the session is
 * still pending — late/duplicate replies are ignored.
 */
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
      return false;
    }

    const accepted = await pvpService.acceptBySession(session.id);
    if (!accepted) return false;

    const ctx = buildContext(parsed, sock);
    await runPvpBattle(ctx, accepted);
    return false;
  },
};
