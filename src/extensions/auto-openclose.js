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
  if (!wantClosed) return;
  const sock = getSocket();
  if (!sock) return;
  try {
    const text = '🌙 *Grup Ditutup*\n\nSelamat malam semuanya! Semoga istirahatmu nyenyak dan besok siap melanjutkan petualangan. Selamat tidur! 😴✨';
    await sock.sendMessage(jid, { text });
  } catch {
    // ignore
  }
}

async function applyState(jid, wantClosed) {
  const sock = getSocket();
  if (!sock) return false;
  try {
    const meta = await sock.groupMetadata(jid);
    const isClosed = !!meta.announce;
    if (wantClosed === isClosed) return true;
    await sock.groupSettingUpdate(
      jid,
      wantClosed ? 'announcement' : 'not_announcement'
    );
    await sendAnnouncement(jid, wantClosed);
    return true;
  } catch (err) {
    logger.warn({ err: err.message, jid }, '[AutoOpenClose] update failed');
    return false;
  }
}

async function runForGroups(wantClosed) {
  const sock = getSocket();
  if (!sock) return false;
  try {
    const groups = await sql`SELECT jid FROM groups WHERE openclose = 1`;
    let allOk = true;
    for (const { jid } of groups) {
      const ok = await applyState(jid, wantClosed);
      if (!ok) allOk = false;
    }
    return allOk;
  } catch (err) {
    logger.warn({ err: err.message }, '[AutoOpenClose] runForGroups failed');
    return false;
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
          if (lastCloseKey === dayKey) return;
          const ok = await runForGroups(true);
          if (ok) {
            lastCloseKey = dayKey;
          }
        } else if (minutes >= OPEN_MIN) {
          if (lastOpenKey === dayKey) return;
          const ok = await runForGroups(false);
          if (ok) {
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