import { existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const CARD_MIN_LEVEL = 1;
export const MAIN_MAX_LEVEL = 100;
export const SIGN_MAX_LEVEL = 50;

export const MAIN_MILESTONES = Object.freeze([
  Object.freeze({ level: 25, type: 'unlock', skill: 'active' }),
  Object.freeze({ level: 50, type: 'unlock', skill: 'passive' }),
  Object.freeze({ level: 75, type: 'upgrade', skill: 'active' }),
  Object.freeze({ level: 100, type: 'upgrade', skill: 'passive' }),
]);

export const CARD_LEVELING = Object.freeze({
  materialId: 'cerelia',
  coinBase: 2000,
  coinPerLevel: 300,
  cereliaBase: 2,
  cereliaEvery: 100,
});

export const CERELIA_ITEM = Object.freeze({
  id: 'cerelia',
  name: 'Cerelia',
  description: 'Signature material used to level up Main and Sign Cards.',
  category: 'material',
  stackable: true,
});

function skill(
  name,
  description,
  unlockLevel,
  upgradeLevel,
  effects,
  upgradedEffects,
  cooldownMs = null
) {
  return Object.freeze({
    name,
    description,
    unlockLevel,
    upgradeLevel,
    cooldownMs,
    effects: Object.freeze(effects.map((e) => Object.freeze({ ...e }))),
    upgradedEffects: Object.freeze(
      upgradedEffects.map((e) => Object.freeze({ ...e }))
    ),
  });
}

function mainCard(id, name, role, base, growth, active, passive) {
  if (!Number.isInteger(active.cooldownMs) || active.cooldownMs <= 0) {
    throw new RangeError(
      `main card ${id} must configure a positive active cooldownMs`
    );
  }
  if (passive.cooldownMs !== null) {
    throw new RangeError(`main card ${id} passive must not have a cooldown`);
  }
  return Object.freeze({
    id,
    kind: 'main',
    name,
    role,
    base: Object.freeze({ ...base }),
    growth: Object.freeze({ ...growth }),
    active,
    passive,
  });
}

function signCard(id, name, compatibleCard, base, growth, passive) {
  return Object.freeze({
    id,
    kind: 'sign',
    name,
    compatibleCard,
    base: Object.freeze({ ...base }),
    growth: Object.freeze({ ...growth }),
    passive: Object.freeze({
      ...passive,
      effects: Object.freeze(
        passive.effects.map((e) => Object.freeze({ ...e }))
      ),
    }),
  });
}

export const CARD_DIR = join(__dirname, '..', '..', '..', '..', 'temp', 'card');

export const CARD_IMAGE_MAP = Object.freeze({
  girgas: 'girgas.webp',
  lena: 'lena.webp',
  ameris: 'ameris.webp',
  daisy: 'daisy.webp',
  luuk: 'luuk.webp',
});

export function cardArtFile(cardId) {
  if (!cardId) return null;
  return CARD_IMAGE_MAP[cardId] ?? null;
}

export function cardArtPath(cardId) {
  const file = cardArtFile(cardId);
  if (!file) return null;
  const full = join(CARD_DIR, file);
  return existsSync(full) ? full : null;
}

export const MAIN_CARDS = Object.freeze({
  girgas: mainCard(
    'girgas',
    'Girgas',
    'Attacker',
    { hp: 213, atk: 118, def: 10 },
    { hp: 24, atk: 11.8, def: 0.4 },
    skill(
      'Lollipop Crash',
      'A crushing blow that deals increased damage to the enemy.\nDeals +10% DMG (+25% upgraded).',
      25,
      75,
      [{ stat: 'atk', mode: 'pct', value: 0.1 }],
      [{ stat: 'atk', mode: 'pct', value: 0.25 }],
      8000
    ),
    skill(
      'Sugar Rush',
      'Landing hits sharpens critical precision.\n+5% Crit Rate (+12% upgraded).',
      50,
      100,
      [{ stat: 'critRate', mode: 'add', value: 0.05 }],
      [{ stat: 'critRate', mode: 'add', value: 0.12 }]
    )
  ),
  lena: mainCard(
    'lena',
    'Lena',
    'Archer',
    { hp: 184, atk: 119, def: 10 },
    { hp: 19, atk: 11.5, def: 0.3 },
    skill(
      'Starfall Volley',
      'A rain of starlight arrows over the target area.\nDeals +9% DMG (+20% upgraded).',
      25,
      75,
      [{ stat: 'atk', mode: 'pct', value: 0.09 }],
      [{ stat: 'atk', mode: 'pct', value: 0.2 }],
      10000
    ),
    skill(
      'Star Fragment',
      'Hardens body and guard, reducing damage taken in battle.\nTake 6% less DMG (15% upgraded).',
      50,
      100,
      [{ stat: 'def', mode: 'pct', value: 0.06 }],
      [{ stat: 'def', mode: 'pct', value: 0.15 }]
    )
  ),
  ameris: mainCard(
    'ameris',
    'Ameris',
    'Supporter',
    { hp: 221, atk: 119, def: 15 },
    { hp: 22, atk: 12, def: 0.4 },
    skill(
      'Choco Barrage',
      'Rapid cocoa-charged strikes in quick succession.\nDeals +8% DMG (+20% upgraded).',
      25,
      75,
      [{ stat: 'atk', mode: 'pct', value: 0.08 }],
      [{ stat: 'atk', mode: 'pct', value: 0.2 }],
      6000
    ),
    skill(
      'Critical Support',
      'Empowers critical damage in battle.\nCrit DMG +0.5x (+1.0x upgraded).',
      50,
      100,
      [{ stat: 'critDmg', mode: 'add', value: 0.5 }],
      [{ stat: 'critDmg', mode: 'add', value: 1.0 }]
    )
  ),
  daisy: mainCard(
    'daisy',
    'Daisy',
    'Defender',
    { hp: 255, atk: 94, def: 9 },
    { hp: 26, atk: 9, def: 0.7 },
    skill(
      'Guardian Slam',
      'A shield-first slam that strikes the enemy.\nDeals +15% DMG (+35% upgraded).',
      25,
      75,
      [{ stat: 'def', mode: 'pct', value: 0.15 }],
      [{ stat: 'def', mode: 'pct', value: 0.35 }],
      12000
    ),
    skill(
      'Last Stand',
      'Sturdy resolve that increases Max HP at battle start.\nMax HP +10% (+25% upgraded).',
      50,
      100,
      [{ stat: 'hp', mode: 'pct', value: 0.1 }],
      [{ stat: 'hp', mode: 'pct', value: 0.25 }]
    )
  ),
  luuk: mainCard(
    'luuk',
    'Luuk',
    'Attacker',
    { hp: 233, atk: 110, def: 9 },
    { hp: 22.4, atk: 10, def: 0.6 },
    skill(
      'Savage Rend',
      'A savage rend that exposes the enemy guard to basic attacks.\nBasic Attacks ignore 10% DEF for 2s (25% upgraded).',
      25,
      75,
      [{ stat: 'defIgnore', mode: 'pct', value: 0.1, durationSec: 2000 }],
      [{ stat: 'defIgnore', mode: 'pct', value: 0.25, durationSec: 2000 }],
      8000
    ),
    skill(
      'Predatory Instinct',
      'When the enemy ATK is higher, reduce damage taken in battle.\nTake 8% less DMG (15% upgraded).',
      50,
      100,
      [
        {
          stat: 'def',
          mode: 'pct',
          value: 0.08,
          condition: {
            left: { side: 'enemy', key: 'atk' },
            op: '>',
            right: { side: 'self', key: 'atk' },
          },
        },
      ],
      [
        {
          stat: 'def',
          mode: 'pct',
          value: 0.15,
          condition: {
            left: { side: 'enemy', key: 'atk' },
            op: '>',
            right: { side: 'self', key: 'atk' },
          },
        },
      ]
    )
  ),
});

export const SIGN_CARDS = Object.freeze({
  girgas_sign: signCard(
    'girgas_sign',
    'Girgas Sign',
    'girgas',
    { atk: 43, def: 13 },
    { atk: 2.6, def: 0.9 },
    {
      name: 'Lollipop Drive',
      description:
        'Signature resonance: attacks hit noticeably harder.\nDeal +10% more DMG.',
      effects: [{ stat: 'atk', mode: 'pct', value: 0.1 }],
    }
  ),
  lena_sign: signCard(
    'lena_sign',
    'Lena Sign',
    'lena',
    { atk: 44, def: 12 },
    { atk: 2.6, def: 0.8 },
    {
      name: 'Eagle Eye String',
      description:
        'Signature resonance: shots find weak points.\n+5% Crit Rate.',
      effects: [{ stat: 'critRate', mode: 'add', value: 0.05 }],
    }
  ),
  ameris_sign: signCard(
    'ameris_sign',
    'Ameris Sign',
    'ameris',
    { atk: 47, def: 14 },
    { atk: 2.4, def: 0.9 },
    {
      name: 'Cocoa Guard',
      description:
        'Signature resonance: a sweet, sturdy barrier.\nTake 10% less DMG.',
      effects: [{ stat: 'def', mode: 'pct', value: 0.1 }],
    }
  ),
  daisy_sign: signCard(
    'daisy_sign',
    'Daisy Sign',
    'daisy',
    { atk: 34, def: 17 },
    { atk: 2.1, def: 0.9 },
    {
      name: 'Bulwark Heart',
      description:
        'Signature resonance: increases Max HP at battle start.\nMax HP +10%.',
      effects: [{ stat: 'hp', mode: 'pct', value: 0.1 }],
    }
  ),
  luuk_sign: signCard(
    'luuk_sign',
    'Luuk Sign',
    'luuk',
    { atk: 40, def: 15 },
    { atk: 2.7, def: 1.0 },
    {
      name: 'Blood Scent',
      description:
        'Signature resonance: hungrier strikes against healthier prey.\nDeal +10% more DMG when enemy current HP is higher.',
      effects: [
        {
          stat: 'atk',
          mode: 'pct',
          value: 0.1,
          condition: {
            left: { side: 'enemy', key: 'hp' },
            op: '>',
            right: { side: 'self', key: 'hp' },
          },
        },
      ],
    }
  ),
});

for (const def of Object.values(MAIN_CARDS)) {
  const [unlockActive, unlockPassive, upgradeActive, upgradePassive] =
    MAIN_MILESTONES;
  if (
    def.active.unlockLevel !== unlockActive.level ||
    def.passive.unlockLevel !== unlockPassive.level ||
    def.active.upgradeLevel !== upgradeActive.level ||
    def.passive.upgradeLevel !== upgradePassive.level
  ) {
    throw new RangeError(
      `main card ${def.id} must follow MAIN_MILESTONES (active ${unlockActive.level}/${upgradeActive.level}, passive ${unlockPassive.level}/${upgradePassive.level})`
    );
  }
}

export function maxLevelFor(kind) {
  if (kind === 'main') return MAIN_MAX_LEVEL;
  if (kind === 'sign') return SIGN_MAX_LEVEL;
  throw new RangeError(`unknown card kind: ${kind}`);
}

export function getMainCard(cardId) {
  return MAIN_CARDS[cardId] ?? null;
}

export function getSignCard(cardId) {
  return SIGN_CARDS[cardId] ?? null;
}

export function getCardDefinition(cardId) {
  return getMainCard(cardId) ?? getSignCard(cardId) ?? null;
}

export function cardKind(cardId) {
  if (MAIN_CARDS[cardId]) return 'main';
  if (SIGN_CARDS[cardId]) return 'sign';
  return null;
}

function assertLevelIn(level, min, max) {
  if (!Number.isInteger(level) || level < min || level > max) {
    throw new RangeError(`level must be an integer between ${min} and ${max}`);
  }
}

export function cardStatsAtLevel(def, level) {
  if (!def) throw new RangeError('unknown card definition');
  const max = maxLevelFor(def.kind);
  assertLevelIn(level, CARD_MIN_LEVEL, max);
  const at = (base, growth) => Math.floor(base + growth * (level - 1));
  if (def.kind === 'main') {
    return {
      hp: at(def.base.hp, def.growth.hp),
      atk: at(def.base.atk, def.growth.atk),
      def: at(def.base.def, def.growth.def),
    };
  }
  return {
    atk: at(def.base.atk, def.growth.atk),
    def: at(def.base.def, def.growth.def),
  };
}

export function levelStepCost(level, maxLevel) {
  if (!Number.isInteger(level) || level < CARD_MIN_LEVEL) {
    throw new RangeError('level must be a positive integer');
  }
  if (level >= maxLevel) return null;
  const cfg = CARD_LEVELING;
  return {
    coin: cfg.coinBase + cfg.coinPerLevel * (level - 1),
    cerelia: cfg.cereliaBase + Math.floor((level - 1) / cfg.cereliaEvery),
    materialId: cfg.materialId,
  };
}

export function bulkLevelCost(fromLevel, count, maxLevel) {
  const levels = Math.max(
    0,
    Math.min(Math.floor(count) || 0, maxLevel - fromLevel)
  );
  let coin = 0;
  let cerelia = 0;
  for (let lv = fromLevel; lv < fromLevel + levels; lv += 1) {
    const step = levelStepCost(lv, maxLevel);
    coin += step.coin;
    cerelia += step.cerelia;
  }
  return {
    levels,
    coin,
    cerelia,
    materialId: CARD_LEVELING.materialId,
    toLevel: fromLevel + levels,
  };
}

export function getLevelUpCost(kind, currentLevel) {
  const max = maxLevelFor(kind);
  return levelStepCost(currentLevel, max);
}

export function getBulkLevelUpCost(kind, currentLevel, targetLevel) {
  const max = maxLevelFor(kind);
  if (!Number.isInteger(currentLevel) || !Number.isInteger(targetLevel)) {
    throw new RangeError('levels must be integers');
  }
  if (targetLevel <= currentLevel) {
    throw new RangeError('target level must be above current level');
  }
  if (targetLevel > max) {
    throw new RangeError(`target level exceeds max level (${max})`);
  }
  if (currentLevel < CARD_MIN_LEVEL) {
    throw new RangeError('current level below minimum');
  }
  let coin = 0;
  let cerelia = 0;
  for (let lv = currentLevel; lv < targetLevel; lv += 1) {
    const step = levelStepCost(lv, max);
    coin += step.coin;
    cerelia += step.cerelia;
  }
  return {
    coin,
    cerelia,
    materialId: CARD_LEVELING.materialId,
    levels: targetLevel - currentLevel,
    toLevel: targetLevel,
  };
}

export function affordableLevels(fromLevel, coin, cerelia, maxLevel) {
  let levels = 0;
  let spentCoin = 0;
  let spentCerelia = 0;
  for (let lv = fromLevel; lv < maxLevel; lv += 1) {
    const step = levelStepCost(lv, maxLevel);
    if (spentCoin + step.coin > coin || spentCerelia + step.cerelia > cerelia)
      break;
    spentCoin += step.coin;
    spentCerelia += step.cerelia;
    levels += 1;
  }
  return {
    levels,
    coin: spentCoin,
    cerelia: spentCerelia,
    materialId: CARD_LEVELING.materialId,
    toLevel: fromLevel + levels,
  };
}
