import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAX_ROUNDS_DEFAULT,
  createBattle,
  calculateDamage,
  cooldownRounds,
  skillReadyRound,
  playerTurn,
  enemyTurn,
  runRound,
  simulateBattle,
  battleSkillsFromEffects,
} from '../src/features/rpg/services/battle-engine.js';
import { MAIN_CARDS } from '../src/features/rpg/config/card-config.js';

const NO_CRIT = () => 0.999999;
const ALWAYS_CRIT = () => 0.0;

const HERO = Object.freeze({
  level: 5,
  exp: 0,
  maxHp: 500,
  currentHp: 500,
  atk: 100,
  def: 20,
  critRate: 0,
  critDmg: 2.0,
});

function enemy(over = {}) {
  return {
    id: 'dummy',
    name: 'Dummy',
    behavior: 'basic',
    stats: { maxHp: 300, atk: 40, def: 10, critRate: 0, critDmg: 2.0, ...over },
  };
}

function skill(over = {}) {
  return {
    name: 'Power Strike',
    multiplier: 1.5,
    flatBonus: 0,
    defIgnore: 0,
    cooldownSec: 6,
    unlocked: true,
    upgraded: false,
    ...over,
  };
}

describe('battle creation', () => {
  it('1. creates a structured ongoing battle', () => {
    const s = createBattle({ playerStats: HERO, enemy: enemy() });
    assert.equal(s.round, 1);
    assert.equal(s.turn, 'PLAYER');
    assert.equal(s.status, 'ONGOING');
    assert.deepEqual(s.log, []);
    assert.ok(s.battleId);
  });

  it('2. snapshots player stats (later source changes do not leak in)', () => {
    const stats = { ...HERO };
    const s = createBattle({ playerStats: stats, enemy: enemy() });
    stats.atk = 9999;
    assert.equal(s.player.stats.atk, 100);
    assert.notEqual(s.player.stats, stats);
  });

  it('3. enemy starts at full HP from config', () => {
    const s = createBattle({ playerStats: HERO, enemy: enemy({ maxHp: 777 }) });
    assert.equal(s.enemy.hp, 777);
    assert.equal(s.enemy.stats.maxHp, 777);
  });

  it('refuses battle when player currentHp <= 0', () => {
    assert.throws(
      () =>
        createBattle({
          playerStats: { ...HERO, currentHp: 0 },
          enemy: enemy(),
        }),
      RangeError
    );
    assert.throws(
      () =>
        createBattle({
          playerStats: { ...HERO, currentHp: -5 },
          enemy: enemy(),
        }),
      RangeError
    );
  });

  it('26. battle state never aliases source final stats or config', () => {
    const stats = { ...HERO };
    const foe = enemy();
    const s = createBattle({ playerStats: stats, enemy: foe });
    assert.notEqual(s.player.stats, stats);
    assert.notEqual(s.enemy.stats, foe.stats);
  });
});

