/**
 * Economy 2.0 — Work config. Single source of truth for Work balancing.
 *
 * Migrated from legacy (`features/economy/work.js`): same six jobs, same
 * durations, same coin/exp ranges. Cooldown lives on the command
 * (`manualCooldown`, applied at claim like legacy).
 */
import SETTINGS from '#environment/settings.js';

export const WORK_COOLDOWN_MS = 6 * 60 * 60 * 1000;

export const MINUTE_MS = 60 * 1000;
export const HOUR_MS = 60 * MINUTE_MS;

export const JOBS = [
  {
    id: 'ojol',
    name: 'ojol',
    label: 'Ojol',
    emoji: '🛵',
    durationMs: 30 * MINUTE_MS,
    coin: [18000, 25000],
    exp: [18, 25],
  },
  {
    id: 'kuli',
    name: 'kuli bangunan',
    label: 'Kuli Bangunan',
    emoji: '🧱',
    durationMs: 45 * MINUTE_MS,
    coin: [28000, 38000],
    exp: [25, 35],
  },
  {
    id: 'kebun',
    name: 'tukang kebun',
    label: 'Tukang Kebun',
    emoji: '🌱',
    durationMs: 1 * HOUR_MS,
    coin: [35000, 50000],
    exp: [30, 45],
  },
  {
    id: 'programmer',
    name: 'programmer freelance',
    label: 'Programmer Freelance',
    emoji: '💻',
    durationMs: 1 * HOUR_MS,
    coin: [85000, 120000],
    exp: [60, 85],
  },
  {
    id: 'guru',
    name: 'guru les',
    label: 'Guru Les',
    emoji: '📚',
    durationMs: 2 * HOUR_MS,
    coin: [100000, 140000],
    exp: [90, 120],
  },
  {
    id: 'chef',
    name: 'chef',
    label: 'Chef',
    emoji: '👨‍🍳',
    durationMs: 3 * HOUR_MS,
    coin: [130000, 180000],
    exp: [120, 160],
  },
];

export const JOB_MAP = Object.fromEntries(JOBS.map((j) => [j.id, j]));

export function getJob(id) {
  if (!id) return null;
  return JOB_MAP[String(id).toLowerCase()] ?? null;
}

export function durationLabel(job) {
  const minutes = Math.round(job.durationMs / MINUTE_MS);
  if (minutes % 60 === 0) return `${minutes / 60} jam`;
  return `${minutes} menit`;
}

function compactCoin(value) {
  return value >= 1000 ? `${value / 1000}k` : String(value);
}

export function coinRange(job) {
  return `🪙 ${compactCoin(job.coin[0])}-${compactCoin(job.coin[1])} Coin`;
}

export function expRange(job) {
  return `⭐ ${job.exp[0]}-${job.exp[1]} EXP`;
}

export function estimateLine(job) {
  return `${coinRange(job)} • ${expRange(job)}`;
}

export function jobLine(job) {
  return `⏱️ ${durationLabel(job)} • ${estimateLine(job)}`;
}

const clockFormat = new Intl.DateTimeFormat('id-ID', {
  timeZone: SETTINGS.timezone,
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatClock(ms) {
  return clockFormat.format(new Date(ms));
}
