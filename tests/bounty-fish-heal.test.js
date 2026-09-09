import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  BOUNTY_DIFFICULTY,
  getBountyDifficulty,
  getBountyTarget,
  rewardRange,
  targetStatLine,
  wibDayStart,
} from '../src/features/economy/config/bounty-config.js';
import {
  FISH,
  FISH_COOLDOWN_MS,
  pickFish,
  fishReward,
} from '../src/features/economy/config/fish-config.js';
import { HEAL_CONFIG } from '../src/features/rpg/config/heal-config.js';

describe('bounty config (legacy values)', () => {
  it('keeps three difficulties with legacy targets and ranges', () => {
    assert.deepEqual(Object.keys(BOUNTY_DIFFICULTY), ['easy', 'medium', 'hard']);
    assert.deepEqual(BOUNTY_DIFFICULTY.easy.coin, [6000, 8000]);
    assert.deepEqual(BOUNTY_DIFFICULTY.easy.exp, [20, 40]);
    assert.deepEqual(BOUNTY_DIFFICULTY.medium.coin, [13000, 17000]);
    assert.deepEqual(BOUNTY_DIFFICULTY.hard.exp, [100, 120]);
    const copet = getBountyTarget('easy', 'copet');
    assert.equal(copet.hp, 2450);
    assert.equal(copet.atk, 175);
    assert.equal(copet.def, 84);
    assert.equal(getBountyTarget('hard', 'overlord').hp, 8400);
    assert.equal(getBountyTarget('easy', 'nope'), null);
    assert.equal(getBountyDifficulty('HARD').name, 'Hard');
    assert.equal(getBountyDifficulty('nope'), null);
    assert.equal(targetStatLine(copet), 'HP 2450 • ATK 175 • DEF 84');
    assert.equal(rewardRange(BOUNTY_DIFFICULTY.easy), '6k-8k Coin');
  });

  it('day start resets at 00:00 WIB', () => {
    // 2026-09-09 10:00 WIB = 03:00 UTC; start = 00:00 WIB.
    const noon = Date.UTC(2026, 8, 9, 3, 0, 0) / 1000;
    const start = wibDayStart(noon);
    assert.equal(start, Date.UTC(2026, 8, 8, 17, 0, 0) / 1000);
    // Next WIB day start moves exactly 24h later.
    assert.equal(wibDayStart(noon + 86400), start + 86400);
  });
});

describe('fish config (legacy values)', () => {
  it('keeps twelve catches with legacy rates and ranges', () => {
    assert.equal(FISH.length, 12);
    assert.equal(FISH_COOLDOWN_MS, 3600000);
    assert.equal(FISH[0].name, 'Botol Plastik');
    assert.deepEqual(FISH[0].reward, [10, 30]);
    assert.equal(FISH[FISH.length - 1].name, 'Harta Karam');
    assert.equal(FISH[FISH.length - 1].exp, 100);
    assert.ok(FISH.every((f) => f.rate > 0));
  });

  it('picks within config and honors forced rolls', () => {
    for (let i = 0; i < 300; i++) {
      const fish = pickFish();
      assert.ok(FISH.includes(fish));
      const reward = fishReward(fish);
      assert.ok(reward >= fish.reward[0] && reward <= fish.reward[1]);
    }
    assert.equal(pickFish(() => 0), FISH[0]);
    assert.equal(fishReward(FISH[0], () => 0), 10);
  });
});

describe('heal config', () => {
  it('charges exactly 1 coin per HP', () => {
    assert.equal(HEAL_CONFIG.coinPerHp, 1);
  });
});