describe('damage calculation', () => {
  it('5. basic attack follows the formula (multiplier 1.0)', () => {
    // 100 atk vs 10 def: 100 * (100/110) = 90.909 -> 91
    const { damage, isCrit } = calculateDamage({
      atk: 100,
      def: 10,
      roll: 0.99,
    });
    assert.equal(damage, 91);
    assert.equal(isCrit, false);
  });

  it('6. DEF mitigation scales with defense', () => {
    const low = calculateDamage({ atk: 100, def: 0, roll: 0.99 });
    const high = calculateDamage({ atk: 100, def: 300, roll: 0.99 });
    assert.equal(low.damage, 100);
    assert.equal(high.damage, 25);
    assert.ok(high.damage < low.damage);
  });

  it('7. DEF Ignore reduces effective DEF (25% of 200 -> 150)', () => {
    const ignored = calculateDamage({
      atk: 100,
      def: 200,
      defIgnore: 0.25,
      roll: 0.99,
    });
    const plain = calculateDamage({ atk: 100, def: 150, roll: 0.99 });
    assert.equal(ignored.damage, plain.damage);
    assert.equal(ignored.damage, 40);
  });

  it('7b. DEF Ignore clamps to 0..1 and is not true damage', () => {
    const full = calculateDamage({
      atk: 100,
      def: 200,
      defIgnore: 1,
      roll: 0.99,
    });
    assert.equal(full.damage, 100);
    const over = calculateDamage({
      atk: 100,
      def: 200,
      defIgnore: 9,
      roll: 0.99,
    });
    assert.equal(over.damage, 100);
    const neg = calculateDamage({
      atk: 100,
      def: 200,
      defIgnore: -5,
      roll: 0.99,
    });
    assert.equal(
      neg.damage,
      calculateDamage({ atk: 100, def: 200, roll: 0.99 }).damage
    );
  });

  it('8. minimum damage is 1', () => {
    assert.equal(calculateDamage({ atk: 1, def: 9999, roll: 0.99 }).damage, 1);
    assert.equal(calculateDamage({ atk: 0, def: 9999, roll: 0.99 }).damage, 1);
  });

  it('9. normal attack without crit', () => {
    const r = calculateDamage({
      atk: 100,
      def: 10,
      critRate: 0.5,
      critDmg: 2,
      roll: 0.9,
    });
    assert.equal(r.isCrit, false);
    assert.equal(r.damage, 91);
  });

  it('10/13. crit multiplies damage by critDmg', () => {
    const r = calculateDamage({
      atk: 100,
      def: 10,
      critRate: 0.5,
      critDmg: 2.5,
      roll: 0.1,
    });
    assert.equal(r.isCrit, true);
    assert.equal(r.damage, Math.round(100 * (100 / 110) * 2.5));
  });

  it('11. crit rate 0 never crits', () => {
    assert.equal(
      calculateDamage({ atk: 100, def: 0, critRate: 0, roll: 0.0 }).isCrit,
      false
    );
  });

  it('12. crit rate 1 always crits', () => {
    assert.equal(
      calculateDamage({ atk: 100, def: 0, critRate: 1, roll: 0.999 }).isCrit,
      true
    );
  });

  it('11b/12b. crit rate clamps to 0..1', () => {
    assert.equal(
      calculateDamage({ atk: 50, def: 0, critRate: 5, roll: 0.99 }).isCrit,
      true
    );
    assert.equal(
      calculateDamage({ atk: 50, def: 0, critRate: -2, roll: 0.0 }).isCrit,
      false
    );
  });

  it('29. player and enemy share one damage path', () => {
    const p = createBattle({
      playerStats: { ...HERO, atk: 80, def: 30, maxHp: 400, currentHp: 400 },
      enemy: enemy({ maxHp: 400, atk: 80, def: 30 }),
    });
    const afterPlayer = playerTurn(p, 'basic_attack', 0.5);
    const dealtByPlayer = 400 - afterPlayer.enemy.hp;
    const afterEnemy = enemyTurn(p, 0.5);
    const dealtByEnemy = 400 - afterEnemy.player.hp;
    assert.equal(dealtByPlayer, dealtByEnemy);
  });
});

describe('turn order and rounds', () => {
  it('4. player attacks first within a round', () => {
    const s = createBattle({
      playerStats: HERO,
      enemy: enemy({ maxHp: 10000 }),
    });
    const next = runRound(s, 'basic_attack', NO_CRIT);
    assert.equal(next.log[0].actor, 'player');
    assert.equal(next.log[1].actor, 'enemy');
    assert.equal(next.log[0].round, 1);
  });

  it('24. round advances after both turns', () => {
    const s = createBattle({
      playerStats: HERO,
      enemy: enemy({ maxHp: 10000 }),
    });
    const next = runRound(s, 'basic_attack', NO_CRIT);
    assert.equal(next.round, 2);
    assert.equal(next.status, 'ONGOING');
    assert.equal(next.turn, 'PLAYER');
  });

  it('25. maxRounds defaults to 50 and ends in DRAW', () => {
    assert.equal(MAX_ROUNDS_DEFAULT, 50);
    const s = createBattle({
      playerStats: { ...HERO, atk: 1, maxHp: 100000, currentHp: 100000 },
      enemy: enemy({ maxHp: 100000, atk: 1, def: 0 }),
    });
    const end = simulateBattle(s, () => 'basic_attack', NO_CRIT);
    assert.equal(end.status, 'DRAW');
    assert.ok(end.round > 50);
  });
});

