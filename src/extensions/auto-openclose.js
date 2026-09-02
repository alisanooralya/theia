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
  if (!sock) return;
  try {
    const meta = await sock.groupMetadata(jid);
    const mentions = meta.participants.map((p) => p.id);
    if (!mentions.length) return;
    const text = wantClosed
      ? '🌙 *Grup Ditutup* 🚪\n\nSelamat malam semuanya! Grup sedang ditutup otomatis sampai besok pagi. Semoga istirahatmu nyenyak dan besok siap melanjutkan petualangan. Selamat tidur! 😴✨'
      : '☀️ *Grup Dibuka* 🔓\n\nSelamat pagi semuanya! Grup telah dibuka kembali. Selamat beraktivitas dan lanjutkan petualanganmu hari ini! 🎉⚔️';
    await sock.sendMessage(jid, { text, mentions }).catch(() => {});
  } catch (err) {
    logger.warn({ err: err.message, jid }, '[AutoOpenClose] announcement failed');
  }
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
    logger.info({ jid, wantClosed }, '[AutoOpenClose] group updated');
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
            // Only mark as done after the operation succeeds, so a transient
            // failure (socket reconnect, DB error) is retried on next tick.
            lastCloseKey = dayKey;
            logger.info({ dayKey }, '[AutoOpenClose] groups closed');
          }
        } else if (minutes >= OPEN_MIN) {
          if (lastOpenKey !== dayKey) {
            await runForGroups(false);
            lastOpenKey = dayKey;
            logger.info({ dayKey }, '[AutoOpenClose] groups opened');
          }
        }
      } catch (err) {
        logger.warn({ err: err.message }, '[AutoOpenClose] tick failed');
      } finally {
        running = false;
      }
    }, TICK_MS);
    logger.info('[AutoOpenClose] Initialized — close 23:00, open 05:00 WIB');
  },

  destroy() {
    if (timer) clearInterval(timer);
    timer = null;
    lastCloseKey = null;
    lastOpenKey = null;
    running = false;
  },
};
