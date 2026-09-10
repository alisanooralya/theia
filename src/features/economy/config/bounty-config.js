import { WIB_OFFSET_HOURS } from './daily-config.js';

export const BOUNTY_DIFFICULTY = {
  easy: {
    name: 'Easy',
    label: '🟢 EASY',
    coin: [20_000, 25_000],
    exp: [80, 100],
    targets: [
      {
        id: 'copet',
        name: 'Copet Pasar',
        emoji: '🪙',
        hp: 2500,
        atk: 60,
        def: 20,
      },
      {
        id: 'garong',
        name: 'Garong Kampung',
        emoji: '🗡️',
        hp: 3000,
        atk: 70,
        def: 25,
      },
      {
        id: 'rampok',
        name: 'Rampok Jalanan',
        emoji: '🪓',
        hp: 3200,
        atk: 75,
        def: 28,
      },
    ],
  },
  medium: {
    name: 'Medium',
    label: '🟡 MEDIUM',
    coin: [50_000, 60_000],
    exp: [150, 200],
    targets: [
      {
        id: 'bandit',
        name: 'Bandit Elite',
        emoji: '🏹',
        hp: 6000,
        atk: 120,
        def: 40,
      },
      {
        id: 'preman',
        name: 'Preman Pelabuhan',
        emoji: '🥊',
        hp: 7000,
        atk: 135,
        def: 45,
      },
      {
        id: 'sindikat',
        name: 'Bos Sindikat',
        emoji: '🎭',
        hp: 7500,
        atk: 140,
        def: 48,
      },
    ],
  },
  hard: {
    name: 'Hard',
    label: '🔴 HARD',
    coin: [120_000, 150_000],
    exp: [200, 350],
    targets: [
      {
        id: 'assassin',
        name: 'Shadow Assassin',
        emoji: '🥷',
        hp: 12000,
        atk: 160,
        def: 60,
      },
      {
        id: 'warlord',
        name: 'Warlord',
        emoji: '⚔️',
        hp: 13500,
        atk: 180,
        def: 65,
      },
      {
        id: 'overlord',
        name: 'Cursed Overlord',
        emoji: '👹',
        hp: 14000,
        atk: 190,
        def: 68,
      },
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

export function wibDayStart(tsSec) {
  return (
    Math.floor((tsSec + WIB_OFFSET_HOURS * 3600) / 86400) * 86400 -
    WIB_OFFSET_HOURS * 3600
  );
}