describe('active skills and cooldowns', () => {
  it('14. active skill damage uses its multiplier', () => {
    const s = createBattle({
      playerStats: HERO,
      enemy: enemy(),
      playerSkills: { active: skill({ multiplier: 2 }) },
    });
    const next = playerTurn(s, 'skill', NO_CRIT);
    assert.equal(next.log[0].action, 'skill');
    const basic = playerTurn(
      createBattle({ playerStats: HERO, enemy: enemy() }),
      'basic_attack',
      NO_CRIT
    );
    assert.ok(next.log[0].damage > basic.log[0].damage);
  });

  it('15/16. cooldown locks skill until the ready round (6s used R1 -> ready R4)', () => {
    assert.equal(cooldownRounds(6), 3);
    assert.equal(skillReadyRound(1, 6), 4);
    assert.equal(cooldownRounds(2), 1);
    assert.throws(() => cooldownRounds(0), RangeError);
    let s = createBattle({
      playerStats: HERO,
      enemy: enemy({ maxHp: 10000 }),
      playerSkills: { active: skill() },
    });
    s = playerTurn(s, 'skill', NO_CRIT);
    assert.equal(s.player.cooldowns.skill, 4);
    const r2 = { ...s, round: 2 };
    assert.equal(
      playerTurn(r2, 'skill', NO_CRIT).log.at(-1).action,
      'basic_attack'
    );
    const r4 = { ...s, round: 4 };
    assert.equal(playerTurn(r4, 'skill', NO_CRIT).log.at(-1).action, 'skill');
  });

  it('17. locked or missing skill falls back to basic attack', () => {
    const s = createBattle({ playerStats: HERO, enemy: enemy() });
    assert.equal(playerTurn(s, 'skill', NO_CRIT).log[0].action, 'basic_attack');
    const locked = createBattle({
      playerStats: HERO,
      enemy: enemy(),
      playerSkills: { active: skill() },
    });
    const used = playerTurn(locked, 'skill', NO_CRIT);
    assert.equal(
      playerTurn(used, 'skill', NO_CRIT).log.at(-1).action,
      'basic_attack'
    );
  });
});

describe('passives and triggers', () => {
  function withPassive(mods, trigger = 'attack', name = 'Test Passive') {
    return createBattle({
      playerStats: HERO,
      enemy: enemy({ maxHp: 10000 }),
      playerSkills: {
        passives: [
          { name, source: 'test', trigger, modifiers: mods, effects: [] },
        ],
      },
    });
  }

  it('18. attack-trigger passive modifies outgoing damage and is logged', () => {
    const plain = playerTurn(
      createBattle({ playerStats: HERO, enemy: enemy({ maxHp: 10000 }) }),
      'basic_attack',
      NO_CRIT
    );
    const buffed = playerTurn(
      withPassive({ damageMult: 1.5 }),
      'basic_attack',
      NO_CRIT
    );
    assert.ok(buffed.log[0].damage > plain.log[0].damage);
    assert.ok(buffed.log[0].triggered.includes('Test Passive'));
    assert.deepEqual(plain.log[0].triggered, []);
  });

  it('18b. defend-trigger passive only guards incoming damage', () => {
    const guard = createBattle({
      playerStats: { ...HERO, maxHp: 10000, currentHp: 10000 },
      enemy: enemy(),
      playerSkills: {
        passives: [
          {
            name: 'Guard',
            source: 'test',
            trigger: 'defend',
            modifiers: { guardMult: 0.5 },
            effects: [],
          },
        ],
      },
    });
    const hit = enemyTurn(guard, NO_CRIT);
    const plain = enemyTurn(
      createBattle({
        playerStats: { ...HERO, maxHp: 10000, currentHp: 10000 },
        enemy: enemy(),
      }),
      NO_CRIT
    );
    assert.ok(hit.log[0].damage < plain.log[0].damage);
    // Same guard does not boost our own attacks.
    const atk = playerTurn(guard, 'basic_attack', NO_CRIT);
    assert.deepEqual(atk.log[0].triggered, []);
  });

  it('18c. unknown trigger is rejected at battle creation', () => {
    assert.throws(() => withPassive({}, 'midnight'), RangeError);
  });
});

describe('enemy AI', () => {
  it('19. basic behavior always basic-attacks', () => {
    const s = createBattle({
      playerStats: { ...HERO, maxHp: 10000, currentHp: 10000 },
      enemy: { ...enemy(), behavior: 'basic' },
      enemySkills: {
        active: {
          name: 'Smash',
          multiplier: 9,
          cooldownSec: 2,
          unlocked: true,
        },
      },
    });
    assert.equal(enemyTurn(s, NO_CRIT).log[0].action, 'basic_attack');
  });

  it('20. skill_based uses skill when ready, else basic', () => {
    const foe = { ...enemy(), behavior: 'skill_based' };
    const skills = {
      active: { name: 'Smash', multiplier: 3, cooldownSec: 4, unlocked: true },
    };
    const s = createBattle({
      playerStats: { ...HERO, maxHp: 10000, currentHp: 10000 },
      enemy: foe,
      enemySkills: skills,
    });
    const first = enemyTurn(s, NO_CRIT);
    assert.equal(first.log[0].action, 'skill');
    assert.equal(enemyTurn(first, NO_CRIT).log.at(-1).action, 'basic_attack');
  });

  it('rejects unknown behavior', () => {
    const s = createBattle({
      playerStats: HERO,
      enemy: { ...enemy(), behavior: 'genius' },
    });
    assert.throws(() => enemyTurn(s, NO_CRIT), RangeError);
  });
});

