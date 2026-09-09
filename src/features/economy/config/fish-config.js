/**
 * Economy 2.0 — Fish config. Single source of truth for Fishing.
 *
 * Migrated from legacy (`commands/modules/rpg/fish.js`): same twelve
 * catches, same weighted rates, same coin reward ranges, same flat EXP.
 * Rate weights are relative (total is normalized at pick time).
 */
export const FISH_COOLDOWN_MS = 60 * 60 * 1000;

export const FISH = [
  { name: 'Botol Plastik', reward: [10, 30], exp: 1, emoji: '🧴', rate: 18 },
  { name: 'Sepatu Bekas', reward: [15, 60], exp: 2, emoji: '👟', rate: 14 },
  { name: 'Ikan Lele', reward: [250, 650], exp: 8, emoji: '🐟', rate: 16 },
  { name: 'Ikan Mas', reward: [400, 900], exp: 10, emoji: '🐠', rate: 13 },
  { name: 'Ikan Nila', reward: [500, 1100], exp: 12, emoji: '🐟', rate: 10 },
  { name: 'Ikan Cupang', reward: [650, 1300], exp: 15, emoji: '🐡', rate: 9 },
  { name: 'Ikan Gurame', reward: [1000, 2300], exp: 20, emoji: '🐠', rate: 7 },
  { name: 'Ikan Tuna', reward: [1900, 4500], exp: 35, emoji: '🐟', rate: 5 },
  { name: 'Ikan Arwana', reward: [2500, 6500], exp: 40, emoji: '🐉', rate: 4 },
  { name: 'Ikan Hiu', reward: [3800, 9000], exp: 60, emoji: '🦈', rate: 2 },
  { name: 'Ikan Koi', reward: [5000, 11500], exp: 75, emoji: '🎏', rate: 1 },
  { name: 'Harta Karam', reward: [10000, 19000], exp: 100, emoji: '💰', rate: 1 },
];

/** Legacy weighted pick over FISH (relative rates). */
export function pickFish(random = Math.random) {
  const total = FISH.reduce((s, m) => s + m.rate, 0);
  let roll = random() * total;
  for (const m of FISH) {
    if ((roll -= m.rate) < 0) return m;
  }
  return FISH[FISH.length - 1];
}

export function fishReward(fish, random = Math.random) {
  return Math.floor(
    fish.reward[0] + random() * (fish.reward[1] - fish.reward[0])
  );
}
