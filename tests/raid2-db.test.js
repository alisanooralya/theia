/**
 * Integration test Raid 2.0 (database).
 *
 * Berjalan HANYA jika env RAID_TEST_DB_URL di-set ke Postgres khusus test
 * (JANGAN pakai DB production). Tanpa env ini, semua test di-skip.
 *
 * Jalankan: RAID_TEST_DB_URL=postgres://user:pass@host:5432/dbname \
 *           node --test tests/raid2-db.test.js
 *
 * Yang dites: kontrak concurrency/idempotency di level model
 * (daily entry, double-kill, double-advance, claim, contribution) —
 * service attack() menyusun semua operasi ini dalam satu transaction.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import { raidModel } from '#storage/models/raid.js';

const DB_URL = process.env.RAID_TEST_DB_URL;
const SKIP = DB_URL ? false : 'RAID_TEST_DB_URL tidak di-set (skip DB test)';

let testDb = null;
const runId = Date.now().toString(36);
const jid = `99${runId}@s.whatsapp.net`;
const dayKey = `2026-09-07-${runId}`;
const nextDayKey = `2026-09-08-${runId}`;
const periodId = `test-period-${runId}`;

const periodConfig = {
  id: periodId,
  name: 'Test Period',
  startAt: 0,
  endAt: Number.MAX_SAFE_INTEGER,
  entriesPerDay: 3,
  bosses: [
    { id: 'boss-a', name: 'Boss A', maxHp: 1000 },
    { id: 'boss-b', name: 'Boss B', maxHp: 2000 },
  ],
};

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    jid        TEXT    PRIMARY KEY,
    raid_coin  INTEGER NOT NULL DEFAULT 0,
    updated_at BIGINT  NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT)
  )`,
  `CREATE TABLE IF NOT EXISTS raid_periods (
    period_id    TEXT    PRIMARY KEY,
    name         TEXT    NOT NULL DEFAULT '',
    start_at     BIGINT  NOT NULL,
    end_at       BIGINT  NOT NULL,
    boss_count   INTEGER NOT NULL,
    current_boss INTEGER NOT NULL DEFAULT 0,
    status       TEXT    NOT NULL DEFAULT 'active',
    completed_at BIGINT  NOT NULL DEFAULT 0,
    created_at   BIGINT  NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT),
    updated_at   BIGINT  NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT)
  )`,
  `CREATE TABLE IF NOT EXISTS raid_bosses (
    period_id    TEXT    NOT NULL REFERENCES raid_periods(period_id) ON DELETE CASCADE,
    boss_index   INTEGER NOT NULL,
    boss_id      TEXT    NOT NULL,
    max_hp       BIGINT  NOT NULL,
    remaining_hp BIGINT  NOT NULL,
    defeated_at  BIGINT  NOT NULL DEFAULT 0,
    created_at   BIGINT  NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT),
    updated_at   BIGINT  NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT),
    PRIMARY KEY (period_id, boss_index)
  )`,
  `CREATE TABLE IF NOT EXISTS raid_contributions (
    period_id      TEXT    NOT NULL,
    boss_index     INTEGER NOT NULL,
    jid            TEXT    NOT NULL REFERENCES users(jid) ON DELETE CASCADE,
    damage         BIGINT  NOT NULL DEFAULT 0,
    hits           INTEGER NOT NULL DEFAULT 0,
    reward_claimed INTEGER NOT NULL DEFAULT 0,
    created_at     BIGINT  NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT),
    updated_at     BIGINT  NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT),
    PRIMARY KEY (period_id, boss_index, jid)
  )`,
  `CREATE TABLE IF NOT EXISTS raid_entries (
    jid        TEXT    PRIMARY KEY REFERENCES users(jid) ON DELETE CASCADE,
    day_key    TEXT    NOT NULL DEFAULT '',
    used       INTEGER NOT NULL DEFAULT 0,
    updated_at BIGINT  NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT)
  )`,
];

before(async () => {
  if (!DB_URL) return;
  testDb = postgres(DB_URL, { max: 10, prepare: false });
  for (const stmt of SCHEMA) {
    await testDb.unsafe(stmt);
  }
  await testDb`INSERT INTO users (jid) VALUES (${jid}) ON CONFLICT DO NOTHING`;
});

after(async () => {
  if (!testDb) return;
  await testDb`DELETE FROM raid_contributions WHERE period_id = ${periodId}`;
  await testDb`DELETE FROM raid_entries WHERE jid = ${jid}`;
  await testDb`DELETE FROM raid_bosses WHERE period_id = ${periodId}`;
  await testDb`DELETE FROM raid_periods WHERE period_id = ${periodId}`;
  await testDb`DELETE FROM users WHERE jid = ${jid}`;
  await testDb.end();
});

test('daily entry: maksimal 3 per hari kalender', { skip: SKIP }, async () => {
  const first = await raidModel.consumeRaidEntry(jid, dayKey, 3, testDb);
  const second = await raidModel.consumeRaidEntry(jid, dayKey, 3, testDb);
  const third = await raidModel.consumeRaidEntry(jid, dayKey, 3, testDb);
  const fourth = await raidModel.consumeRaidEntry(jid, dayKey, 3, testDb);

  assert.equal(first, 1);
  assert.equal(second, 2);
  assert.equal(third, 3);
  assert.equal(fourth, null, 'entry ke-4 harus ditolak');
});

test('daily entry: rollover tanggal mereset kuota', { skip: SKIP }, async () => {
  const used = await raidModel.consumeRaidEntry(jid, nextDayKey, 3, testDb);
  assert.equal(used, 1, 'hari baru mulai dari 1 lagi');
  // Satu row per jid: day_key lama sudah tergantikan hari baru.
  assert.equal(await raidModel.getRaidEntries(jid, nextDayKey, testDb), 1);
  assert.equal(
    await raidModel.getRaidEntries(jid, dayKey, testDb),
    0,
    'day_key lama tidak terbaca lagi setelah ganti hari'
  );
});

test('daily entry: kuota hari lama terbaca ulang (restart-safe)', { skip: SKIP }, async () => {
  const used = await raidModel.getRaidEntries(jid, nextDayKey, testDb);
  assert.equal(used, 1, 'persist di DB, bukan di memori process');
});

test('daily entry: 10 request bersamaan hanya lolos 3', { skip: SKIP }, async () => {
  const otherJid = `88${runId}@s.whatsapp.net`;
  await testDb`INSERT INTO users (jid) VALUES (${otherJid}) ON CONFLICT DO NOTHING`;
  const concurrentDay = `2026-09-09-${runId}`;

  const attempts = await Promise.all(
    Array.from({ length: 10 }, () =>
      testDb.begin(async (t) =>
        raidModel.consumeRaidEntry(otherJid, concurrentDay, 3, t)
      )
    )
  );

  const wins = attempts.filter((used) => used !== null);
  assert.equal(wins.length, 3, `harus tepat 3 yang lolos, dapat ${wins.length}`);
  assert.equal(await raidModel.getRaidEntries(otherJid, concurrentDay, testDb), 3);

  await testDb`DELETE FROM raid_entries WHERE jid = ${otherJid}`;
  await testDb`DELETE FROM users WHERE jid = ${otherJid}`;
});

test('period & boss state: ensure idempotent + progression', { skip: SKIP }, async () => {
  await raidModel.ensurePeriod(periodConfig, testDb);
  await raidModel.ensurePeriod(periodConfig, testDb); // dobel: tidak reset state

  const period = await raidModel.getPeriod(periodId, testDb);
  assert.equal(period.current_boss, 0);
  assert.equal(period.status, 'active');

  const bossStates = await raidModel.getBossStates(periodId, testDb);
  assert.equal(bossStates.length, 2);
  assert.equal(bossStates[0].boss_id, 'boss-a');
  assert.equal(bossStates[0].remaining_hp, 1000);
  assert.equal(bossStates[0].defeated_at, 0);
});

test('boss damage: setBossHp dan kontribusi terakumulasi', { skip: SKIP }, async () => {
  await raidModel.setBossHp(periodId, 0, 400, testDb);
  await raidModel.addContribution(periodId, 0, jid, 350, testDb);
  await raidModel.addContribution(periodId, 0, jid, 250, testDb);

  const state = await raidModel.getBossState(periodId, 0, testDb);
  assert.equal(state.remaining_hp, 400);

  const contributions = await raidModel.getContributionsByJid(periodId, jid, testDb);
  assert.equal(contributions.length, 1);
  assert.equal(contributions[0].damage, 600);
  assert.equal(contributions[0].hits, 2);

  const top = await raidModel.getBossContributions(periodId, 0, 10, testDb);
  assert.equal(top[0].damage, 600);

  const total = await raidModel.getTotalContribution(periodId, jid, testDb);
  assert.equal(total, 600);
});

test('boss mati: tidak bisa mati dua kali', { skip: SKIP }, async () => {
  await raidModel.setBossHp(periodId, 0, 0, testDb);
  const first = await raidModel.markBossDefeated(periodId, 0, testDb);
  const second = await raidModel.markBossDefeated(periodId, 0, testDb);

  assert.ok(first, 'kill pertama menang');
  assert.equal(second, null, 'kill kedua ditolak');
});

test('progression: tidak bisa maju dua kali untuk boss yang sama', { skip: SKIP }, async () => {
  const first = await raidModel.advanceProgression(periodId, 0, testDb);
  const second = await raidModel.advanceProgression(periodId, 0, testDb);

  assert.ok(first, 'advance pertama menang');
  assert.equal(first.current_boss, 1);
  assert.equal(first.status, 'active');
  assert.equal(second, null, 'advance kedua ditolak');
});

test('progression: boss terakhir meng-complete period', { skip: SKIP }, async () => {
  await raidModel.setBossHp(periodId, 1, 0, testDb);
  await raidModel.markBossDefeated(periodId, 1, testDb);
  const advanced = await raidModel.advanceProgression(periodId, 1, testDb);

  assert.ok(advanced);
  assert.equal(advanced.current_boss, 2);
  assert.equal(advanced.status, 'completed');
  assert.ok(advanced.completed_at > 0);
});

test('period completed: lockPeriod masih bisa dibaca, finalize idempotent', { skip: SKIP }, async () => {
  const locked = await testDb.begin(async (t) =>
    raidModel.lockPeriod(periodId, t)
  );
  assert.equal(locked.status, 'completed');

  const finalized = await raidModel.finalizePeriod(periodId, testDb);
  assert.equal(finalized, null, 'sudah completed, tidak ada yang berubah');
});

test('claim reward: idempotent dan concurrency-safe', { skip: SKIP }, async () => {
  const otherJid = `77${runId}@s.whatsapp.net`;
  await testDb`INSERT INTO users (jid) VALUES (${otherJid}) ON CONFLICT DO NOTHING`;
  await raidModel.addContribution(periodId, 0, otherJid, 600, testDb);

  const first = await raidModel.claimBossReward(periodId, 0, jid, testDb);
  assert.ok(first, 'klaim pertama menang');

  const retry = await raidModel.claimBossReward(periodId, 0, jid, testDb);
  assert.equal(retry, null, 'klaim ulang ditolak');

  // Dua klaim bersamaan untuk player lain: hanya satu yang menang.
  const concurrent = await Promise.all([
    testDb.begin(async (t) => raidModel.claimBossReward(periodId, 0, otherJid, t)),
    testDb.begin(async (t) => raidModel.claimBossReward(periodId, 0, otherJid, t)),
  ]);
  assert.equal(
    concurrent.filter(Boolean).length,
    1,
    'klaim concurrent hanya satu yang lolos'
  );

  await testDb`DELETE FROM raid_contributions WHERE jid = ${otherJid}`;
  await testDb`DELETE FROM users WHERE jid = ${otherJid}`;
});

test('raid coin: spend guard saldo cukup', { skip: SKIP }, async () => {
  await raidModel.addRaidCoin(jid, 5, testDb);
  assert.equal(await raidModel.getRaidCoin(jid, testDb), 5);
  await assert.rejects(
    () => raidModel.spendRaidCoin(jid, 10, testDb),
    /Raid Coin tidak cukup/
  );
  const left = await raidModel.spendRaidCoin(jid, 3, testDb);
  assert.equal(left, 2);
});
