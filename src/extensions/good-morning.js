import { sql } from '#storage/connection.js';
import { getSocket } from '#helpers/shutdown.js';
import { logger } from '#helpers/logger.js';

const WIB_OFFSET = 7;
const TICK_MS = 30_000;
const GREET_MIN = 7 * 60;
const GREET_WINDOW = 60;
const STATE_KEY = 'good_morning_last_sent';
let timer = null;
let running = false;

function wibMinutes() {
  const now = new Date();
  const wib = new Date(now.getTime() + WIB_OFFSET * 3_600_000);
  const dayKey = wib.toISOString().slice(0, 10);
  const minutes = wib.getUTCHours() * 60 + wib.getUTCMinutes();
  return { minutes, dayKey };
}

async function loadLastSent() {
  try {
    const rows = await sql`SELECT value FROM bot_state WHERE key = ${STATE_KEY}`;
    return rows[0]?.value ?? null;
  } catch {
    return null;
  }
}

async function saveLastSent(dayKey) {
  await sql`
    INSERT INTO bot_state (key, value, updated_at)
    VALUES (${STATE_KEY}, ${dayKey}, (EXTRACT(epoch FROM NOW())::BIGINT))
    ON CONFLICT (key) DO UPDATE SET
      value = EXCLUDED.value,
      updated_at = (EXTRACT(epoch FROM NOW())::BIGINT)
  `;
}

async function sendGoodMorning() {
  const sock = getSocket();
  if (!sock) throw new Error('socket not ready');
  const groups = await sql`SELECT jid FROM groups WHERE greeting = 1`;
  for (const { jid } of groups) {
    try {
      const meta = await sock.groupMetadata(jid);
      const mentions = meta.participants.map((p) => p.id);
      if (!mentions.length) continue;
      const text =
        '🌅 *Selamat pagi semuanya!* Selamat melanjutkan petualangan hari ini, para traveler. Semoga sukses dan sehat selalu! ☀️';
      await sock.sendMessage(jid, { text, mentions }).catch(() => {});
    } catch (err) {
      logger.warn({ err: err.message, jid }, '[GoodMorning] group failed');
    }
  }
}

export default {
  name: 'good-morning',

  init() {
    timer = setInterval(async () => {
      if (running) return;
      running = true;
      try {
        const { minutes, dayKey } = wibMinutes();
        if (minutes < GREET_MIN || minutes >= GREET_MIN + GREET_WINDOW) {
          return;
        }
        const lastSent = await loadLastSent();
        if (lastSent === dayKey) {
          return;
        }
        await sendGoodMorning();
        await saveLastSent(dayKey);
        logger.info({ dayKey }, '[GoodMorning] sent greeting');
      } catch (err) {
        logger.warn({ err: err.message }, '[GoodMorning] tick failed');
      } finally {
        running = false;
      }
    }, TICK_MS);
    logger.info('[GoodMorning] Initialized — 07:00 WIB greeting');
  },

  destroy() {
    if (timer) clearInterval(timer);
    timer = null;
    running = false;
  },
};
