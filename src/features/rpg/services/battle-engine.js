export const MAX_ROUNDS_DEFAULT = 50;
export const ROUND_SECONDS = 2;

const SUPPORTED_TRIGGERS = Object.freeze([
  'battle_start',
  'attack',
  'defend',
  'hit',
  'crit',
  'damage_taken',
]);

function assertTrigger(trigger) {
  if (!SUPPORTED_TRIGGERS.includes(trigger)) {
    throw new RangeError(`unsupported passive trigger: ${trigger}`);
  }
}

const CONDITION_SIDES = Object.freeze(['self', 'enemy']);
const CONDITION_KEYS = Object.freeze(['hp', 'maxHp', 'atk', 'def']);
const CONDITION_OPS = Object.freeze(['>', '>=', '<', '<=', '==']);

function assertCondition(condition) {
  if (!condition) return;
  for (const operand of [condition.left, condition.right]) {
    if (!CONDITION_SIDES.includes(operand?.side)) {
      throw new RangeError(`unsupported condition side: ${operand?.side}`);
    }
    if (!CONDITION_KEYS.includes(operand?.key)) {
      throw new RangeError(`unsupported condition key: ${operand?.key}`);
    }
  }
  if (!CONDITION_OPS.includes(condition.op)) {
    throw new RangeError(`unsupported condition op: ${condition.op}`);
  }
}

function resolveOperand(operand, ctx) {
  const side = operand.side === 'enemy' ? ctx.foe : ctx.self;
  if (!side) throw new RangeError('condition needs battle context');
  switch (operand.key) {
    case 'hp':
      return side.hp;
    case 'maxHp':
      return side.stats.maxHp;
    case 'atk':
      return side.stats.atk;
    case 'def':
      return side.stats.def;
    default:
      throw new RangeError(`unsupported condition key: ${operand.key}`);
  }
}

function conditionMet(condition, ctx) {
  if (!condition) return true;
  if (!ctx) return false;
  assertCondition(condition);
  const left = resolveOperand(condition.left, ctx);
  const right = resolveOperand(condition.right, ctx);
  switch (condition.op) {
    case '>':
      return left > right;
    case '>=':
      return left >= right;
    case '<':
      return left < right;
    case '<=':
      return left <= right;
    case '==':
      return left === right;
    default:
      throw new RangeError(`unsupported condition op: ${condition.op}`);
  }
}

function snapStats(stats, label) {
  const s = { ...stats };
  for (const key of ['maxHp', 'atk', 'def']) {
    if (!Number.isFinite(s[key]))
      throw new RangeError(`${label} needs numeric ${key}`);
  }
  s.critRate = Number.isFinite(s.critRate) ? s.critRate : 0;
  // Default critDmg 1.5 matches boss convention (domain/orbital) and stays
  // close to player base 1.3; previously 2.0 spiked crits on missing values.
  s.critDmg = Number.isFinite(s.critDmg) ? s.critDmg : 1.5;
  return Object.freeze({ ...s });
}

function snapSide(side, label) {
  return {
    stats: snapStats(side.stats, label),
    hp: side.hp,
    cooldowns: { ...(side.cooldowns ?? {}) },
    activeEffects: (side.activeEffects ?? []).map((e) => ({ ...e })),
  };
}

function cloneState(state) {
  return {
    ...state,
    player: snapSide(state.player, 'player'),
    enemy: snapSide(state.enemy, 'enemy'),
    playerSkills: state.playerSkills
      ? JSON.parse(JSON.stringify(state.playerSkills))
      : null,
    enemySkills: state.enemySkills
      ? JSON.parse(JSON.stringify(state.enemySkills))
      : null,
    log: [...state.log],
  };
}

let battleSeq = 0;

