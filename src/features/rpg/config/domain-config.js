/**
 * RPG 2.0 — Domain config. Single source of truth for PvE domains.
 *
 * RULE: tuning a domain = editing one entry here. Services/commands
 * never hardcode boss stats or reward numbers. Reward rolls resolve
 * uniformly within [min, max] (inclusive integers).
 *
 * v1 balance note: base player is ~100 HP / 10 ATK / 5 DEF before Card
 * bonuses. Easy is clearable nearly naked; medium wants a leveled card;
 * hard wants a strong equipped Main Card + Sign.
 */
function boss({ id, name, maxHp, atk, def, critRate = 0.05, critDmg = 1.5, behavior = 'basic', skills = null }) {
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
    if (!Number.isInteger(range?.min) || !Number.isInteger(range?.max) || range.min < 0 || range.max < range.min) {
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
    boss: boss({ id: 'slime_king', name: 'Slime King', maxHp: 80, atk: 8, def: 2 }),
    rewards: {
      exp: { min: 100, max: 150 },
      coin: { min: 5000, max: 10000 },
      cerelia: { min: 2, max: 4 },
    },
  }),
  medium: domain({
    id: 'medium',
    name: 'Medium',
    emoji: '🟡',
    description: 'Rougher wilds for trained fighters.',
    boss: boss({ id: 'stone_golem', name: 'Stone Golem', maxHp: 300, atk: 25, def: 10 }),
    rewards: {
      exp: { min: 250, max: 400 },
      coin: { min: 15000, max: 25000 },
      cerelia: { min: 5, max: 8 },
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
      maxHp: 800,
      atk: 60,
      def: 25,
      behavior: 'skill_based',
      skills: {
        active: { name: 'Abyss Breath', multiplier: 1.5, flatBonus: 0, defIgnore: 0, cooldownSec: 6, unlocked: true, upgraded: false },
        passives: [],
      },
    }),
    rewards: {
      exp: { min: 600, max: 900 },
      coin: { min: 35000, max: 50000 },
      cerelia: { min: 10, max: 15 },
    },
  }),
});

/** Domain entry by id (case-insensitive), or null. */
export function getDomain(difficulty) {
  if (!difficulty) return null;
  return DOMAINS[String(difficulty).toLowerCase()] ?? null;
}

/** All domains in definition order. */
export function getDomains() {
  return Object.values(DOMAINS);
}

/** Uniform integer roll within [min, max]. */
export function rollReward(range, random = Math.random) {
  return range.min + Math.floor(random() * (range.max - range.min + 1));
}
