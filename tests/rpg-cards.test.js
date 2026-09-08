import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  MAIN_MAX_LEVEL,
  MAIN_MILESTONES,
  CARD_LEVELING,
  CERELIA_ITEM,
  MAIN_CARDS,
  SIGN_CARDS,
  maxLevelFor,
  getMainCard,
  getSignCard,
  getCardDefinition,
  cardKind,
  cardStatsAtLevel,
  levelStepCost,
  bulkLevelCost,
  affordableLevels,
} from '../src/features/rpg/config/card-config.js';
import {
  resolveSkillState,
  mainSkillState,
  isSignCompatible,
  signPassiveState,
} from '../src/features/rpg/services/skill-engine.js';
import { enrichCard } from '../src/features/rpg/services/card-service.js';

describe('card config structure', () => {
  it('defines readable main card ids with full skill data', () => {
    for (const id of ['girgas', 'lena', 'ameris', 'daisy']) {
      const def = getMainCard(id);
      assert.ok(def, id);
      assert.equal(def.kind, 'main');
      assert.ok(def.name && def.role);
      assert.ok(def.base.hp > 0 && def.base.atk > 0 && def.base.def > 0);
      assert.ok(def.active.name && def.active.effects.length > 0);
      assert.ok(def.passive.name && def.passive.effects.length > 0);
    }
    assert.equal(getMainCard('nope'), null);
  });

  it('defines sign cards with compatibleCard and ATK/DEF only', () => {
    for (const [id, def] of Object.entries(SIGN_CARDS)) {
      assert.equal(def.kind, 'sign');
      assert.ok(def.compatibleCard, id);
      assert.ok(getMainCard(def.compatibleCard), `${id} points at a real main`);
      assert.deepEqual(Object.keys(def.base).sort(), ['atk', 'def']);
      assert.ok(def.passive.name && def.passive.effects.length > 0);
    }
    assert.equal(getSignCard('nope'), null);
  });

  it('resolves kinds without branching', () => {
    assert.equal(cardKind('girgas'), 'main');
    assert.equal(cardKind('girgas_sign'), 'sign');
    assert.equal(cardKind('nope'), null);
    assert.equal(getCardDefinition('lena').id, 'lena');
    assert.equal(getCardDefinition('nope'), null);
    assert.equal(maxLevelFor('main'), 100);
    assert.equal(maxLevelFor('sign'), 50);
    assert.throws(() => maxLevelFor('support'), RangeError);
  });

  it('exposes the standard 4 milestones', () => {
    assert.deepEqual(MAIN_MILESTONES, [
      { level: 25, type: 'unlock', skill: 'active' },
      { level: 50, type: 'unlock', skill: 'passive' },
      { level: 75, type: 'upgrade', skill: 'active' },
      { level: 100, type: 'upgrade', skill: 'passive' },
    ]);
  });

  it('defines Cerelia with a future shop price and no shop tables', () => {
    assert.equal(CERELIA_ITEM.id, 'cerelia');
    assert.equal(CARD_LEVELING.materialId, 'cerelia');
  });
});

describe('stat scaling', () => {
  it('starts at base on Lv.1 and grows monotonically to max', () => {
    for (const def of Object.values(MAIN_CARDS)) {
      const max = maxLevelFor('main');
      const l1 = cardStatsAtLevel(def, 1);
      assert.deepEqual(l1, {
        hp: def.base.hp,
        atk: def.base.atk,
        def: def.base.def,
      });
      let prev = l1;
      for (const lv of [25, 50, 75, 100]) {
        const cur = cardStatsAtLevel(def, lv);
        assert.ok(
          cur.hp >= prev.hp && cur.atk >= prev.atk && cur.def >= prev.def,
          `${def.id}@${lv}`
        );
        prev = cur;
      }
      assert.ok(cardStatsAtLevel(def, max).hp > l1.hp);
    }
  });

  it('sign cards scale ATK/DEF only up to Lv.50', () => {
    const def = getSignCard('girgas_sign');
    const l1 = cardStatsAtLevel(def, 1);
    assert.deepEqual(Object.keys(l1).sort(), ['atk', 'def']);
    assert.deepEqual(l1, { atk: def.base.atk, def: def.base.def });
    const l50 = cardStatsAtLevel(def, 50);
    assert.ok(l50.atk > l1.atk && l50.def > l1.def);
    assert.throws(() => cardStatsAtLevel(def, 0), RangeError);
    assert.throws(() => cardStatsAtLevel(def, 51), RangeError);
  });

  it('rejects out-of-range main levels', () => {
    const def = getMainCard('daisy');
    assert.throws(() => cardStatsAtLevel(def, 0), RangeError);
    assert.throws(() => cardStatsAtLevel(def, 101), RangeError);
    assert.throws(() => cardStatsAtLevel(null, 1), RangeError);
  });
});

