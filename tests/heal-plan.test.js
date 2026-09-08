import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcHealPlan } from '#commands/modules/rpg/heal.js';

test('full heal: current < final max → newHp = final max, bukan base', () => {
  // Base 1200 + artifact 300 + card 500 = final 2000, current 800.
  const plan = calcHealPlan(800, 2000, 100_000);
  assert.equal(plan.missing, 1200);
  assert.equal(plan.full, false);
  assert.equal(plan.healable, 1200);
  assert.equal(plan.newHp, 2000);
});

test('harga full heal: 100 coin per 100 HP', () => {
  const plan = calcHealPlan(800, 2000, 100_000);
  assert.equal(plan.fullPrice, 1200);
  const partial = calcHealPlan(850, 2000, 100_000);
  assert.equal(partial.fullPrice, Math.ceil(1150 / 100) * 100);
});

test('cash terbatas → heal parsial tanpa melebihi max', () => {
  const plan = calcHealPlan(800, 2000, 500);
  assert.ok(plan.healable > 0);
  assert.ok(plan.healable < plan.missing);
  assert.ok(plan.newHp > 800);
  assert.ok(plan.newHp <= 2000);
});

test('cash tidak cukup sama sekali → healable 0', () => {
  const plan = calcHealPlan(800, 2000, 0);
  assert.equal(plan.healable, 0);
  assert.equal(plan.cost, 0);
  assert.equal(plan.newHp, 800);
});

test('sudah penuh → full, HP tidak berubah', () => {
  const plan = calcHealPlan(2000, 2000, 100_000);
  assert.equal(plan.full, true);
  assert.equal(plan.missing, 0);
  assert.equal(plan.newHp, 2000);
});

test('HP di atas max (build turun) → dianggap penuh, tidak di-reset', () => {
  const plan = calcHealPlan(2500, 2000, 100_000);
  assert.equal(plan.full, true);
  assert.equal(plan.newHp, 2500);
});

test('heal tidak mengubah final max HP (hanya current)', () => {
  const maxHp = 2000;
  const plan = calcHealPlan(800, maxHp, 100_000);
  assert.ok(plan.newHp <= maxHp);
  assert.equal(plan.newHp, maxHp);
});
