import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CARD_LEVELING,
  getLevelUpCost,
  getBulkLevelUpCost,
  maxLevelFor,
} from '../src/features/rpg/config/card-config.js';

describe('level-up costs', () => {
  it('1. Lv1 -> 2 costs 5,000 coin + 5 cerelia', () => {
    assert.deepEqual(getLevelUpCost('main', 1), { coin: 5000, cerelia: 5, materialId: 'cerelia' });
    assert.deepEqual(getLevelUpCost('sign', 1), { coin: 5000, cerelia: 5, materialId: 'cerelia' });
  });

  it('2-3. cost rises gradually per the config formula', () => {
    assert.deepEqual(getLevelUpCost('main', 2), { coin: 5500, cerelia: 6, materialId: 'cerelia' });
    assert.deepEqual(getLevelUpCost('main', 3), { coin: 6000, cerelia: 7, materialId: 'cerelia' });
    assert.deepEqual(getLevelUpCost('main', 4), { coin: 6500, cerelia: 8, materialId: 'cerelia' });
    const cfg = CARD_LEVELING;
    for (const lv of [10, 50, 99]) {
      assert.deepEqual(getLevelUpCost('main', lv), {
        coin: cfg.coinBase + cfg.coinPerLevel * (lv - 1),
        cerelia: cfg.cereliaBase + Math.floor((lv - 1) / cfg.cereliaEvery),
        materialId: 'cerelia',
      });
    }
    let prev = getLevelUpCost('main', 1);
    for (let lv = 2; lv <= 99; lv += 1) {
      const cur = getLevelUpCost('main', lv);
      assert.ok(cur.coin >= prev.coin && cur.cerelia >= prev.cerelia, `Lv.${lv}`);
      prev = cur;
    }
  });

  it('4. bulk cost sums every step, capped by kind max', () => {
    const bulk = getBulkLevelUpCost('main', 1, 5);
    assert.deepEqual(
      { coin: bulk.coin, cerelia: bulk.cerelia },
      { coin: 5000 + 5500 + 6000 + 6500, cerelia: 5 + 6 + 7 + 8 }
    );
    assert.deepEqual({ levels: bulk.levels, toLevel: bulk.toLevel }, { levels: 4, toLevel: 5 });
    // A naive single-step x count would differ; prove stepwise summation.
    const single = getLevelUpCost('main', 1);
    assert.notDeepEqual(
      { coin: bulk.coin, cerelia: bulk.cerelia },
      { coin: single.coin * 4, cerelia: single.cerelia * 4 }
    );
  });

  it('returns null at max and rejects bad ranges', () => {
    assert.equal(getLevelUpCost('main', 100), null);
    assert.equal(getLevelUpCost('sign', 50), null);
    assert.throws(() => getLevelUpCost('support', 1), RangeError);
    assert.throws(() => getBulkLevelUpCost('main', 5, 5), RangeError);
    assert.throws(() => getBulkLevelUpCost('main', 5, 3), RangeError);
    assert.throws(() => getBulkLevelUpCost('main', 90, 101), RangeError);
    assert.throws(() => getBulkLevelUpCost('sign', 40, 51), RangeError);
    assert.equal(maxLevelFor('main'), 100);
    assert.equal(maxLevelFor('sign'), 50);
  });
});
