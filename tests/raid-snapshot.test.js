import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assembleRaidFighter,
  simulateRaidBattle,
  RAID_MAX_SECONDS,
} from '#features/rpg/raid-battle.js';

const JID = '100@s.whatsapp.net';
const NOW = 1_700_000_000;

function base(overrides = {}) {
  return {
    buff_atk: 0,
    buff_def: 0,
    buff_expire: 0,
    buff_exp_mult: 1,
    ...overrides,
  };
}

function profile(overrides = {}) {
  return {
    hp: 2000,
    atk: 150,
    def: 120,
    critRate: 8,
    ...overrides,
  };
}

test('raid mulai dari Final Max HP, bukan Current HP profile', () => {
  // Profile: current 800, final max 2000. Current tidak jadi input snapshot.
  const fighter = assembleRaidFighter({
    jid: JID,
    base: base(),
    profileStats: profile(),
    cardBattleState: null,
  });
  assert.equal(fighter.hp, 2000);
  assert.equal(fighter.max_hp, 2000);
});

test('buff aktif ditambahkan seperti Battle/Domain', () => {
  const fighter = assembleRaidFighter({
    jid: JID,
    base: base({ buff_atk: 50, buff_def: 25, buff_expire: NOW + 3600 }),
    profileStats: profile(),
    cardBattleState: null,
    nowSec: NOW,
  });
  assert.equal(fighter.atk, 200);
  assert.equal(fighter.def, 145);
});

test('buff kedaluwarsa tidak dipakai', () => {
  const fighter = assembleRaidFighter({
    jid: JID,
    base: base({ buff_atk: 50, buff_expire: NOW - 10 }),
    profileStats: profile(),
    cardBattleState: null,
    nowSec: NOW,
  });
  assert.equal(fighter.atk, 150);
});

test('crit rate persen di-clamp ke fraksi 0–0.95', () => {
  const high = assembleRaidFighter({
    jid: JID,
    base: base(),
    profileStats: profile({ critRate: 200 }),
    cardBattleState: null,
  });
  assert.equal(high.critRate, 0.95);

  const normal = assembleRaidFighter({
    jid: JID,
    base: base(),
    profileStats: profile({ critRate: 8 }),
    cardBattleState: null,
  });
  assert.equal(normal.critRate, 0.08);
});

test('snapshot isolation: ganti build tidak mengubah entry berjalan', () => {
  const state = { tag: 'snapshot-lama' };
  const running = assembleRaidFighter({
    jid: JID,
    base: base(),
    profileStats: profile({ hp: 2000, atk: 150 }),
    cardBattleState: state,
  });

  // Build berubah (entry berikutnya): snapshot lama tetap utuh.
  const next = assembleRaidFighter({
    jid: JID,
    base: base(),
    profileStats: profile({ hp: 2600, atk: 210 }),
    cardBattleState: { tag: 'snapshot-baru' },
  });

  assert.equal(running.hp, 2000);
  assert.equal(running.atk, 150);
  assert.equal(running.cardBattleState, state);
  assert.equal(next.hp, 2600);
  assert.equal(next.atk, 210);
});

test('simulasi tidak memutasi fighter snapshot', () => {
  const player = assembleRaidFighter({
    jid: JID,
    base: base(),
    profileStats: profile(),
    cardBattleState: null,
  });
  const before = { ...player };
  const boss = { hp: 5000, max_hp: 5000, atk: 50, def: 0, critRate: 0 };

  simulateRaidBattle(player, boss);

  assert.deepEqual(player, before);
  assert.equal(boss.hp, 5000);
});

test('simulasi berhenti maksimal 120 ronde (120 detik virtual)', () => {
  const player = assembleRaidFighter({
    jid: JID,
    base: base(),
    profileStats: profile({ hp: 1_000_000, atk: 100, def: 100_000 }),
    cardBattleState: null,
  });
  const boss = {
    hp: 1_000_000_000,
    max_hp: 1_000_000_000,
    atk: 60,
    def: 0,
    critRate: 0,
  };

  const result = simulateRaidBattle(player, boss);

  assert.equal(result.rounds, RAID_MAX_SECONDS);
  assert.equal(result.durationSeconds, 120);
  assert.ok(result.totalDamage > 0);
});
