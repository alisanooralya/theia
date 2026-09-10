function boss({
  id,
  name,
  maxHp,
  atk,
  def,
  critRate = 0.05,
  critDmg = 1.5,
  behavior = 'basic',
  skills = null,
}) {
  if (!id || !name) throw new RangeError('boss needs id and name');
  for (const [key, value] of Object.entries({ maxHp, atk, def })) {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(`boss ${id} needs non-negative ${key}`);
    }
  }
  if (maxHp <= 0) throw new RangeError(`boss ${id} needs maxHp > 0`);
  return Object.freeze({
    id,
    name,
    stats: Object.freeze({ maxHp, atk, def, critRate, critDmg }),
    behavior,
    skills,
  });
}

function domain({ id, name, emoji, description, boss: bossDef, rewards }) {
  for (const [key, range] of Object.entries(rewards)) {
    if (
      !Number.isInteger(range?.min) ||
      !Number.isInteger(range?.max) ||
      range.min < 0 ||
      range.max < range.min
    ) {
      throw new RangeError(`domain ${id} has invalid ${key} reward range`);
    }
  }
  return Object.freeze({
    id,
    name,
    emoji,
    description: description ?? '',
    boss: bossDef,
    rewards: Object.freeze({
      exp: Object.freeze({ ...rewards.exp }),
      coin: Object.freeze({ ...rewards.coin }),
      cerelia: Object.freeze({ ...rewards.cerelia }),
    }),
  });
}

export const DOMAINS = Object.freeze({
  easy: domain({
    id: 'easy',
    name: 'Easy',
    emoji: '🟢',
    description: 'A calm frontier for fresh fighters.',
    boss: boss({
      id: 'slime_king',
      name: 'Slime King',
      maxHp: 100,
      atk: 8,
      def: 2,
    }),
    rewards: {
      exp: { min: 100, max: 150 },
      coin: { min: 20000, max: 35000 },
      cerelia: { min: 2, max: 4 },
    },
  }),
  medium: domain({
    id: 'medium',
    name: 'Medium',
    emoji: '🟡',
    description: 'Rougher wilds for trained fighters.',
    boss: boss({
      id: 'stone_golem',
      name: 'Stone Golem',
      maxHp: 5000,
      atk: 40,
      def: 20,
    }),
    rewards: {
      exp: { min: 300, max: 500 },
      coin: { min: 40000, max: 65000 },
      cerelia: { min: 5, max: 10 },
    },
  }),
  hard: domain({
    id: 'hard',
    name: 'Hard',
    emoji: '🔴',
    description: 'A brutal arena for elite fighters.',
    boss: boss({
      id: 'abyss_dragon',
      name: 'Abyss Dragon',
      maxHp: 15000,
      atk: 80,
      def: 50,
      behavior: 'skill_based',
      skills: {
        active: {
          name: 'Abyss Breath',
          multiplier: 1.5,
          flatBonus: 0,
          defIgnore: 0,
          cooldownSec: 6,
          unlocked: true,
          upgraded: false,
        },
        passives: [],
      },
    }),
    rewards: {
      exp: { min: 800, max: 1200 },
      coin: { min: 80000, max: 100000 },
      cerelia: { min: 10, max: 20 },
    },
  }),
});

export function getDomain(difficulty) {
  if (!difficulty) return null;
  return DOMAINS[String(difficulty).toLowerCase()] ?? null;
}

export function getDomains() {
  return Object.values(DOMAINS);
}

export function rollReward(range, random = Math.random) {
  return range.min + Math.floor(random() * (range.max - range.min + 1));
}