export function createBattle({
  playerStats,
  enemy,
  playerSkills = null,
  enemySkills = null,
  maxRounds = MAX_ROUNDS_DEFAULT,
  battleId = null,
  round = 1,
} = {}) {
  if (!playerStats) throw new RangeError('playerStats is required');
  if (!enemy?.stats) throw new RangeError('enemy with stats is required');
  const playerHp = playerStats.currentHp ?? playerStats.maxHp;
  if (!(playerHp > 0))
    throw new RangeError('battle cannot start with currentHp <= 0');
  const enemyMax = enemy.stats.maxHp;
  if (!(enemyMax > 0)) throw new RangeError('enemy needs maxHp > 0');

  battleSeq += 1;
  for (const p of [
    ...(playerSkills?.passives ?? []),
    ...(enemySkills?.passives ?? []),
  ]) {
    assertTrigger(p.trigger);
    assertCondition(p.condition);
  }
  const state = {
    battleId: battleId ?? `battle_${Date.now()}_${battleSeq}`,
    round,
    turn: 'PLAYER',
    status: 'ONGOING',
    maxRounds,
    player: {
      stats: snapStats(playerStats, 'player'),
      hp: playerHp,
      cooldowns: {},
      activeEffects: [...(playerSkills?.passives ?? [])],
    },
    enemy: {
      stats: snapStats(enemy.stats, 'enemy'),
      hp: enemyMax,
      cooldowns: {},
      activeEffects: [...(enemySkills?.passives ?? [])],
    },
    playerSkills: playerSkills?.active ? { ...playerSkills.active } : null,
    enemySkills: enemySkills?.active ? { ...enemySkills.active } : null,
    enemyMeta: {
      id: enemy.id ?? null,
      name: enemy.name ?? 'Enemy',
      behavior: enemy.behavior ?? 'basic',
    },
    log: [],
  };
  applyTriggerEffects(state, 'player', 'battle_start');
  applyTriggerEffects(state, 'enemy', 'battle_start');
  return state;
}

export function calculateDamage({
  atk,
  skillMultiplier = 1,
  def = 0,
  defIgnore = 0,
  critRate = 0,
  critDmg = 2.0,
  roll = Math.random(),
} = {}) {
  const rate = Math.min(1, Math.max(0, critRate));
  const ignore = Math.min(1, Math.max(0, defIgnore));
  const effectiveDef = Math.max(0, def) * (1 - ignore);
  const defMultiplier = 100 / (100 + effectiveDef);
  const isCrit = roll < rate;
  let damage = Math.max(0, atk) * skillMultiplier * defMultiplier;
  if (isCrit) damage *= Math.max(0, critDmg);
  return { damage: Math.max(1, Math.round(damage)), isCrit };
}

export function cooldownRounds(cooldownSec) {
  if (!(cooldownSec > 0)) throw new RangeError('cooldownSec must be positive');
  return Math.ceil(cooldownSec / ROUND_SECONDS);
}

export function skillReadyRound(usedRound, cooldownSec) {
  return usedRound + cooldownRounds(cooldownSec);
}

export function autoSkillAction(state) {
  const skills = state?.playerSkills;
  if (!skills || skills.unlocked === false) return 'basic_attack';
  if (!Number.isFinite(skills.cooldownSec) || !(skills.cooldownSec > 0)) {
    return 'basic_attack';
  }
  return (state.player.cooldowns.skill ?? 1) <= state.round
    ? 'skill'
    : 'basic_attack';
}

function collectMods(side, trigger, ctx = null) {
  const mods = {
    damageMult: 1,
    flatBonus: 0,
    defIgnore: 0,
    critRateBonus: 0,
    critDmgBonus: 0,
    guardMult: 1,
  };
  const fired = [];
  for (const p of side.activeEffects) {
    if (p.trigger !== trigger) continue;
    assertTrigger(p.trigger);
    if (
      p.expiresRound !== undefined &&
      Number.isFinite(ctx?.round) &&
      ctx.round > p.expiresRound
    ) {
      continue;
    }
    if (!conditionMet(p.condition, ctx)) continue;
    const m = p.modifiers ?? {};
    if (m.damageMult) mods.damageMult *= m.damageMult;
    if (m.flatBonus) mods.flatBonus += m.flatBonus;
    if (m.defIgnore) mods.defIgnore += m.defIgnore;
    if (m.critRateBonus) mods.critRateBonus += m.critRateBonus;
    if (m.critDmgBonus) mods.critDmgBonus += m.critDmgBonus;
    if (m.guardMult) mods.guardMult *= m.guardMult;
    fired.push(p.name ?? p.source ?? 'passive');
  }
  return { mods, fired };
}

function applyTriggerEffects(state, owner, trigger) {
  const side = owner === 'player' ? state.player : state.enemy;
  const foe = owner === 'player' ? state.enemy : state.player;
  // Battle-start stat modifiers (e.g. HP passive -> bigger Max HP pool).
  // Applied once at createBattle; stats objects are frozen so replace them.
  if (trigger === 'battle_start') {
    let mult = 1;
    let flat = 0;
    for (const p of side.activeEffects) {
      if (p.trigger !== 'battle_start') continue;
      const m = p.modifiers ?? {};
      if (m.maxHpMult) mult *= m.maxHpMult;
      if (m.maxHpBonus) flat += m.maxHpBonus;
    }
    if (mult !== 1 || flat !== 0) {
      const bonus =
        Math.round(side.stats.maxHp * (mult - 1)) + Math.round(flat);
      if (bonus !== 0) {
        const maxHp = Math.max(1, side.stats.maxHp + bonus);
        side.stats = { ...side.stats, maxHp };
        side.hp = Math.min(maxHp, side.hp + Math.max(0, bonus));
      }
    }
  }
  for (const p of side.activeEffects) {
    if (p.trigger !== trigger) continue;
    assertTrigger(trigger);
    for (const fx of p.effects ?? []) {
      if (fx.type === 'damage') {
        foe.hp = Math.max(0, foe.hp - Math.max(0, fx.value));
      } else if (fx.type === 'heal') {
        side.hp = Math.min(side.stats.maxHp, side.hp + Math.max(0, fx.value));
      }
    }
  }
}