describe('leveling costs', () => {
  it('charges coin + cerelia per step, none at max', () => {
    const step = levelStepCost(1, MAIN_MAX_LEVEL);
    assert.deepEqual(step, {
      coin: CARD_LEVELING.coinBase + CARD_LEVELING.coinPerLevel * 0,
      cerelia:
        CARD_LEVELING.cereliaBase + Math.floor(0 / CARD_LEVELING.cereliaEvery),
      materialId: 'cerelia',
    });
    assert.equal(levelStepCost(100, MAIN_MAX_LEVEL), null);
    assert.throws(() => levelStepCost(0, 100), RangeError);
  });

  it('bulk cost caps at max and stays deterministic', () => {
    const a = bulkLevelCost(98, 10, MAIN_MAX_LEVEL);
    assert.deepEqual(
      { levels: a.levels, toLevel: a.toLevel },
      { levels: 2, toLevel: 100 }
    );
    assert.deepEqual(bulkLevelCost(98, 10, MAIN_MAX_LEVEL), a);
    const one = levelStepCost(99, MAIN_MAX_LEVEL);
    assert.equal(a.coin, levelStepCost(98, 100).coin + one.coin);
  });

  it('affordable levels stop when coin or cerelia runs out', () => {
    const broke = affordableLevels(1, 0, 0, MAIN_MAX_LEVEL);
    assert.equal(broke.levels, 0);
    const step = levelStepCost(1, MAIN_MAX_LEVEL);
    const exact = affordableLevels(1, step.coin, step.cerelia, MAIN_MAX_LEVEL);
    assert.equal(exact.levels, 1);
    assert.equal(exact.toLevel, 2);
  });
});

describe('skill engine', () => {
  it('gates main skills by milestone', () => {
    const def = getMainCard('ameris');
    const l1 = mainSkillState(def, 1);
    assert.equal(l1.active.unlocked, false);
    assert.equal(l1.passive.unlocked, false);
    const l25 = mainSkillState(def, 25);
    assert.equal(l25.active.unlocked, true);
    assert.equal(l25.active.upgraded, false);
    assert.deepEqual(l25.active.effects, def.active.effects);
    const l75 = mainSkillState(def, 75);
    assert.equal(l75.active.upgraded, true);
    assert.deepEqual(l75.active.effects, def.active.upgradedEffects);
    const l50 = mainSkillState(def, 50);
    assert.equal(l50.passive.unlocked, true);
    assert.equal(l50.passive.upgraded, false);
    const l100 = mainSkillState(def, 100);
    assert.equal(l100.passive.upgraded, true);
    assert.deepEqual(l100.passive.effects, def.passive.upgradedEffects);
  });

  it('gives every active skill a cooldown, no cooldown on passives', () => {
    for (const def of Object.values(MAIN_CARDS)) {
      const state = mainSkillState(def, 100);
      assert.ok(
        Number.isInteger(state.active.cooldownMs) && state.active.cooldownMs > 0
      );
      assert.equal(state.passive.cooldownMs, null);
    }
    assert.throws(() => resolveSkillState(null, 10), RangeError);
    assert.throws(
      () => mainSkillState(getSignCard('girgas_sign'), 10),
      RangeError
    );
  });

  it('gates sign passives on compatibleCard only', () => {
    const sign = getSignCard('girgas_sign');
    assert.equal(isSignCompatible(sign, 'girgas'), true);
    assert.equal(isSignCompatible(sign, 'daisy'), false);
    assert.equal(isSignCompatible(sign, null), false);
    const on = signPassiveState(sign, 'girgas');
    assert.equal(on.active, true);
    assert.equal(on.cooldownMs, null);
    assert.deepEqual(on.effects, sign.passive.effects);
    const off = signPassiveState(sign, 'daisy');
    assert.equal(off.active, false);
    assert.deepEqual(off.effects, []);
    assert.throws(
      () => isSignCompatible(getMainCard('girgas'), 'girgas'),
      RangeError
    );
  });
});

describe('enrichCard', () => {
  it('attaches definition, stats, and skill state', () => {
    const card = enrichCard(
      { user_id: 'u', card_id: 'lena', level: 30, equipped: 1 },
      'main'
    );
    assert.equal(card.cardId, 'lena');
    assert.equal(card.equipped, true);
    assert.deepEqual(card.stats, cardStatsAtLevel(getMainCard('lena'), 30));
    assert.equal(card.skills.active.unlocked, true);
    assert.equal(card.skills.passive.unlocked, false);
    const sign = enrichCard(
      { user_id: 'u', card_id: 'lena_sign', level: 5, equipped: 0 },
      'sign'
    );
    assert.equal(sign.equipped, false);
    assert.deepEqual(sign.stats, cardStatsAtLevel(getSignCard('lena_sign'), 5));
    assert.equal(sign.passive.name, getSignCard('lena_sign').passive.name);
    assert.equal(enrichCard(null, 'main'), null);
    assert.throws(
      () => enrichCard({ card_id: 'nope', level: 1 }, 'main'),
      RangeError
    );
  });
});

describe('rpg foundation untouched', () => {
  it('keeps base-stat defaults independent from cards', async () => {
    const { defaultRpgStats } =
      await import('../src/features/rpg/config/stats-config.js');
    assert.deepEqual(Object.keys(defaultRpgStats()).sort(), [
      'atk',
      'crit_dmg',
      'crit_rate',
      'current_hp',
      'def',
      'exp',
      'level',
      'max_hp',
    ]);
  });
});
