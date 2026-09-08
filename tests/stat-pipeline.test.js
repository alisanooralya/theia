import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sumArtifactBonuses } from '#features/rpg/artifact.js';
import { calculateCardStats } from '#features/rpg/card.js';

const BASE = { hp: 1200, atk: 30, def: 20 };

function art(mainStat, mainValue, substats = {}) {
  return { main_stat: mainStat, main_value: mainValue, substats };
}

test('flat main stats dijumlah apa adanya', () => {
  const bonus = sumArtifactBonuses(BASE, [
    art('hp', 430),
    art('atk', 28),
  ]);
  assert.equal(bonus.hp, 430);
  assert.equal(bonus.atk, 28);
  assert.equal(bonus.def, 0);
  assert.equal(bonus.critRate, 0);
});

test('persen dihitung dari base dengan satuan per-mille (/1000)', () => {
  // sands Lv1 hp_percent 70 = +7.0%, bukan +70%
  const bonus = sumArtifactBonuses(BASE, [art('hp_percent', 70)]);
  assert.equal(bonus.hp, Math.floor((1200 * 70) / 1000));
  assert.equal(bonus.hp, 84);
});

test('sands Lv20 hp_percent 466 = +46.6% (bukan +466%)', () => {
  const bonus = sumArtifactBonuses(BASE, [art('hp_percent', 466)]);
  assert.equal(bonus.hp, Math.floor((1200 * 466) / 1000));
  assert.equal(bonus.hp, 559);
  assert.ok(bonus.hp < 1200, 'bonus persen tidak boleh melebihi base');
});

test('atk_percent dan def_percent mengikuti base masing-masing', () => {
  const bonus = sumArtifactBonuses(BASE, [
    art('atk_percent', 70),
    art('def_percent', 87),
  ]);
  assert.equal(bonus.atk, Math.floor((30 * 70) / 1000));
  assert.equal(bonus.def, Math.floor((20 * 87) / 1000));
  assert.equal(bonus.atk, 2);
  assert.equal(bonus.def, 1);
});

test('substats flat ditambahkan ke stat yang sama', () => {
  const bonus = sumArtifactBonuses(BASE, [
    art('hp_percent', 70, { hp: 80, atk: 5, def: 6 }),
  ]);
  assert.equal(bonus.hp, 84 + 80);
  assert.equal(bonus.atk, 5);
  assert.equal(bonus.def, 6);
});

test('circlet crit_rate 39 = +3.9 (konsisten dengan tampilan)', () => {
  const bonus = sumArtifactBonuses(BASE, [art('crit_rate', 39)]);
  assert.equal(bonus.critRate, 3.9);
});

test('artifact kosong, null, dan stat tak dikenal aman', () => {
  assert.deepEqual(sumArtifactBonuses(BASE, []), {
    hp: 0,
    atk: 0,
    def: 0,
    critRate: 0,
  });
  assert.deepEqual(sumArtifactBonuses(BASE, null), {
    hp: 0,
    atk: 0,
    def: 0,
    critRate: 0,
  });
  assert.deepEqual(sumArtifactBonuses(BASE, [art('unknown', 999)]), {
    hp: 0,
    atk: 0,
    def: 0,
    critRate: 0,
  });
});

test('main card flat mengikuti level (Lv5 = 20%, Lv100 = penuh)', () => {
  const card = { type: 'main', level: 5, max_hp: 910, max_atk: 164, max_def: 32 };
  const lv5 = calculateCardStats(card);
  assert.equal(lv5.hp, Math.round(910 * 0.2));
  assert.equal(lv5.atk, Math.round(164 * 0.2));
  assert.equal(lv5.def, Math.round(32 * 0.2));

  const lv100 = calculateCardStats({ ...card, level: 100 });
  assert.deepEqual(lv100, { hp: 910, atk: 164, def: 32 });
});

test('support card tidak memberi flat stat', () => {
  assert.deepEqual(
    calculateCardStats({ type: 'support', level: 1, max_hp: 0, max_atk: 0, max_def: 0 }),
    { hp: 0, atk: 0, def: 0 }
  );
});

test('final = base + artifact + main card', () => {
  const bonus = sumArtifactBonuses(BASE, [
    art('hp', 430),
    art('atk_percent', 70, { atk: 5 }),
  ]);
  const card = calculateCardStats({
    type: 'main',
    level: 100,
    max_hp: 910,
    max_atk: 164,
    max_def: 32,
  });
  const final = {
    hp: BASE.hp + bonus.hp + card.hp,
    atk: BASE.atk + bonus.atk + card.atk,
    def: BASE.def + bonus.def + card.def,
  };
  assert.equal(final.hp, 1200 + 430 + 910);
  assert.equal(final.atk, 30 + (2 + 5) + 164);
  assert.equal(final.def, 20 + 0 + 32);
});
