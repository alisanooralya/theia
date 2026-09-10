export const DAILY_CONFIG = Object.freeze({
  coin: Object.freeze({ min: 25_000, max: 50_000 }),
});

export const WIB_OFFSET_HOURS = 7;
export const STREAK_CONTINUE_SEC = 48 * 3600;

/** Calendar-day key in WIB (UTC+7), e.g. '2026-09-09'. */
export function wibDayKey(tsSec) {
  return new Date(tsSec * 1000 + WIB_OFFSET_HOURS * 3600000)
    .toISOString()
    .slice(0, 10);
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
