/**
 * Economy 2.0 — Crime config. Single source of truth for Crime balancing.
 *
 * Migrated from legacy (`commands/modules/economy/crime.js`): same five
 * crimes, same reward/penalty ranges, same chances, same jail durations.
 *
 * Dropped vs legacy: the `exp` field (legacy fed the old user-level
 * system, which no longer exists; RPG player EXP is out of scope for
 * Crime — same rationale as Daily dropping EXP). Cooldown lives on the
 * command (`manualCooldown`, like legacy + gacha).
 */
export const CRIME_COOLDOWN_MS = 60 * 60 * 1000;

export const CRIMES = [
  {
    id: 'jambret',
    name: 'jambret',
    emoji: '👜',
    label: '🟡 SEDANG',
    reward: [4000, 6000],
    penalty: [1000, 3000],
    successChance: 0.55,
    caughtChance: 0.3,
    prisonMs: 4 * 60 * 60 * 1000,
  },
  {
    id: 'hacker',
    name: 'hacker',
    emoji: '💻',
    label: '🔴 NEKAT',
    reward: [6000, 9000],
    penalty: [2000, 6000],
    successChance: 0.4,
    caughtChance: 0.45,
    prisonMs: 12 * 60 * 60 * 1000,
  },
  {
    id: 'copet',
    name: 'copet',
    emoji: '👛',
    label: '🟢 AMAN',
    reward: [3000, 4000],
    penalty: [500, 1500],
    successChance: 0.75,
    caughtChance: 0.15,
    prisonMs: 4 * 60 * 60 * 1000,
  },
  {
    id: 'judi',
    name: 'judi online',
    emoji: '🎰',
    label: '🎲 GAMBLING',
    reward: [3500, 5000],
    penalty: [500, 2000],
    gamble: true,
    jackpotChance: 0.06,
    winChance: 0.34,
    caughtChance: 0.18,
    jackpotReward: [15000, 30000],
    loseCost: [500, 2000],
    prisonMs: 12 * 60 * 60 * 1000,
  },
  {
    id: 'skimming',
    name: 'skimming ATM',
    emoji: '💳',
    label: '🔴 NEKAT',
    reward: [9000, 11000],
    penalty: [3000, 8000],
    successChance: 0.35,
    caughtChance: 0.5,
    prisonMs: 24 * 60 * 60 * 1000,
  },
];

export const CRIME_MAP = Object.fromEntries(CRIMES.map((c) => [c.id, c]));

export function getCrime(id) {
  if (!id) return null;
  return CRIME_MAP[String(id).toLowerCase()] ?? null;
}

/** Displayed success chance (jackpot counts as success for gambling). */
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
