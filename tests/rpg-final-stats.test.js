import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { createFinalStatService } from '../src/features/rpg/services/final-stat-service.js';

const BASE = Object.freeze({
  userId: 'u',
  level: 3,
  exp: 120,
  maxHp: 100,
  currentHp: 80,
  atk: 10,
  def: 5,
  critRate: 0.05,
  critDmg: 2.0,
});

function stubService({
  base = BASE,
  bonuses = { main: null, sign: null },
  calls = null,
} = {}) {
  return createFinalStatService({
    statService: {
      getBaseStats: async (userId) => {
        if (calls) calls.base.push(userId);
        return base;
      },
    },
    cardService: {
      getCardBonuses: async (userId) => {
        if (calls) calls.bonuses.push(userId);
        return bonuses;
      },
    },
  });
}

describe('getFinalStats (pure)', () => {
  it('returns base stats unchanged with no cards equipped', async () => {
    const final = await stubService().getFinalStats('u');
    assert.deepEqual(final, {
      level: 3,
      exp: 120,
      maxHp: 100,
      currentHp: 80,
      atk: 10,
      def: 5,
      critRate: 0.05,
      critDmg: 2.0,
    });
  });

  it('adds main card HP/ATK/DEF and keeps currentHp from base', async () => {
    const final = await stubService({
      bonuses: {
        main: { cardId: 'girgas', level: 25, hp: 388, atk: 92, def: 15 },
        sign: null,
      },
    }).getFinalStats('u');
    assert.equal(final.maxHp, 100 + 388);
    assert.equal(final.atk, 10 + 92);
    assert.equal(final.def, 5 + 15);
    assert.equal(final.currentHp, 80);
  });

  it('adds sign ATK/DEF on top of main bonuses', async () => {
    const final = await stubService({
      bonuses: {
        main: { cardId: 'girgas', level: 25, hp: 388, atk: 92, def: 15 },
        sign: {
          cardId: 'girgas_sign',
          level: 10,
          atk: 27,
          def: 10,
          compatible: true,
        },
      },
    }).getFinalStats('u');
    assert.equal(final.maxHp, 488);
    assert.equal(final.atk, 10 + 92 + 27);
    assert.equal(final.def, 5 + 15 + 10);
    assert.equal(final.currentHp, 80);
  });

  it('exposes exactly the six required stats plus level/exp', async () => {
    const final = await stubService({
      bonuses: {
        main: { cardId: 'girgas', level: 25, hp: 388, atk: 92, def: 15 },
        sign: {
          cardId: 'daisy_sign',
          level: 10,
          atk: 22,
          def: 15,
          compatible: false,
        },
      },
    }).getFinalStats('u');
    assert.deepEqual(Object.keys(final).sort(), [
      'atk',
      'critDmg',
      'critRate',
      'currentHp',
      'def',
      'exp',
      'level',
      'maxHp',
    ]);
  });

  it('never mutates the base stats object', async () => {
    const before = { ...BASE };
    await stubService().getFinalStats('u');
    assert.deepEqual({ ...BASE }, before);
  });

  it('is the single calculation path (one call per layer)', async () => {
    const calls = { base: [], bonuses: [] };
    await stubService({ calls }).getFinalStats('u');
    assert.deepEqual(calls.base, ['u']);
    assert.deepEqual(calls.bonuses, ['u']);
  });

  it('throws when base stats are missing', async () => {
    await assert.rejects(
      stubService({ base: null }).getFinalStats('u'),
      RangeError
    );
  });
});