function resolveAction(skills, cooldowns, round, wanted) {
  if (
    wanted === 'skill' &&
    skills?.unlocked !== false &&
    skills &&
    Number.isFinite(skills.cooldownSec) &&
    (cooldowns.skill ?? 1) <= round
  ) {
    return {
      action: 'skill',
      name: skills.name ?? 'Active Skill',
      multiplier: skills.multiplier ?? 1,
      flatBonus: skills.flatBonus ?? 0,
      defIgnore: skills.defIgnore ?? 0,
      buffs: skills.buffs ?? [],
      cooldownSec: skills.cooldownSec,
    };
  }
  return {
    action: 'basic_attack',
    name: null,
    multiplier: 1,
    flatBonus: 0,
    defIgnore: 0,
    buffs: [],
    cooldownSec: 0,
  };
}

function takeTurn(state, side, skillsKey, action, roll) {
  const next = cloneState(state);
  const me = side === 'player' ? next.player : next.enemy;
  const target = side === 'player' ? next.enemy : next.player;
  const skills = next[skillsKey];
  next.turn = side === 'player' ? 'PLAYER' : 'ENEMY';

  const resolved = resolveAction(skills, me.cooldowns, next.round, action);
  const atk = collectMods(me, 'attack', {
    self: me,
    foe: target,
    round: next.round,
  });
  const guard = collectMods(target, 'defend', {
    self: target,
    foe: me,
    round: next.round,
  });

  const { damage, isCrit } = calculateDamage({
    atk: me.stats.atk,
    skillMultiplier: resolved.multiplier * atk.mods.damageMult,
    def: target.stats.def,
    defIgnore: resolved.defIgnore + atk.mods.defIgnore,
    critRate: me.stats.critRate + atk.mods.critRateBonus,
    critDmg: me.stats.critDmg + atk.mods.critDmgBonus,
    roll,
  });
  const guarded = Math.max(1, Math.round(damage * guard.mods.guardMult));
  const total = guarded + atk.mods.flatBonus;
  target.hp = Math.max(0, target.hp - total);

  if (resolved.action === 'skill') {
    me.cooldowns.skill = skillReadyRound(next.round, resolved.cooldownSec);
    for (const buff of resolved.buffs ?? []) {
      me.activeEffects.push({
        ...buff,
        modifiers: { ...(buff.modifiers ?? {}) },
        expiresRound: next.round + (buff.durationRounds ?? 1),
      });
    }
  }

  const entry = {
    round: next.round,
    actor: side,
    action: resolved.action,
    ...(resolved.name ? { skill: resolved.name } : {}),
    isCrit,
    damage: total,
    targetHp: target.hp,
    triggered: [...atk.fired, ...guard.fired],
  };

  applyTriggerEffects(next, side, 'hit');
  if (isCrit) applyTriggerEffects(next, side, 'crit');
  applyTriggerEffects(
    next,
    side === 'player' ? 'enemy' : 'player',
    'damage_taken'
  );
  const foeAfter = side === 'player' ? next.enemy : next.player;
  entry.targetHp = foeAfter.hp;
  next.log.push(entry);

  if (foeAfter.hp <= 0) {
    next.status = side === 'player' ? 'WIN' : 'LOSE';
  }
  return next;
}

export function playerTurn(
  state,
  action = 'basic_attack',
  roll = Math.random()
) {
  if (state.status !== 'ONGOING') return cloneState(state);
  return takeTurn(state, 'player', 'playerSkills', action, roll);
}

export function enemyTurn(state, roll = Math.random()) {
  if (state.status !== 'ONGOING') return cloneState(state);
  const behavior = state.enemyMeta.behavior;
  if (behavior !== 'basic' && behavior !== 'skill_based') {
    throw new RangeError(`unknown enemy behavior: ${behavior}`);
  }
  const want = behavior === 'basic' ? 'basic_attack' : 'skill';
  return takeTurn(state, 'enemy', 'enemySkills', want, roll);
}

