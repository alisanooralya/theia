import { sql } from '#storage/connection.js';
import { getSocket } from '#helpers/shutdown.js';
import { logger } from '#helpers/logger.js';

const WIB_OFFSET = 7;
const TICK_MS = 30_000;
const CLOSE_MIN = 23 * 60;
const OPEN_MIN = 5 * 60;
let timer = null;
let lastCloseKey = null;
let lastOpenKey = null;
let running = false;

function wibMinutes() {
  const now = new Date();
  const wib = new Date(now.getTime() + WIB_OFFSET * 3_600_000);
  const dayKey = wib.toISOString().slice(0, 10);
  const minutes = wib.getUTCHours() * 60 + wib.getUTCMinutes();
  return { minutes, dayKey };
}

async function sendAnnouncement(jid, wantClosed) {
  const sock = getSocket();
  if (!sock || !wantClosed) return;

  const text = '🌙 *Grup Ditutup*\n\nSelamat malam semuanya! Semoga istirahatmu nyenyak dan besok siap melanjutkan petualangan. Selamat tidur! 😴✨'
  await sock.sendMessage(jid, { text });
}

async function applyState(jid, wantClosed) {
  const sock = getSocket();
  if (!sock) return;
  try {
    const meta = await sock.groupMetadata(jid);
    const isClosed = !!meta.announce;
    if (wantClosed === isClosed) return;
    await sock.groupSettingUpdate(
      jid,
      wantClosed ? 'announcement' : 'not_announcement'
    );
    await sendAnnouncement(jid, wantClosed);
  } catch (err) {
    logger.warn({ err: err.message, jid }, '[AutoOpenClose] update failed');
  }
}

async function runForGroups(wantClosed) {
  const sock = getSocket();
  if (!sock) return;
  const groups = await sql`SELECT jid FROM groups WHERE openclose = 1`;
  for (const { jid } of groups) {
    await applyState(jid, wantClosed);
  }
}

export default {
  name: 'auto-openclose',

  init() {
    timer = setInterval(async () => {
      if (running) return;
      running = true;
      try {
        const { minutes, dayKey } = wibMinutes();
        if (minutes >= CLOSE_MIN) {
          if (lastCloseKey !== dayKey) {
            await runForGroups(true);
            lastCloseKey = dayKey;
          }
        } else if (minutes >= OPEN_MIN) {
          if (lastOpenKey !== dayKey) {
            await runForGroups(false);
            lastOpenKey = dayKey;
          }
        }
      } catch (err) {
        logger.warn({ err: err.message }, '[AutoOpenClose] tick failed');
      } finally {
        running = false;
      }
    }, TICK_MS);
  },

  destroy() {
    if (timer) clearInterval(timer);
    timer = null;
    lastCloseKey = null;
    lastOpenKey = null;
    running = false;
  },
};
