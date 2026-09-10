/**
 * Economy 2.0 — Mine config. Single source of truth for Mining.
 *
 * Mirrors the fishing mechanic (see fish-config.js): twelve possible
 * finds, weighted rates, coin reward ranges, flat EXP.
 * Rate weights are relative (total is normalized at pick time).
 */
export const MINE_COOLDOWN_MS = 60 * 60 * 1000;

export const ORES = [
  { name: 'Batuan Biasa', reward: [10, 30], exp: 1, emoji: '🪨', rate: 18 },
  { name: 'Pecahan Beton', reward: [15, 60], exp: 2, emoji: '🧱', rate: 14 },
  { name: 'Batu Bara', reward: [250, 650], exp: 8, emoji: '⚫', rate: 16 },
  { name: 'Bijih Besi', reward: [400, 900], exp: 10, emoji: '⛓️', rate: 13 },
  {
    name: 'Bijih Tembaga',
    reward: [500, 1100],
    exp: 12,
    emoji: '🟠',
    rate: 10,
  },
  { name: 'Bijih Perak', reward: [650, 1300], exp: 15, emoji: '🥈', rate: 9 },
  { name: 'Bijih Emas', reward: [1000, 2300], exp: 20, emoji: '🥇', rate: 7 },
  { name: 'Safir', reward: [1900, 4500], exp: 35, emoji: '🔷', rate: 5 },
  { name: 'Rubi', reward: [2500, 6500], exp: 40, emoji: '♦️', rate: 4 },
  { name: 'Berlian', reward: [3800, 9000], exp: 60, emoji: '💎', rate: 2 },
  {
    name: 'Berlian Pink',
    reward: [5000, 11500],
    exp: 75,
    emoji: '💠',
    rate: 1,
  },
  {
    name: 'Harta Karun Kuno',
    reward: [10000, 19000],
    exp: 100,
    emoji: '💰',
    rate: 1,
  },
];

/** Weighted pick over ORES (relative rates). */
export function pickOre(random = Math.random) {
  const total = ORES.reduce((s, m) => s + m.rate, 0);
  let roll = random() * total;
  for (const m of ORES) {
    if ((roll -= m.rate) < 0) return m;
  }
  return ORES[ORES.length - 1];
}

export function mineReward(ore, random = Math.random) {
  return Math.floor(ore.reward[0] + random() * (ore.reward[1] - ore.reward[0]));
}
