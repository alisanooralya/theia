import { test } from 'node:test';
import assert from 'node:assert/strict';
import { raidDayKey } from '#features/rpg/raid.js';

test('format key hari: YYYY-MM-DD', () => {
  const key = raidDayKey(Date.UTC(2026, 8, 7, 10, 0));
  assert.match(key, /^\d{4}-\d{2}-\d{2}$/);
});

test('reset berbasis tanggal (bukan restart): tengah hari Jakarta tetap hari sama', () => {
  // 10:00 UTC = 17:00 Jakarta, masih 7 Sep
  assert.equal(raidDayKey(Date.UTC(2026, 8, 7, 10, 0), 'Asia/Jakarta'), '2026-09-07');
});

test('batas tengah hari Jakarta: 17:00 UTC = 00:00 hari berikutnya', () => {
  assert.equal(raidDayKey(Date.UTC(2026, 8, 7, 17, 0), 'Asia/Jakarta'), '2026-09-08');
  assert.equal(raidDayKey(Date.UTC(2026, 8, 7, 16, 59), 'Asia/Jakarta'), '2026-09-07');
});

test('timezone param mengubah hasil key', () => {
  assert.equal(raidDayKey(Date.UTC(2026, 8, 7, 17, 0), 'UTC'), '2026-09-07');
  assert.equal(raidDayKey(Date.UTC(2026, 8, 7, 17, 0), 'Asia/Jakarta'), '2026-09-08');
});

test('key hari berbeda antara dua tanggal berurutan', () => {
  const a = raidDayKey(Date.UTC(2026, 8, 6, 0, 0));
  const b = raidDayKey(Date.UTC(2026, 8, 7, 0, 0));
  assert.notEqual(a, b);
});