describe('battle end', () => {
  it('21/23. enemy death ends battle in WIN with no counterattack', () => {
    const s = createBattle({ playerStats: HERO, enemy: enemy({ maxHp: 10 }) });
    const next = runRound(s, 'basic_attack', NO_CRIT);
    assert.equal(next.status, 'WIN');
    assert.equal(next.log.length, 1);
    assert.equal(next.log[0].actor, 'player');
  });

  it('22. player death ends battle in LOSE', () => {
    const s = createBattle({
      playerStats: { ...HERO, maxHp: 10, currentHp: 10 },
      enemy: enemy({ atk: 500 }),
    });
    const next = runRound(s, 'basic_attack', NO_CRIT);
    assert.equal(next.status, 'LOSE');
  });

  it('terminal battles ignore further turns', () => {
    const s = createBattle({ playerStats: HERO, enemy: enemy({ maxHp: 10 }) });
    const won = runRound(s, 'basic_attack', NO_CRIT);
    assert.equal(playerTurn(won, 'skill', ALWAYS_CRIT).status, 'WIN');
    assert.equal(enemyTurn(won, ALWAYS_CRIT).status, 'WIN');
  });
});

describe('persistence and log', () => {
  it('27. engine has no database/message/timer dependencies', async () => {
    const { readFile } = await import('node:fs/promises');
    const src = await readFile(
      new URL('../src/features/rpg/services/battle-engine.js', import.meta.url),
      'utf8'
    );
    for (const banned of [
      '#storage',
      'baileys',
      'whatsapp',
      'setTimeout',
      'setInterval',
      'sendMessage',
      'inventory',
      'wallet',
    ]) {
      assert.ok(!src.includes(banned), `banned reference: ${banned}`);
    }
  });

  it('28. structured log entries carry round/actor/action/crit/damage/hp', () => {
    const s = createBattle({ playerStats: HERO, enemy: enemy() });
    const next = runRound(s, 'basic_attack', NO_CRIT);
    for (const entry of next.log) {
      assert.ok(Number.isInteger(entry.round));
      assert.ok(['player', 'enemy'].includes(entry.actor));
      assert.ok(['basic_attack', 'skill'].includes(entry.action));
      assert.equal(typeof entry.isCrit, 'boolean');
      assert.ok(entry.damage >= 1);
      assert.ok(entry.targetHp >= 0);
      assert.ok(!('text' in entry || 'message' in entry));
    }
  });
});

describe('skill-config adapter', () => {
  const fx = (over = {}) => ({
    source: 'main-active',
    cardId: 'girgas',
    name: 'Lollipop Crash',
    upgraded: false,
    cooldownMs: 8000,
    effects: [{ stat: 'atk', mode: 'pct', value: 0.1 }],
    ...over,
  });

  it('derives active multiplier and cooldown from existing config', () => {
    const { active, passives } = battleSkillsFromEffects([fx()]);
    assert.equal(active.multiplier, 1.1);
    assert.equal(active.cooldownSec, 8);
    assert.deepEqual(passives, []);
    const up = battleSkillsFromEffects([
      fx({
        upgraded: true,
        effects: [{ stat: 'atk', mode: 'pct', value: 0.25 }],
      }),
    ]);
    assert.equal(up.active.multiplier, 1.25);
  });

  it('maps passives generically without card branches', () => {
    const { active, passives } = battleSkillsFromEffects([
      fx({
        source: 'main-passive',
        name: 'Sugar Rush',
        effects: [{ stat: 'critRate', mode: 'add', value: 0.05 }],
      }),
      fx({
        source: 'sign-passive',
        cardId: 'girgas_sign',
        name: 'Drive',
        effects: [{ stat: 'def', mode: 'pct', value: 0.1 }],
      }),
    ]);
    assert.equal(active, null);
    assert.deepEqual(
      passives.map((p) => p.trigger),
      ['attack', 'defend']
    );
    assert.deepEqual(passives[0].modifiers, { critRateBonus: 0.05 });
    assert.deepEqual(passives[1].modifiers, { guardMult: 0.9 });
  });

  it('30. every existing main card adapts with no card-id logic', () => {
    for (const [id, def] of Object.entries(MAIN_CARDS)) {
      const { active } = battleSkillsFromEffects([
        {
          source: 'main-active',
          cardId: id,
          name: def.active.name,
          upgraded: false,
          cooldownMs: def.active.cooldownMs,
          effects: def.active.effects,
        },
      ]);
      assert.ok(active.multiplier >= 1, id);
      assert.equal(active.cooldownSec, def.active.cooldownMs / 1000);
    }
  });
});
