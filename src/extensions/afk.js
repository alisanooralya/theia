import { afkModel, userModel, walletModel, groupModel } from '#storage/models/index.js';
import { F } from '#helpers/index.js';
import SETTINGS from '#environment/settings.js';

const COIN_PER_HOUR = 100;
const HOUR_MS = 3_600_000;

export default {
  name: 'afk',

  async processMessage(parsed, sock) {
    if (!parsed.sender) return true;
    const jid = parsed.sender;
    const text = parsed.text || '';
    const prefix = SETTINGS.prefix || '.';
    const isAfkCmd =
      text === `${prefix}afk` || text.startsWith(`${prefix}afk `);
    const isMuted = parsed.isGroup && await groupModel.isMuted(parsed.jid);

    await userModel.ensure(jid, { pushName: parsed.pushName || '' });

    const existing = await afkModel.get(jid);

    if (existing && !isAfkCmd) {
      const durMs = Date.now() - existing.started_at * 1000;
      const hours = Math.floor(durMs / HOUR_MS);
      const coins = hours * COIN_PER_HOUR;
      if (coins > 0) await walletModel.reward(jid, coins, 'afk');
      await afkModel.remove(jid);
      await sock
        .sendMessage(
          parsed.jid,
          {
            text:
              `👋 @${jid.split('@')[0]} selamat datang kembali!\n` +
              `⏳ Kamu AFK selama *${F.formatDuration(durMs)}*` +
              (coins > 0 ? `\n🪙 AFK reward: +${coins} coin` : ''),
            mentions: [jid],
          }
        )
        .catch(() => {});
      return true;
    }

    if (isAfkCmd) {
      if (isMuted) return true;
      const reason = text.slice(`${prefix}afk`.length).trim();
      await afkModel.set(jid, reason);
      await sock
        .sendMessage(
          parsed.jid,
          {
            text:
              `📴 @${jid.split('@')[0]} sekarang AFK` +
              (reason ? `: ${reason}` : '') + `.`,
            mentions: [jid],
          }
        )
        .catch(() => {});
      return false;
    }

    if (parsed.mentions?.length && !isMuted) {
      for (const m of parsed.mentions) {
        if (m === jid) continue;
        const a = await afkModel.get(m);
        if (a) {
          const durMs = Date.now() - a.started_at * 1000;
          const name = (await userModel.findById(m))?.push_name || m.split('@')[0];
          await sock
            .sendMessage(parsed.jid, {
              text:
                `📴 @${name} sedang AFK` +
                (a.reason ? `: ${a.reason}` : '') +
                ` (sejak ${F.formatDuration(durMs)}).`,
            })
            .catch(() => {});
        }
      }
    }

    return true;
  },
};
