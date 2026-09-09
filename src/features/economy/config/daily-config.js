/**
 * RPG 2.0 — Daily Economy config. Single source of truth for Daily rewards.
 *
 * Adapted from legacy (`commands/modules/economy/daily.js`): legacy paid
 * a flat 5,500–6,000 coin with NO streak bonus, so this config is flat
 * too — no invented streak tiers, freeze, or pity. Only the numbers were
 * retuned per spec.
 *
 * Streak rule (legacy `recordDaily`, preserved exactly):
 * - first claim -> streak 1
 * - gap since last claim < 48h -> streak + 1 (may skip a calendar day
 *   and still continue, e.g. Mon 23:00 -> Wed 01:00)
 * - gap >= 48h -> reset to 1
 * Same-day claims are rejected separately by WIB calendar-day key.
 */
export const DAILY_CONFIG = Object.freeze({
  coin: Object.freeze({ min: 10000, max: 20000 }),
});

export const WIB_OFFSET_HOURS = 7;
export const STREAK_CONTINUE_SEC = 48 * 3600;

/** Calendar-day key in WIB (UTC+7), e.g. '2026-09-09'. */
export function wibDayKey(tsSec) {
  return new Date(tsSec * 1000 + WIB_OFFSET_HOURS * 3600000).toISOString().slice(0, 10);
}

/** Next streak from stored state (pure legacy rule). */
export function computeStreak({ lastDaily = 0, dailyStreak = 0, nowSec }) {
  if (!lastDaily) return 1;
  return nowSec - lastDaily < STREAK_CONTINUE_SEC ? dailyStreak + 1 : 1;
}

/** Uniform integer coin roll within config range. */
export function rollDailyCoin(random = Math.random) {
  const { min, max } = DAILY_CONFIG.coin;
  return min + Math.floor(random() * (max - min + 1));
}
