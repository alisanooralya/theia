/**
 * RPG 2.0 — Skill / passive engine (pure, no database).
 *
 * Answers, for any card, without card-id branching:
 * - is a skill unlocked / upgraded at this level?
 * - which effect set applies?
 * - is a Sign passive compatible with the equipped Main Card?
 *
 * Everything is driven by `card-config.js` definitions. Adding a card is
 * config work; this engine does not change per card.
 */

/**
 * Resolve a Main Card skill (active or passive) at a level.
 * Returns { unlocked, upgraded, cooldownMs, effects } where effects is the
 * upgraded set once the upgrade milestone is reached, else the base set.
 * Active skills always carry their configured cooldownMs; passives have
 * no cooldown (null) and stay active once unlocked.
 */
export function resolveSkillState(skillDef, level) {
  if (!skillDef) throw new RangeError('unknown skill definition');
  const unlocked = level >= skillDef.unlockLevel;
  const upgraded = level >= skillDef.upgradeLevel;
  return {
    unlocked,
    upgraded,
    cooldownMs: skillDef.cooldownMs ?? null,
    effects: upgraded ? skillDef.upgradedEffects : skillDef.effects,
  };
}

/** Resolve both skills of a Main Card definition at a level. */
export function mainSkillState(mainDef, level) {
  if (!mainDef || mainDef.kind !== 'main') {
    throw new RangeError('main card definition required');
  }
  return {
    active: resolveSkillState(mainDef.active, level),
    passive: resolveSkillState(mainDef.passive, level),
  };
}

/**
 * Whether a Sign Card passive is compatible with the equipped Main Card.
 * Incompatible signs still grant ATK/DEF — only the passive is gated.
 */
export function isSignCompatible(signDef, equippedMainCardId) {
  if (!signDef || signDef.kind !== 'sign') {
    throw new RangeError('sign card definition required');
  }
  return equippedMainCardId === signDef.compatibleCard;
}

/** Resolve a Sign Card passive against the equipped Main Card id. */
export function signPassiveState(signDef, equippedMainCardId) {
  const compatible = isSignCompatible(signDef, equippedMainCardId);
  return {
    compatible,
    active: compatible,
    cooldownMs: null,
    effects: compatible ? signDef.passive.effects : [],
  };
}
