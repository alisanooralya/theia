import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  simulateRaidBattle,
  RAID_MAX_SECONDS,
} from '#features/rpg/raid-battle.js';
import {
  createCardBattleState,
} from '#features/rpg/card.js';

function fighter(overrides = {}) {
  return {
    jid: '100@s.whatsapp.net',
    hp: 5000,
    max_hp: 5000,
    atk: 100,
    def: 0,
    critRate: 0,
    cardBattleState: null,
    ...overrides,
  };
}

function bossFighter(overrides = {}) {
  return {
    hp: 100_000,
    max_hp: 100_000,
    atk: 50,
    def: 0,
    critRate: 0,
    ...overrides,
  };
}

test('player menyerang duluan: boss mati di ronde 1 tanpa boss membalas', () => {
  const result = simulateRaidBattle(
    fighter({ atk: 100_000 }),
    bossFighter({ hp: 5000, max_hp: 5000, atk: 999_999 })
  );

  assert.equal(result.bossDefeated, true);
  assert.equal(result.playerDefeated, false);
  assert.equal(result.rounds, 1);
  assert.equal(result.playerHp, 5000);
  assert.equal(result.totalDamage, 5000);
});

test('overkill damage tidak dihitung sebagai kontribusi', () => {
  const result = simulateRaidBattle(
    fighter({ atk: 100_000 }),
    bossFighter({ hp: 5000, max_hp: 5000 })
  );

  assert.equal(result.totalDamage, 5000);
  assert.equal(result.bossHp, 0);
});

test('player mati sebelum 120 detik: battle berhenti lebih awal', () => {
  const result = simulateRaidBattle(
    fighter({ hp: 1000, max_hp: 1000, atk: 100 }),
    bossFighter({ atk: 100_000, hp: 100_000_000, max_hp: 100_000_000 })
  );

  assert.equal(result.playerDefeated, true);
  assert.equal(result.bossDefeated, false);
  assert.ok(result.rounds < RAID_MAX_SECONDS, 'harus berhenti sebelum 120');
  assert.ok(result.totalDamage >= 1, 'minimal 1 damage per serangan');
});

test('battle berhenti tepat di 120 detik (mapping 1 ronde = 1 detik)', () => {
  const result = simulateRaidBattle(
    fighter({ hp: 1_000_000, max_hp: 1_000_000, atk: 100, def: 100_000 }),
    bossFighter({ hp: 1_000_000_000, max_hp: 1_000_000_000, atk: 60 })
  );

  assert.equal(result.playerDefeated, false);
  assert.equal(result.bossDefeated, false);
  assert.equal(result.rounds, RAID_MAX_SECONDS);
  assert.equal(result.durationSeconds, 120);
  // ~100 atk dengan variance ±20%, 120 ronde
  assert.ok(
    result.totalDamage >= 120 * 80 && result.totalDamage <= 120 * 120,
    `total damage harus 9600..14400, dapat ${result.totalDamage}`
  );
  // boss hanya deal damage 1 (min) ke player bertank
  assert.equal(result.playerHp, 1_000_000 - 120);
});

test('damage minimum 1 per serangan walau DEF jauh lebih besar', () => {
  const result = simulateRaidBattle(
    fighter({ atk: 10, def: 100_000 }),
    bossFighter({ atk: 10, def: 100_000, hp: 1_000_000, max_hp: 1_000_000 })
  );

  assert.equal(result.rounds, RAID_MAX_SECONDS);
  assert.equal(result.totalDamage, 120);
  assert.equal(result.playerHp, 5000 - 120);
});

test('fighter input tidak dimutasi oleh simulasi', () => {
  const player = fighter({ atk: 100_000 });
  const boss = bossFighter({ hp: 5000, max_hp: 5000 });
  const playerSnapshot = { ...player };

  simulateRaidBattle(player, boss);

  assert.deepEqual(player, playerSnapshot);
  assert.equal(boss.hp, 5000);
  assert.equal(boss.max_hp, 5000);
});

test('cardBattleState.reset() dipanggil setelah battle selesai', () => {
  const cardState = createCardBattleState(
    { card_id: 'girgas', type: 'main', level: 50 }
  );
  const original = cardState.reset.bind(cardState);
  let resetCalls = 0;
  cardState.reset = () => {
    resetCalls += 1;
    original();
  };

  simulateRaidBattle(fighter({ cardBattleState: cardState }), bossFighter());

  assert.equal(resetCalls, 1);
});

test('snapshot isolation: CardBattleState entry lain tidak tersentuh', () => {
  const main = { card_id: 'ameris', type: 'main', level: 60 };
  const stateA = createCardBattleState(main);
  const stateB = createCardBattleState(main);

  // Counter internal di-reset setelah battle, jadi verifikasi via spy call.
  const originalOnHitDealt = stateA.onHitDealt.bind(stateA);
  let stateAUsed = 0;
  stateA.onHitDealt = (now) => {
    stateAUsed += 1;
    originalOnHitDealt(now);
  };
  const originalOnHitReceived = stateB.onHitReceived.bind(stateB);
  let stateBUsed = 0;
  stateB.onHitReceived = (now) => {
    stateBUsed += 1;
    originalOnHitReceived(now);
  };

  simulateRaidBattle(
    fighter({ cardBattleState: stateA, atk: 100_000 }),
    bossFighter({ hp: 5000, max_hp: 5000 })
  );

  assert.ok(stateAUsed >= 1, 'battle memakai cardBattleState dari snapshot');
  assert.equal(stateBUsed, 0, 'cardBattleState entry lain tidak tersentuh');
  assert.equal(stateB.userHits, 0);
  assert.equal(stateB.amerisActiveUntil, 0);
});

test('gimmick terdaftar memengaruhi damage battle secara deterministik', async () => {
  const { registerGimmick } = await import('#features/rpg/raid-gimmicks.js');
  registerGimmick('fixed_damage_test', {
    modifyAttack: (ctx) => (ctx.side === 'player' ? 5 : 3),
  });

  const result = simulateRaidBattle(
    fighter({ hp: 1_000_000, max_hp: 1_000_000, atk: 100, def: 100_000 }),
    bossFighter({ hp: 1_000_000_000, max_hp: 1_000_000_000, atk: 60 }),
    { gimmicks: [{ type: 'fixed_damage_test' }] }
  );

  assert.equal(result.rounds, RAID_MAX_SECONDS);
  assert.equal(result.totalDamage, 5 * 120);
  assert.equal(result.playerHp, 1_000_000 - 3 * 120);
});
