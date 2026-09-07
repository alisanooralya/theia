import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveActivePeriod,
  resolveLastEndedPeriod,
  resolveUpcomingPeriod,
  getActivePeriod,
  getUpcomingPeriod,
  bossConfig,
} from '#features/rpg/raid-period-config.js';

const periods = [
  { id: 'p1', name: 'P1', startAt: 100, endAt: 200, bosses: [{ id: 'b1' }] },
  { id: 'p2', name: 'P2', startAt: 150, endAt: 300, bosses: [{ id: 'b2' }] },
];

test('resolveActivePeriod: sebelum semua period → null', () => {
  assert.equal(resolveActivePeriod(periods, 50), null);
});

test('resolveActivePeriod: periode aktif tunggal', () => {
  assert.equal(resolveActivePeriod(periods, 120)?.id, 'p1');
});

test('resolveActivePeriod: overlap → period dengan startAt terbesar menang', () => {
  assert.equal(resolveActivePeriod(periods, 175)?.id, 'p2');
});

test('resolveActivePeriod: endAt bersifat eksklusif', () => {
  assert.equal(resolveActivePeriod(periods, 200)?.id, 'p2');
  assert.equal(resolveActivePeriod(periods, 300), null);
});

test('resolveLastEndedPeriod: period terakhir yang selesai', () => {
  assert.equal(resolveLastEndedPeriod(periods, 250)?.id, 'p1');
  assert.equal(resolveLastEndedPeriod(periods, 400)?.id, 'p2');
  assert.equal(resolveLastEndedPeriod(periods, 50), null);
});

test('resolveUpcomingPeriod: period mendatang terdekat', () => {
  assert.equal(resolveUpcomingPeriod(periods, 50)?.id, 'p1');
  assert.equal(resolveUpcomingPeriod(periods, 130)?.id, 'p2');
  assert.equal(resolveUpcomingPeriod(periods, 500), null);
});

test('config default: period pertama aktif untuk now berapapun', () => {
  const now = Date.now();
  const active = getActivePeriod(now);
  assert.ok(active, 'default period harus aktif');
  assert.equal(active.bosses.length, 4, '4 boss per period');
  assert.equal(active.entriesPerDay, 3, '3 entry per hari');
  assert.equal(getUpcomingPeriod(now), null);
});

test('bossConfig: index valid dan invalid', () => {
  const period = getActivePeriod();
  assert.equal(bossConfig(period, 0)?.id, period.bosses[0].id);
  assert.equal(bossConfig(period, 3)?.id, period.bosses[3].id);
  assert.equal(bossConfig(period, 4), null);
  assert.equal(bossConfig(null, 0), null);
});

test('setiap boss config punya field minimal yang dibutuhkan engine', () => {
  const period = getActivePeriod();
  for (const boss of period.bosses) {
    assert.ok(boss.id, 'boss.id');
    assert.ok(boss.name, 'boss.name');
    assert.ok(boss.maxHp > 0, 'boss.maxHp > 0');
    assert.ok(boss.atk > 0, 'boss.atk > 0');
    assert.ok(boss.def >= 0, 'boss.def >= 0');
    assert.ok(Array.isArray(boss.gimmicks), 'boss.gimmicks array');
    assert.ok(boss.rewards, 'boss.rewards');
  }
});
