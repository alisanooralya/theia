/**
 * RPG 2.0 — Card config.
 *
 * Single source of truth for the Card + Sign Card system: definitions,
 * stat scaling, milestones, leveling costs, and the Cerelia material.
 * Services must read everything from here; no `if (cardId === ...)`
 * branches and no balance values scattered in services.
 *
 * Concepts:
 * - Main Card = the character (HP/ATK/DEF, Lv.1-100, active + passive).
 * - Sign Card = signature layer attached to a Main Card (ATK/DEF only,
 *   Lv.1-50, passive only, gated by `compatibleCard`).
 *
 * Skill effect format (generic, combat consumes it later):
 *   { stat: 'hp'|'atk'|'def'|'critRate'|'critDmg',
 *     mode: 'add' (flat) | 'pct' (fraction, 0.10 = +10%),
 *     value: number }
 * Active skills always configure `cooldownMs`; passives have no cooldown
 * and stay active once unlocked (sign passives additionally require the
 * matching equipped Main Card).
 *
 * Stat pipeline (future StatService):
 *   Base Stats -> Main Card bonuses -> Sign Card bonuses -> Final Stats.
 * Final stats are computed at read time and never stored.
 */

export const CARD_MIN_LEVEL = 1;
export const MAIN_MAX_LEVEL = 100;
export const SIGN_MAX_LEVEL = 50;

/**
 * Standard Main Card milestones. Skill entries below repeat these levels
 * explicitly; the engine reads the skill entries, this documents the rule:
 *   Lv.25  -> unlock Active Skill
 *   Lv.50  -> unlock Passive Skill
 *   Lv.75  -> upgrade Active Skill
 *   Lv.100 -> upgrade Passive Skill
 * There is no separate skill-level system.
 */
export const MAIN_MILESTONES = Object.freeze([
  Object.freeze({ level: 25, type: 'unlock', skill: 'active' }),
  Object.freeze({ level: 50, type: 'unlock', skill: 'passive' }),
  Object.freeze({ level: 75, type: 'upgrade', skill: 'active' }),
  Object.freeze({ level: 100, type: 'upgrade', skill: 'passive' }),
]);

/**
 * Leveling economy. One shared curve for Main and Sign cards.
 * Cost of stepping from level L to L+1:
 *   coin    = coinBase + coinPerLevel * (L - 1)
 *   cerelia = cereliaBase + floor((L - 1) / cereliaEvery)
 * `materialId` points at the CERELIA_ITEM below.
 */
export const CARD_LEVELING = Object.freeze({
  materialId: 'cerelia',
  coinBase: 5000,
  coinPerLevel: 500,
  cereliaBase: 5,
  cereliaEvery: 1,
});

/**
 * Cerelia — Card leveling material (replaces the legacy Card Core idea).
 * Identity only (id/name/description). Shop pricing/purchasability lives
 * in shop-config.js, which reuses this entry — never define Cerelia twice.
 */
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

