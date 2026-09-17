import { getMainCard } from './card-config.js';

// Imperium: weekly endgame challenge (5 difficulties).
//
// WEEKLY ROTATION (tanpa ubah logic/service):
// 1. Ganti IMPERIUM_WEEKLY_CARD_ID ke Main Card ID existing yang valid
//    (lihat MAIN_CARDS di card-config.js: girgas, lena, ameris, daisy, luuk).
// 2. Sesuaikan IMPERIUM_FATES supaya bertema Weekly Card tersebut.
// 3. Tune IMPERIUM_BOSSES / IMPERIUM_REWARDS bila perlu.
// Service memvalidasi Weekly Card via getMainCard (source of truth tetap
// card-config.js; tidak ada duplikasi data Main Card di sini).

export const IMPERIUM_MIN_LEVEL = 16;
export const IMPERIUM_DIFF_COUNT = 5;

export const IMPERIUM_WEEKLY_CARD_ID = 'luuk';

function fate(entry) {
  if (!entry?.id || !entry?.name) throw new RangeError('fate needs id and name');
  if (entry.kind !== 'blessing' && entry.kind !== 'curse') {
    throw new RangeError(`fate ${entry.id} needs kind blessing|curse`);
  }
  return Object.freeze({
    id: entry.id,
    kind: entry.kind,
    name: entry.name,
    icon: entry.icon ?? (entry.kind === 'blessing' ? '✨' : '☠️'),
    flavor: entry.flavor ?? '',
    reveal: entry.reveal ?? '',
    player: entry.player ? Object.freeze({ ...entry.player }) : null,
    boss: entry.boss ? Object.freeze({ ...entry.boss }) : null,
  });
}

// Pool Blessing/Curse minggu ini. Semua entry bertema Weekly Card (Luuk:
// Savage Rend = Basic Attack ignore DEF, Predatory Instinct = defensif saat
// ATK musuh lebih tinggi, Blood Scent = bonus saat HP musuh lebih tinggi).
// - player: passive tempel ke playerSkills.passives (format battle-engine:
//   { trigger: 'attack'|'defend'|'battle_start', modifiers: {...} }).
// - boss: { hpMult, atkMult, defMult, guardMult, skillMult } — pengali stat
//   boss / guard passive / penguat active skill boss (format battle-engine).
export const IMPERIUM_FATES = Object.freeze([
  fate({
    id: 'savage-echo',
    kind: 'blessing',
    name: 'Savage Echo',
    icon: '🩸',
    flavor: 'Gema keganasan sang predator.',
    reveal: 'Basic Attack mengabaikan sebagian DEF musuh.',
    player: {
      trigger: 'attack',
      modifiers: { defIgnore: 0.15 },
    },
  }),
  fate({
    id: 'predator-guard',
    kind: 'blessing',
    name: "Predator's Guard",
    icon: '🛡️',
    flavor: 'Insting predator membaca serangan musuh.',
    reveal: 'Damage yang diterima berkurang.',
    player: {
      trigger: 'defend',
      modifiers: { guardMult: 0.85 },
    },
  }),
  fate({
    id: 'blood-frenzy',
    kind: 'blessing',
    name: 'Blood Frenzy',
    icon: '🔥',
    flavor: 'Aroma darah membakar amarah Luuk.',
    reveal: 'Damage serangan meningkat.',
    player: {
      trigger: 'attack',
      modifiers: { damageMult: 1.15 },
    },
  }),
  fate({
    id: 'apex-hunger',
    kind: 'curse',
    name: 'Apex Hunger',
    icon: '👹',
    flavor: 'Sang alpha lapar dan semakin buas.',
    reveal: 'ATK Boss meningkat.',
    boss: { atkMult: 1.25 },
  }),
  fate({
    id: 'warden-plate',
    kind: 'curse',
    name: "Warden's Plate",
    icon: '🧱',
    flavor: 'Kulit boss mengeras seperti baja.',
    reveal: 'DEF Boss meningkat.',
    boss: { defMult: 1.4 },
  }),
  fate({
    id: 'thorned-hide',
    kind: 'curse',
    name: 'Thorned Hide',
    icon: '🌵',
    flavor: 'Duri beracun tumbuh di tubuh boss.',
    reveal: 'Boss lebih alot dan sulit ditembus.',
    boss: { hpMult: 1.1, guardMult: 0.85 },
  }),
]);

