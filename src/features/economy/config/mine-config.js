/**
 * Economy 2.0 — Mine config. Single source of truth for Mining.
 *
 * Mirrors the fishing mechanic (see fish-config.js): twelve possible
 * finds, weighted rates, coin reward ranges, flat EXP.
 * Rate weights are relative (total is normalized at pick time).
 */
export const MINE_COOLDOWN_MS = 60 * 60 * 1000;

export const ORES = [
  { name: 'Batuan Biasa', reward: [100, 300], exp: 2, emoji: '🪨', rate: 18 },
  { name: 'Pecahan Beton', reward: [150, 600], exp: 4, emoji: '🧱', rate: 14 },
  { name: 'Batu Bara', reward: [2500, 6500], exp: 12, emoji: '⚫', rate: 16 },
  { name: 'Bijih Besi', reward: [4000, 9000], exp: 15, emoji: '⛓️', rate: 13 },
  {
    name: 'Bijih Tembaga',
    reward: [5000, 11000],
    exp: 18,
    emoji: '🟠',
    rate: 10,
  },
  { name: 'Bijih Perak', reward: [6500, 13000], exp: 22, emoji: '🥈', rate: 9 },
  { name: 'Bijih Emas', reward: [10000, 23000], exp: 30, emoji: '🥇', rate: 7 },
  { name: 'Safir', reward: [19000, 45000], exp: 45, emoji: '🔷', rate: 5 },
  { name: 'Rubi', reward: [25000, 65000], exp: 55, emoji: '♦️', rate: 4 },
  { name: 'Berlian', reward: [38000, 90000], exp: 75, emoji: '💎', rate: 2 },
  {
    name: 'Berlian Pink',
    reward: [50000, 115000],
    exp: 90,
    emoji: '💠',
    rate: 1,
  },
  {
    name: 'Harta Karun Kuno',
    reward: [100000, 190000],
    exp: 120,
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
