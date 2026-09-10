export const FISH_COOLDOWN_MS = 60 * 60 * 1000;

export const FISH = [
  {
    name: 'Botol Plastik',
    reward: [500, 2_000],
    exp: 1,
    emoji: '🧴',
    rate: 18,
  },
  {
    name: 'Sepatu Bekas',
    reward: [5_000, 12_000],
    exp: 2,
    emoji: '👟',
    rate: 14,
  },
  {
    name: 'Ikan Lele',
    reward: [12_000, 30_000],
    exp: 8,
    emoji: '🐟',
    rate: 16,
  },
  {
    name: 'Ikan Mas',
    reward: [20_000, 35_000],
    exp: 12,
    emoji: '🐠',
    rate: 13,
  },
  {
    name: 'Ikan Nila',
    reward: [18_000, 30_000],
    exp: 15,
    emoji: '🐟',
    rate: 10,
  },
  {
    name: 'Ikan Cupang',
    reward: [15_000, 40_000],
    exp: 18,
    emoji: '🐡',
    rate: 9,
  },
  {
    name: 'Ikan Gurame',
    reward: [30_000, 50_000],
    exp: 25,
    emoji: '🐠',
    rate: 7,
  },
  {
    name: 'Ikan Tuna',
    reward: [50_000, 90_000],
    exp: 35,
    emoji: '🐟',
    rate: 5,
  },
  {
    name: 'Ikan Arwana',
    reward: [150_000, 300_000],
    exp: 50,
    emoji: '🐉',
    rate: 4,
  },
  {
    name: 'Ikan Hiu',
    reward: [250_000, 450_000],
    exp: 65,
    emoji: '🦈',
    rate: 2,
  },
  {
    name: 'Ikan Koi',
    reward: [350_000, 700_000],
    exp: 85,
    emoji: '🎏',
    rate: 1,
  },
  {
    name: 'Harta Karam',
    reward: [700_000, 1_400_000],
    exp: 300,
    emoji: '💰',
    rate: 1,
  },
];

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