export function runRound(
  state,
  playerAction = 'basic_attack',
  roll = Math.random()
) {
  let next = playerTurn(
    state,
    playerAction,
    typeof roll === 'function' ? roll() : roll
  );
  if (next.status !== 'ONGOING') return next;
  const enemyRoll = typeof roll === 'function' ? roll() : roll;
  next = enemyTurn(next, enemyRoll);
  if (next.status !== 'ONGOING') return next;
  next = cloneState(next);
  next.round += 1;
  next.turn = 'PLAYER';
  if (next.round > next.maxRounds) next.status = 'DRAW';
  return next;
}

export function simulateBattle(
  state,
  chooseAction = () => 'basic_attack',
  roll = Math.random()
) {
  let next = cloneState(state);
  let guard = next.maxRounds + 5;
  while (next.status === 'ONGOING' && guard > 0) {
    const r = typeof roll === 'function' ? roll : () => roll;
    next = runRound(next, chooseAction(next), r);
    guard -= 1;
  }
  return next;
}

export function battleSkillsFromEffects(activeEffects = []) {
  let active = null;
  const passives = [];
  for (const entry of activeEffects) {
    if (entry.source === 'main-active') {
      // Any pct stat (atk/def/hp) contributes to the skill damage
      // multiplier; any add stat contributes flat bonus. Previously only
      // atk was read, so Daisy (def-scaling active) silently hit for 1.0x.
      // defIgnore is armor penetration instead: instant on the skill hit,
      // or a timed basic-attack buff when durationSec is set (virtual time
      // via cooldownRounds, same as cooldowns).
      let pct = 0;
      let flat = 0;
      let defIgnore = 0;
      const buffs = [];
      for (const fx of entry.effects ?? []) {
        if (fx.stat === 'defIgnore' && fx.mode === 'pct') {
          if (fx.durationSec != null) {
            buffs.push({
              name: entry.name,
              source: 'active-buff',
              trigger: 'attack',
              modifiers: { defIgnore: fx.value },
              durationRounds: cooldownRounds(fx.durationSec / 1000),
            });
          } else {
            defIgnore += fx.value;
          }
          continue;
        }
        if (fx.mode === 'pct') pct += fx.value;
        if (fx.mode === 'add') flat += fx.value;
      }
      active = {
        name: entry.name,
        multiplier: 1 + pct,
        flatBonus: flat,
        defIgnore,
        buffs,
        cooldownSec: (entry.cooldownMs ?? 0) / 1000,
        unlocked: true,
        upgraded: !!entry.upgraded,
      };
    } else if (
      entry.source === 'main-passive' ||
      entry.source === 'sign-passive'
    ) {
      for (const fx of entry.effects ?? []) {
        passives.push(translateStatEffect(entry, fx));
      }
    }
  }
  return { active, passives };
}

function translateStatEffect(entry, fx) {
  if (fx.condition) assertCondition(fx.condition);
  const base = {
    name: entry.name,
    source: entry.source,
    modifiers: {},
    effects: [],
    ...(fx.condition ? { condition: fx.condition } : {}),
  };
  switch (fx.stat) {
    case 'defIgnore':
      return {
        ...base,
        trigger: 'attack',
        modifiers: { defIgnore: fx.value },
      };
    case 'critRate':
      return {
        ...base,
        trigger: 'attack',
        modifiers: { critRateBonus: fx.value },
      };
    case 'critDmg':
      return {
        ...base,
        trigger: 'attack',
        modifiers: { critDmgBonus: fx.value },
      };
    case 'atk':
      return fx.mode === 'pct'
        ? {
            ...base,
            trigger: 'attack',
            modifiers: { damageMult: 1 + fx.value },
          }
        : { ...base, trigger: 'attack', modifiers: { flatBonus: fx.value } };
    case 'def':
      return {
        ...base,
        trigger: 'defend',
        modifiers: {
          guardMult: fx.mode === 'pct' ? 1 - fx.value : 1 - fx.value / 100,
        },
      };
    case 'hp':
      // HP passive = bigger Max HP pool at battle start (distinct from DEF
      // guard). Previously hp collapsed into guardMult, identical to def.
      return fx.mode === 'pct'
        ? {
            ...base,
            trigger: 'battle_start',
            modifiers: { maxHpMult: 1 + fx.value },
          }
        : {
            ...base,
            trigger: 'battle_start',
            modifiers: { maxHpBonus: fx.value },
          };
    default:
      throw new RangeError(
        `cannot translate skill stat for battle: ${fx.stat}`
      );
  }
}
