export const CRIME_COOLDOWN_MS = 60 * 60 * 1000;

export const CRIMES = [
  {
    id: 'jambret',
    name: 'jambret',
    emoji: '👜',
    label: '🟡 SEDANG',
    reward: [50_000, 60_000],
    penalty: [60_000, 70_000],
    successChance: 0.55,
    caughtChance: 0.3,
    prisonMs: 4 * 60 * 60 * 1000,
  },
  {
    id: 'hacker',
    name: 'hacker',
    emoji: '💻',
    label: '🔴 NEKAT',
    reward: [100_000, 150_000],
    penalty: [90_000, 100_000],
    successChance: 0.4,
    caughtChance: 0.45,
    prisonMs: 24 * 60 * 60 * 1000,
  },
  {
    id: 'copet',
    name: 'copet',
    emoji: '👛',
    label: '🟢 AMAN',
    reward: [20_000, 25_000],
    penalty: [25_000, 30_000],
    successChance: 0.75,
    caughtChance: 0.15,
    prisonMs: 4 * 60 * 60 * 1000,
  },
  {
    id: 'judi',
    name: 'judi online',
    emoji: '🎰',
    label: '🎲 GAMBLING',
    reward: [50_000, 100_000],
    penalty: [100_000, 80_000],
    gamble: true,
    jackpotChance: 0.06,
    winChance: 0.34,
    caughtChance: 0.18,
    jackpotReward: [500_000, 600_000],
    loseCost: [200_000, 300_000],
    prisonMs: 12 * 60 * 60 * 1000,
  },
  {
    id: 'skimming',
    name: 'skimming ATM',
    emoji: '💳',
    label: '🔴 NEKAT',
    reward: [500_000, 1_000_000],
    penalty: [800_000, 1_000_000],
    successChance: 0.35,
    caughtChance: 0.5,
    prisonMs: 2 * 24 * 60 * 60 * 1000,
  },
];

export const CRIME_MAP = Object.fromEntries(CRIMES.map((c) => [c.id, c]));

export function getCrime(id) {
  if (!id) return null;
  return CRIME_MAP[String(id).toLowerCase()] ?? null;
}

export function successChance(crime) {
  return crime.gamble
    ? crime.jackpotChance + crime.winChance
    : crime.successChance;
}

export function crimeStatLine(crime) {
  const [min, max] = crime.reward;
  const hours = Math.round(crime.prisonMs / 3_600_000);
  const chance = Math.round(successChance(crime) * 100);
  return `🪙 ${min / 1000}k-${max / 1000}k • Sukses ${chance}% • Jail ${hours}j`;
}

export function formatRemaining(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