export const MAIN_CARDS = Object.freeze({
  girgas: mainCard(
    'girgas',
    'Girgas',
    'Attacker',
    { hp: 220, atk: 60, def: 10 },
    { hp: 7.0, atk: 1.36, def: 0.22 },
    skill(
      'Lollipop Crash',
      'A crushing blow fueled by stacked Lollipops.',
      25,
      75,
      [{ stat: 'atk', mode: 'pct', value: 0.1 }],
      [{ stat: 'atk', mode: 'pct', value: 0.25 }],
      8000
    ),
    skill(
      'Sugar Rush',
      'Landing hits sharpens critical precision.',
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
    { hp: 200, atk: 62, def: 12 },
    { hp: 5.66, atk: 1.39, def: 0.26 },
    skill(
      'Starfall Volley',
      'A rain of starlight arrows over the target area.',
      25,
      75,
      [{ stat: 'atk', mode: 'pct', value: 0.12 }],
      [{ stat: 'atk', mode: 'pct', value: 0.28 }],
      10000
    ),
    skill(
      'Star Fragment',
      'Taking hits gathers fragments that harden body and guard.',
      50,
      100,
      [{ stat: 'def', mode: 'pct', value: 0.1 }],
      [{ stat: 'def', mode: 'pct', value: 0.25 }]
    )
  ),
  ameris: mainCard(
    'ameris',
    'Ameris',
    'Supporter',
    { hp: 230, atk: 80, def: 14 },
    { hp: 6.97, atk: 1.82, def: 0.26 },
    skill(
      'Choco Barrage',
      'Rapid cocoa-charged strikes in quick succession.',
      25,
      75,
      [{ stat: 'atk', mode: 'pct', value: 0.08 }],
      [{ stat: 'atk', mode: 'pct', value: 0.2 }],
      6000
    ),
    skill(
      'Critical Support',
      'Every third landed hit empowers critical damage for a short time.',
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
    { hp: 260, atk: 55, def: 8 },
    { hp: 7.07, atk: 1.21, def: 0.14 },
    skill(
      'Guardian Slam',
      'A shield-first slam that turns defense into offense.',
      25,
      75,
      [{ stat: 'def', mode: 'pct', value: 0.15 }],
      [{ stat: 'def', mode: 'pct', value: 0.35 }],
      12000
    ),
    skill(
      'Last Stand',
      'The lower the remaining HP, the harder Daisy fights back.',
      50,
      100,
      [{ stat: 'hp', mode: 'pct', value: 0.1 }],
      [{ stat: 'hp', mode: 'pct', value: 0.25 }]
    )
  ),
});

export const SIGN_CARDS = Object.freeze({
  girgas_sign: signCard(
    'girgas_sign',
    'Girgas Sign',
    'girgas',
    { atk: 20, def: 8 },
    { atk: 0.8, def: 0.3 },
    {
      name: 'Lollipop Drive',
      description: 'Signature resonance: attacks hit noticeably harder.',
      effects: [{ stat: 'atk', mode: 'pct', value: 0.1 }],
    }
  ),
  lena_sign: signCard(
    'lena_sign',
    'Lena Sign',
    'lena',
    { atk: 22, def: 7 },
    { atk: 0.85, def: 0.28 },
    {
      name: 'Eagle Eye String',
      description: 'Signature resonance: shots find weak points.',
      effects: [{ stat: 'critRate', mode: 'add', value: 0.05 }],
    }
  ),
  ameris_sign: signCard(
    'ameris_sign',
    'Ameris Sign',
    'ameris',
    { atk: 24, def: 9 },
    { atk: 0.9, def: 0.32 },
    {
      name: 'Cocoa Guard',
      description: 'Signature resonance: a sweet, sturdy barrier.',
      effects: [{ stat: 'def', mode: 'pct', value: 0.1 }],
    }
  ),
  daisy_sign: signCard(
    'daisy_sign',
    'Daisy Sign',
    'daisy',
    { atk: 16, def: 12 },
    { atk: 0.7, def: 0.4 },
    {
      name: 'Bulwark Heart',
      description: 'Signature resonance: vitality surges in danger.',
      effects: [{ stat: 'hp', mode: 'pct', value: 0.1 }],
    }
  ),
});

/** Max level for a card kind ('main' | 'sign'). */
export function maxLevelFor(kind) {
  if (kind === 'main') return MAIN_MAX_LEVEL;
  if (kind === 'sign') return SIGN_MAX_LEVEL;
  throw new RangeError(`unknown card kind: ${kind}`);
}

/** Main Card definition by id, or null. */
export function getMainCard(cardId) {
  return MAIN_CARDS[cardId] ?? null;
}

/** Sign Card definition by id, or null. */
export function getSignCard(cardId) {
  return SIGN_CARDS[cardId] ?? null;
}

/** Any card definition (main or sign) by id, or null. */
export function getCardDefinition(cardId) {
  return getMainCard(cardId) ?? getSignCard(cardId) ?? null;
}

/** 'main', 'sign', or null for unknown ids. */
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

/**
 * Card stats at a given level. Linear scaling:
 *   stat = floor(base + growth * (level - 1))
 * Main cards return { hp, atk, def }; sign cards return { atk, def }.
 */
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

/**
 * Cost of stepping from level L to L+1 (pure, config-driven).
 * Returns null when L is already at `maxLevel`.
 */
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

/**
 * Total cost of leveling `count` steps from `fromLevel`, capped at
 * `maxLevel`. Pure — used by bulk level-up and tests.
 */
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

/**
 * Cost of stepping from `currentLevel` to `currentLevel + 1` for a card
 * kind ('main' | 'sign'). Returns { coin, cerelia, materialId }, or null
 * when already at max. Pure — single source of truth for level-up cost.
 */
export function getLevelUpCost(kind, currentLevel) {
  const max = maxLevelFor(kind);
  return levelStepCost(currentLevel, max);
}

/**
 * Total cost of leveling from `currentLevel` to `targetLevel` by summing
 * every step (never single-step x count). Returns
 * { coin, cerelia, materialId, levels, toLevel }. Throws when the target
 * is not above current or exceeds the kind max.
 */
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

/**
 * How many levels can be afforded with the given coin + cerelia.
 * Pure — used by a future "level up as much as possible" flow.
 */
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
