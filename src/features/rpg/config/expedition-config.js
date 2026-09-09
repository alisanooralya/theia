/**
 * RPG 2.0 — Expedition config. Single source of truth for Expedition.
 *
 * Migrated from legacy (`features/rpg/expedition.js`): same two reward
 * tracks (coin / exp), same durations, same reward ranges. Rewards are
 * rolled once at start and stored — claim only pays out what was stored.
 */
import SETTINGS from '#environment/settings.js';

export const EXPEDITION_COOLDOWN_MS = 12 * 60 * 60 * 1000;

export const HOUR_MS = 60 * 60 * 1000;

export const EXPEDITIONS = {
  coin: {
    name: 'Coin Expedition',
    emoji: '🪙',
    label: '🪙 COIN',
    hint: 'Reward Coin',
    options: {
      short: {
        name: 'Short',
        durationMs: 1 * HOUR_MS,
        coin: [2000, 3500],
        exp: [0, 0],
      },
      long: {
        name: 'Long',
        durationMs: 4 * HOUR_MS,
        coin: [5500, 8500],
        exp: [0, 0],
      },
      extended: {
        name: 'Extended',
        durationMs: 8 * HOUR_MS,
        coin: [13500, 15000],
        exp: [0, 0],
      },
    },
  },
  exp: {
    name: 'EXP Expedition',
    emoji: '✨',
    label: '✨ EXP',
    hint: 'Reward EXP, tanpa Coin',
    options: {
      short: {
        name: 'Short',
        durationMs: 1 * HOUR_MS,
        coin: [0, 0],
        exp: [30, 40],
      },
      long: {
        name: 'Long',
        durationMs: 4 * HOUR_MS,
        coin: [0, 0],
        exp: [125, 185],
      },
      extended: {
        name: 'Extended',
        durationMs: 8 * HOUR_MS,
        coin: [0, 0],
        exp: [265, 390],
      },
    },
  },
};

export function getCategory(type) {
  if (!type) return null;
  return EXPEDITIONS[String(type).toLowerCase()] ?? null;
}

export function getOption(type, duration) {
  const category = getCategory(type);
  if (!category || !duration) return null;
  return category.options[String(duration).toLowerCase()] ?? null;
}

export function durationLabel(option) {
  const minutes = Math.round(option.durationMs / 60_000);
  return minutes % 60 === 0 ? `${minutes / 60}h` : `${minutes}m`;
}

function compactCoin(value) {
  return value >= 1000 ? `${value / 1000}k` : String(value);
}

export function rewardRange(option) {
  if (option.coin[1] > 0) {
    const min = compactCoin(option.coin[0]);
    const max = compactCoin(option.coin[1]);
    return `🪙 ${min}-${max} Coin`;
  }
  return `⭐ ${option.exp[0]}-${option.exp[1]} EXP`;
}

export function optionLine(option) {
  return `${durationLabel(option)} • ${rewardRange(option)}`;
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
