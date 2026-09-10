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

export function mainSkillState(mainDef, level) {
  if (!mainDef || mainDef.kind !== 'main') {
    throw new RangeError('main card definition required');
  }
  return {
    active: resolveSkillState(mainDef.active, level),
    passive: resolveSkillState(mainDef.passive, level),
  };
}

export function isSignCompatible(signDef, equippedMainCardId) {
  if (!signDef || signDef.kind !== 'sign') {
    throw new RangeError('sign card definition required');
  }
  return equippedMainCardId === signDef.compatibleCard;
}

export function signPassiveState(signDef, equippedMainCardId) {
  const compatible = isSignCompatible(signDef, equippedMainCardId);
  return {
    compatible,
    active: compatible,
    cooldownMs: null,
    effects: compatible ? signDef.passive.effects : [],
  };
}
