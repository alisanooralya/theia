import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  DAILY_CONFIG,
  computeStreak,
  rollDailyCoin,
  wibDayKey,
} from '../src/features/economy/config/daily-config.js';

// 2026-09-09 10:00 WIB = 2026-09-09 03:00 UTC.
const T0 = Date.UTC(2026, 8, 9, 3, 0, 0) / 1000;

describe('daily config', () => {
  it('uses config coin range, not hardcoded values', () => {
    assert.deepEqual(DAILY_CONFIG.coin, { min: 10000, max: 20000 });
    for (let i = 0; i < 200; i += 1) {
      const coin = rollDailyCoin();
      assert.ok(coin >= 10000 && coin <= 20000);
    }
    assert.equal(rollDailyCoin(() => 0), 10000);
    assert.equal(rollDailyCoin(() => 0.99999), 20000);
  });

  it('has no streak bonus tiers (legacy had none)', () => {
    assert.equal(DAILY_CONFIG.streak, undefined);
  });

  it('keys calendar days in WIB', () => {
    assert.equal(wibDayKey(T0), '2026-09-09');
    // 23:00 UTC = 06:00 WIB next day.
    assert.equal(wibDayKey(T0 + 20 * 3600), '2026-09-10');
    assert.equal(wibDayKey(T0 + 3600), '2026-09-09');
  });
});

describe('legacy streak rule', () => {
  it('starts at 1 on first claim', () => {
    assert.equal(computeStreak({ lastDaily: 0, dailyStreak: 0, nowSec: T0 }), 1);
  });

  it('increments when gap < 48h — even across a skipped calendar day', () => {
    // Mon 23:00 WIB -> Wed 01:00 WIB = 26h gap, Tuesday skipped.
    const mon = Date.UTC(2026, 8, 7, 16, 0, 0) / 1000;
    const wed = mon + 26 * 3600;
    assert.notEqual(wibDayKey(mon), wibDayKey(wed));
    assert.equal(computeStreak({ lastDaily: mon, dailyStreak: 4, nowSec: wed }), 5);
    // Normal next-day claim.
    assert.equal(computeStreak({ lastDaily: T0, dailyStreak: 2, nowSec: T0 + 24 * 3600 }), 3);
  });

  it('resets to 1 when gap >= 48h', () => {
    assert.equal(computeStreak({ lastDaily: T0, dailyStreak: 9, nowSec: T0 + 48 * 3600 }), 1);
    assert.equal(computeStreak({ lastDaily: T0, dailyStreak: 9, nowSec: T0 + 72 * 3600 }), 1);
  });

  it('47h59m still continues (strict < 48h boundary)', () => {
    assert.equal(computeStreak({ lastDaily: T0, dailyStreak: 3, nowSec: T0 + 48 * 3600 - 1 }), 4);
  });
});
