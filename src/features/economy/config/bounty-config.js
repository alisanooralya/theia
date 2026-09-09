/**
 * Economy 2.0 — Bounty config. Single source of truth for Bounty.
 *
 * Migrated from legacy (`features/rpg/bounty.js`): same three
 * difficulties, same three targets per difficulty with identical
 * HP/ATK/DEF, same coin/exp ranges. One bounty attempt per WIB calendar
 * day (legacy daily limit). Reward is paid in full — the legacy card
 * coin-bonus multiplier has no equivalent in the 2.0 card system.
 */
import { WIB_OFFSET_HOURS } from './daily-config.js';

export const BOUNTY_DIFFICULTY = {
  easy: {
    name: 'Easy',
    label: '🟢 EASY',
    coin: [6000, 8000],
    exp: [20, 40],
    targets: [
      { id: 'copet', name: 'Copet Pasar', emoji: '🪙', hp: 2450, atk: 175, def: 84 },
      { id: 'garong', name: 'Garong Kampung', emoji: '🗡️', hp: 2940, atk: 210, def: 105 },
      { id: 'rampok', name: 'Rampok Jalanan', emoji: '🪓', hp: 3500, atk: 245, def: 126 },
    ],
  },
  medium: {
    name: 'Medium',
    label: '🟡 MEDIUM',
    coin: [13000, 17000],
    exp: [50, 80],
    targets: [
      { id: 'bandit', name: 'Bandit Elite', emoji: '🏹', hp: 4400, atk: 300, def: 130 },
      { id: 'preman', name: 'Preman Pelabuhan', emoji: '🥊', hp: 5000, atk: 340, def: 145 },
      { id: 'sindikat', name: 'Bos Sindikat', emoji: '🎭', hp: 5600, atk: 380, def: 160 },
    ],
  },
  hard: {
    name: 'Hard',
    label: '🔴 HARD',
    coin: [21000, 27000],
    exp: [100, 120],
    targets: [
      { id: 'assassin', name: 'Shadow Assassin', emoji: '🥷', hp: 6600, atk: 440, def: 175 },
      { id: 'warlord', name: 'Warlord', emoji: '⚔️', hp: 7500, atk: 500, def: 195 },
      { id: 'overlord', name: 'Cursed Overlord', emoji: '👹', hp: 8400, atk: 560, def: 215 },
    ],
  },
};

export function getBountyDifficulty(difficulty) {
  if (!difficulty) return null;
  return BOUNTY_DIFFICULTY[String(difficulty).toLowerCase()] ?? null;
}

export function getBountyTarget(difficulty, targetId) {
  const config = getBountyDifficulty(difficulty);
  if (!config || !targetId) return null;
  const id = String(targetId).toLowerCase();
  return config.targets.find((target) => target.id === id) ?? null;
}

export function targetStatLine(target) {
  return `HP ${target.hp} • ATK ${target.atk} • DEF ${target.def}`;
}

export function rewardRange(config) {
  return `${config.coin[0] / 1000}k-${config.coin[1] / 1000}k Coin`;
}

/** Epoch seconds at which the current WIB calendar day started. */
export function wibDayStart(tsSec) {
  return Math.floor((tsSec + WIB_OFFSET_HOURS * 3600) / 86400) * 86400 - WIB_OFFSET_HOURS * 3600;
}
