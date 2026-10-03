import { readFile, readdir, unlink } from 'fs/promises';
import path from 'path';
import { randomBytes } from 'crypto';
import ff from 'fluent-ffmpeg';
import { sql } from '#storage/connection.js';
import { getSocket } from '#helpers/shutdown.js';
import { logger } from '#helpers/logger.js';

const WIB_OFFSET = 7;
const TICK_MS = 30_000;
const CLOSE_MIN = 23 * 60;
const OPEN_MIN = 5 * 60;
const VOICES_DIR = path.join(process.cwd(), 'temp', 'voices');
const VOICES_TEXT = path.join(VOICES_DIR, 'text.txt');
const TEMP_DIR = path.join(process.cwd(), 'temp');
const DEFAULT_CLOSE_TEXT =
  '🌙 *Grup Ditutup*\n\nSelamat malam semuanya! Semoga istirahatmu nyenyak dan besok siap melanjutkan petualangan. Selamat tidur! 😴✨';
let timer = null;
let lastCloseKey = null;
let lastOpenKey = null;
let running = false;
let voiceCache = null;
const audioCache = new Map();

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
    const pick = await pickRandomVoice();
    if (!pick) {
      await sock.sendMessage(jid, { text: DEFAULT_CLOSE_TEXT });
      return;
    }
    const audio = await loadVoiceAudio(pick.voiceFile);
    const text = '🌙 *Grup Ditutup*\n\n' + pick.text;
    await sock.sendMessage(jid, { text: pick.text });
    await sock.sendMessage(jid, {
      audio,
      mimetype: 'audio/ogg; codecs=opus',
      ptt: true,
    });
  } catch (err) {
    logger.warn({ err: err.message, jid }, '[AutoOpenClose] send failed');
  }
}

async function loadVoices() {
  if (voiceCache) return voiceCache;
  try {
    const raw = await readFile(VOICES_TEXT, 'utf8');
    const entries = [];
    for (const line of raw.split('\n')) {
      const match = line.match(/^([a-z0-9_-]+)\s*:\s*(.+)$/i);
      if (!match) continue;
      const name = match[1].trim().toLowerCase();
      const text = match[2].trim();
      if (!text) continue;
      entries.push({ name, text });
    }
    const files = await readdir(VOICES_DIR);
    const voices = [];
    for (const entry of entries) {
      const voiceFile = files.find((f) => {
        const lower = f.toLowerCase();
        if (!lower.endsWith('.ogg')) return false;
        return (
          lower === `${entry.name}.ogg` ||
          lower.startsWith(`${entry.name}_`) ||
          lower.startsWith(`${entry.name}.`)
        );
      });
      if (!voiceFile) continue;
      voices.push({ ...entry, voiceFile: path.join(VOICES_DIR, voiceFile) });
    }
    if (voices.length) voiceCache = voices;
    return voices;
  } catch (err) {
    logger.warn({ err: err.message }, '[AutoOpenClose] loadVoices failed');
    return [];
  }
}

async function pickRandomVoice() {
  const voices = await loadVoices();
  if (!voices.length) return null;
  return voices[Math.floor(Math.random() * voices.length)];
}

async function loadVoiceAudio(voiceFile) {
  const cached = audioCache.get(voiceFile);
  if (cached) return cached;
  const tmpOut = path.join(TEMP_DIR, `${randomBytes(6).toString('hex')}.ogg`);
  try {
    await new Promise((resolve, reject) => {
      ff(voiceFile)
        .on('error', reject)
        .on('end', resolve)
        .addOutputOptions([
          '-c:a',
          'libopus',
          '-b:a',
          '48k',
          '-ar',
          '48000',
          '-ac',
          '1',
        ])
        .toFormat('ogg')
        .save(tmpOut);
    });
    const buffer = await readFile(tmpOut);
    audioCache.set(voiceFile, buffer);
    return buffer;
  } catch (err) {
    logger.warn(
      { err: err.message, voiceFile },
      '[AutoOpenClose] convert failed'
    );
    return null;
  } finally {
    await unlink(tmpOut).catch(() => {});
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
    voiceCache = null;
    audioCache.clear();
  },
};
