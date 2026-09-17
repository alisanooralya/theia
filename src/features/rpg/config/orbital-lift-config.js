export const ORBITAL_MAX_FLOOR = 100;
export const ORBITAL_BOSS_INTERVAL = 10;

export const ORBITAL_SIGNAL_MAX = 100;
export const ORBITAL_SIGNAL_START = 100;
export const ORBITAL_SIGNAL_REGEN_MS = 5 * 60 * 1000;

export const ORBITAL_COST_NORMAL = 20;
export const ORBITAL_COST_BOSS = 30;

export const ORBITAL_ENEMY = Object.freeze({
  normalName: 'Void Husk',
  bossName: 'Void Warden',
  base: Object.freeze({
    hp: 120,
    atk: 10,
    def: 4,
    critRate: 0.25,
    critDmg: 1.5,
  }),
  perFloor: Object.freeze({ hp: 0.1, atk: 0.06, def: 0.05 }),
  bossMult: Object.freeze({ hp: 2.2, atk: 1.6, def: 1.5 }),
  bossSkill: Object.freeze({
    active: Object.freeze({
      name: 'Void Crush',
      multiplier: 1.6,
      flatBonus: 0,
      defIgnore: 0,
      cooldownSec: 6,
      unlocked: true,
      upgraded: false,
    }),
    passives: [],
  }),
});

export const ORBITAL_REWARD_NORMAL = Object.freeze({
  coin: Object.freeze({ min: 50000, max: 80000 }),
  exp: 360,
  cerelia: Object.freeze({ min: 1, max: 4 }),
});

export const ORBITAL_REWARD_BOSS = Object.freeze({
  coinMult: 2,
  expMult: 2,
  cerelia: Object.freeze({ min: 2, max: 5 }),
});

export function isBossFloor(floor) {
  return (
    Number.isInteger(floor) && floor > 0 && floor % ORBITAL_BOSS_INTERVAL === 0
  );
}

export function costForFloor(floor) {
  return isBossFloor(floor) ? ORBITAL_COST_BOSS : ORBITAL_COST_NORMAL;
}

function scale(base, growth, floor) {
  return base * (1 + growth * (floor - 1));
}

export function enemyForFloor(floor) {
  const boss = isBossFloor(floor);
  const { base, perFloor, bossMult } = ORBITAL_ENEMY;
  const mult = boss ? bossMult : { hp: 1, atk: 1, def: 1 };
  return {
    id: `orbital_f${floor}`,
    name: `${boss ? ORBITAL_ENEMY.bossName : ORBITAL_ENEMY.normalName} Lt.${floor}`,
    boss,
    behavior: boss ? 'skill_based' : 'basic',
    stats: {
      maxHp: Math.round(scale(base.hp, perFloor.hp, floor) * mult.hp),
      atk: Math.round(scale(base.atk, perFloor.atk, floor) * mult.atk),
      def: Math.round(scale(base.def, perFloor.def, floor) * mult.def),
      critRate: base.critRate,
      critDmg: base.critDmg,
    },
  };
}
