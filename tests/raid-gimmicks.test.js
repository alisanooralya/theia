import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  registerGimmick,
  getGimmickHandler,
  listGimmickTypes,
  createGimmickRuntime,
} from '#features/rpg/raid-gimmicks.js';

const UNUSED_TYPE = 'gimmick_framework_test_unused';

test('gimmick type tak dikenal diabaikan tanpa merusak runtime', () => {
  const runtime = createGimmickRuntime([
    { type: 'tidak_ada_di_registry', value: 10 },
    null,
    'bukan-object',
  ]);

  assert.equal(runtime.count, 0);
  assert.equal(
    runtime.modifyAttack({ side: 'player', round: 1, now: 0, dmg: 42 }),
    42
  );
  runtime.onBattleStart({ player: {}, boss: {} });
  runtime.onBattleEnd({ result: {} });
});

test('registerGimmick menolak input tidak valid', () => {
  assert.throws(() => registerGimmick('', {}));
  assert.throws(() => registerGimmick('x', null));
  assert.throws(() => registerGimmick(null, {}));
});

test('handler terdaftar: hook dipanggil dengan params dari config', () => {
  const type = `${UNUSED_TYPE}_hooks`;
  const seen = [];
  registerGimmick(type, {
    onBattleStart: (ctx) => seen.push(['start', ctx.params.value]),
    modifyAttack: (ctx) => {
      seen.push(['attack', ctx.side, ctx.dmg]);
      return ctx.dmg + 1;
    },
    onBattleEnd: (ctx) => seen.push(['end', ctx.params.value]),
  });

  const runtime = createGimmickRuntime([{ type, value: 10 }]);
  assert.equal(runtime.count, 1);

  runtime.onBattleStart({ player: 'p', boss: 'b' });
  const dmg = runtime.modifyAttack({
    side: 'player',
    round: 2,
    now: 123,
    dmg: 10,
  });
  runtime.onBattleEnd({ result: 'r' });

  assert.equal(dmg, 11);
  assert.deepEqual(seen, [
    ['start', 10],
    ['attack', 'player', 10],
    ['end', 10],
  ]);
});

test('modifyAttack dengan return non-numerik diabaikan', () => {
  const type = `${UNUSED_TYPE}_nan`;
  registerGimmick(type, {
    modifyAttack: () => 'bukan angka',
  });

  const runtime = createGimmickRuntime([{ type }]);
  assert.equal(
    runtime.modifyAttack({ side: 'player', round: 1, now: 0, dmg: 7 }),
    7
  );
});

test('modifyAttack dengan return negatif di-clamp ke 0', () => {
  const type = `${UNUSED_TYPE}_negative`;
  registerGimmick(type, {
    modifyAttack: () => -100,
  });

  const runtime = createGimmickRuntime([{ type }]);
  assert.equal(
    runtime.modifyAttack({ side: 'boss', round: 1, now: 0, dmg: 7 }),
    0
  );
});

test('beberapa gimmick diterapkan berurutan', () => {
  const typeA = `${UNUSED_TYPE}_a`;
  const typeB = `${UNUSED_TYPE}_b`;
  registerGimmick(typeA, { modifyAttack: (ctx) => ctx.dmg * 2 });
  registerGimmick(typeB, { modifyAttack: (ctx) => ctx.dmg + 3 });

  const runtime = createGimmickRuntime([{ type: typeA }, { type: typeB }]);
  assert.equal(
    runtime.modifyAttack({ side: 'player', round: 1, now: 0, dmg: 10 }),
    23
  );
});

test('getGimmickHandler dan listGimmickTypes konsisten', () => {
  const type = `${UNUSED_TYPE}_lookup`;
  registerGimmick(type, {});
  assert.ok(getGimmickHandler(type));
  assert.equal(getGimmickHandler('yang_tidak_ada'), null);
  assert.ok(listGimmickTypes().includes(type));
});

test('runtime tanpa gimmick adalah no-op murah', () => {
  const runtime = createGimmickRuntime([]);
  assert.equal(runtime.count, 0);
  runtime.onBattleStart({});
  runtime.onBattleEnd({});
  assert.equal(
    runtime.modifyAttack({ side: 'player', round: 1, now: 0, dmg: 5 }),
    5
  );
});