function imperiumBoss({
  diff,
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
  if (!Number.isInteger(diff) || diff < 1 || diff > IMPERIUM_DIFF_COUNT) {
    throw new RangeError(`imperium boss needs diff 1..${IMPERIUM_DIFF_COUNT}`);
  }
  if (!id || !name) throw new RangeError('imperium boss needs id and name');
  if (maxHp <= 0) throw new RangeError(`imperium boss ${id} needs maxHp > 0`);
  return Object.freeze({
    diff,
    id,
    name,
    stats: Object.freeze({ maxHp, atk, def, critRate, critDmg }),
    behavior,
    skills,
  });
}

function bossSkill(name, multiplier, cooldownSec = 6) {
  return Object.freeze({
    active: Object.freeze({
      name,
      multiplier,
      flatBonus: 0,
      defIgnore: 0,
      cooldownSec,
      unlocked: true,
      upgraded: false,
    }),
    passives: [],
  });
}

export const IMPERIUM_BOSSES = Object.freeze({
  1: imperiumBoss({
    diff: 1,
    id: 'husksquire',
    name: 'Husk Squire',
    maxHp: 2500,
    atk: 30,
    def: 12,
  }),
  2: imperiumBoss({
    diff: 2,
    id: 'husk_knight',
    name: 'Husk Knight',
    maxHp: 5000,
    atk: 45,
    def: 22,
  }),
  3: imperiumBoss({
    diff: 3,
    id: 'rend_caller',
    name: 'Rend Caller',
    maxHp: 8000,
    atk: 60,
    def: 32,
    behavior: 'skill_based',
    skills: bossSkill('Rending Howl', 1.35),
  }),
  4: imperiumBoss({
    diff: 4,
    id: 'apex_revenant',
    name: 'Apex Revenant',
    maxHp: 12000,
    atk: 75,
    def: 42,
    behavior: 'skill_based',
    skills: bossSkill('Apex Cleave', 1.5),
  }),
  5: imperiumBoss({
    diff: 5,
    id: 'imperium_tyrant',
    name: 'Imperium Tyrant',
    maxHp: 17000,
    atk: 90,
    def: 52,
    behavior: 'skill_based',
    skills: bossSkill('Tyrant Rend', 1.6, 5),
  }),
});

// Reward flat per Diff (sekali klaim per Diff per minggu). Atomic via transaksi.
export const IMPERIUM_REWARDS = Object.freeze({
  1: Object.freeze({ coin: 60000, exp: 500, cerelia: 5 }),
  2: Object.freeze({ coin: 80000, exp: 700, cerelia: 8 }),
  3: Object.freeze({ coin: 100000, exp: 900, cerelia: 12 }),
  4: Object.freeze({ coin: 150000, exp: 1200, cerelia: 16 }),
  5: Object.freeze({ coin: 200000, exp: 1600, cerelia: 20 }),
});

export function getWeeklyCardDef() {
  const def = getMainCard(IMPERIUM_WEEKLY_CARD_ID);
  if (!def) throw new RangeError(`unknown imperium weekly card: ${IMPERIUM_WEEKLY_CARD_ID}`);
  return def;
}

export function getImperiumBoss(diff) {
  return IMPERIUM_BOSSES[diff] ?? null;
}

export function getImperiumReward(diff) {
  return IMPERIUM_REWARDS[diff] ?? null;
}

export function getImperiumFate(fateId) {
  return IMPERIUM_FATES.find((f) => f.id === fateId) ?? null;
}
