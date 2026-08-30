import { db } from '#storage/connection.js';
import { getSocket } from '#helpers/shutdown.js';
import { logger } from '#helpers/logger.js';

const WIB_OFFSET = 7;
const TICK_MS = 30_000;
const GREET_MIN = 7 * 60;
const GREET_WINDOW = 60;
let timer = null;
let lastSentKey = null;

function wibMinutes() {
  const now = new Date();
  const wib = new Date(now.getTime() + WIB_OFFSET * 3_600_000);
  const dayKey = wib.toISOString().slice(0, 10);
  const minutes = wib.getUTCHours() * 60 + wib.getUTCMinutes();
  return { minutes, dayKey };
}

async function sendGoodMorning() {
  const sock = getSocket();
  if (!sock) return;
  const groups = db.prepare('SELECT jid FROM groups WHERE greeting = 1').all();
  for (const { jid } of groups) {
    try {
      const meta = await sock.groupMetadata(jid);
      const mentions = meta.participants.map((p) => p.id);
      if (!mentions.length) continue;
      const text = '🌅 *Selamat pagi semuanya!* Selamat melanjutkan petualangan hari ini, para traveler. Semoga sukses dan sehat selalu! ☀️';
      await sock.sendMessage(jid, { text, mentions }).catch(() => {});
    } catch (err) {
      logger.warn({ err: err.message, jid }, '[GoodMorning] group failed');
    }
  }
}

export default {
  name: 'good-morning',

  init() {
    timer = setInterval(() => {
      try {
        const { minutes, dayKey } = wibMinutes();
        if (minutes >= GREET_MIN && minutes < GREET_MIN + GREET_WINDOW && lastSentKey !== dayKey) {
          lastSentKey = dayKey;
          sendGoodMorning().catch((err) =>
            logger.warn({ err: err.message }, '[GoodMorning] failed')
          );
        }
      } catch (err) {
        logger.warn({ err: err.message }, '[GoodMorning] tick failed');
      }
    }, TICK_MS);
    logger.info('[GoodMorning] Initialized — 07:00 WIB greeting');
  },

  destroy() {
    if (timer) clearInterval(timer);
    timer = null;
    lastSentKey = null;
  },
};
