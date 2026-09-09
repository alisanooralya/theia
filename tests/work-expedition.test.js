import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  JOBS,
  WORK_COOLDOWN_MS,
  getJob,
  durationLabel,
  jobLine,
} from '../src/features/economy/config/work-config.js';
import {
  EXPEDITIONS,
  EXPEDITION_COOLDOWN_MS,
  getCategory,
  getOption,
  optionLine,
} from '../src/features/rpg/config/expedition-config.js';
import { createWorkService } from '../src/features/economy/services/work-service.js';
import { createExpeditionService } from '../src/features/rpg/services/expedition-service.js';
import { applyPlayerExp, grantPlayerExp } from '../src/features/rpg/services/player-progress.js';

function fakeCoins(store) {
  return {
    async ensure(id) {
      if (!(id in store.balances)) store.balances[id] = 0;
    },
    async addCoin(id, amount) {
      if (!Number.isInteger(amount) || amount < 1) throw new RangeError('bad amount');
      store.balances[id] = (store.balances[id] ?? 0) + amount;
    },
    async getBalance(id) {
      return store.balances[id] ?? 0;
    },
  };
}

function fakePlayers(store) {
  return {
    async ensure(id) {
      if (!(id in store.players)) store.players[id] = { level: 1, exp: 0 };
    },
    async get(id) {
      return store.players[id] ?? null;
    },
    async setLevel(id, level) {
      store.players[id].level = level;
    },
    async setExp(id, exp) {
      store.players[id].exp = exp;
    },
  };
}

function fakeSessionStore() {
  const store = { rows: {}, balances: {}, players: {}, jailed: {} };
  const users = { ensure: async () => {} };
  const players = fakePlayers(store);
  const coins = fakeCoins(store);
  return { store, users, players, coins };
}

function fakeWorkModel(sessionStore) {
  return {
    async find(id) {
      return sessionStore.rows[id] ?? null;
    },
    async findActive(id) {
      const r = sessionStore.rows[id];
      return r && r.status === 'active' ? r : null;
    },
    async start(id, { job, durationSec }) {
      const cur = sessionStore.rows[id];
      if (cur && cur.status === 'active') return null;
      const now = Math.floor(Date.now() / 1000);
      const row = { jid: id, job, status: 'active', started_at: now, ends_at: now + durationSec };
      sessionStore.rows[id] = row;
      return row;
    },
    async claim(id, { rewardCoin, rewardExp }) {
      const r = sessionStore.rows[id];
      const now = Math.floor(Date.now() / 1000);
      if (!r || r.status !== 'active' || r.ends_at > now) return null;
      r.status = 'claimed';
      r.reward_coin = rewardCoin;
      r.reward_exp = rewardExp;
      return r;
    },
  };
}

describe('work config (legacy values)', () => {
  it('keeps six jobs with durations and ranges', () => {
    assert.deepEqual(JOBS.map((j) => j.id), ['ojol', 'kuli', 'kebun', 'programmer', 'guru', 'chef']);
    assert.equal(WORK_COOLDOWN_MS, 6 * 3600000);
    assert.deepEqual(getJob('kuli').coin, [2000, 3000]);
    assert.deepEqual(getJob('chef').exp, [55, 70]);
    assert.equal(getJob('OJOL').id, 'ojol');
    assert.equal(getJob('nope'), null);
    assert.equal(durationLabel(getJob('ojol')), '30 menit');
    assert.equal(durationLabel(getJob('chef')), '3 jam');
    assert.ok(jobLine(getJob('kuli')).includes('45 menit'));
  });
});

describe('expedition config (legacy values)', () => {
  it('keeps coin/exp tracks with three durations each', () => {
    assert.deepEqual(Object.keys(EXPEDITIONS).sort(), ['coin', 'exp']);
    assert.equal(EXPEDITION_COOLDOWN_MS, 12 * 3600000);
    assert.deepEqual(getOption('coin', 'short').coin, [2000, 3500]);
    assert.deepEqual(getOption('coin', 'extended').coin, [13500, 15000]);
    assert.deepEqual(getOption('exp', 'long').exp, [125, 185]);
    assert.deepEqual(getOption('exp', 'short').coin, [0, 0]);
    assert.equal(getCategory('COIN').name, 'Coin Expedition');
    assert.equal(getOption('coin', 'nope'), null);
    assert.ok(optionLine(getOption('coin', 'short')).includes('1h'));
  });
});

describe('player progress (existing curve)', () => {
  it('accumulates and levels along the curve', () => {
    const stay = applyPlayerExp(1, 0, 10);
    assert.equal(stay.level, 1);
    assert.equal(stay.exp, 10);
  });

  it('grants exp and reports level-up', async () => {
    const store = { players: { u: { level: 1, exp: 90 } } };
    const players = fakePlayers(store);
    const out = await grantPlayerExp(players, 'u', 50, null);
    assert.ok(out.leveledUp);
    assert.ok(out.newLevel >= 2);
    assert.equal(store.players.u.level, out.newLevel);
  });
});

describe('work service (pure)', () => {
  it('starts once; second start rejected; early claim rejected', async () => {
    const s = fakeSessionStore();
    const svc = createWorkService({ work: fakeWorkModel(s.store), users: s.users, players: s.players, coins: s.coins });
    const row = await svc.start('u', 'ojol');
    assert.equal(row.status, 'active');
    await assert.rejects(svc.start('u', 'kuli'), /masih bekerja/);
    await assert.rejects(svc.start('u', 'nope'), /tidak valid/);
    await assert.rejects(svc.claim('u'), /Belum ada/);
    const state = await svc.getState('u');
    assert.equal(state.active, true);
    assert.equal(state.finished, false);
  });

  it('claim after finish pays ranges and finishes session', async () => {
    const s = fakeSessionStore();
    const svc = createWorkService({ work: fakeWorkModel(s.store), users: s.users, players: s.players, coins: s.coins });
    await svc.start('u', 'kuli');
    s.store.rows.u.ends_at = Math.floor(Date.now() / 1000) - 1;
    const out = await svc.claim('u', { random: () => 0 });
    assert.equal(out.coin, 2000);
    assert.equal(out.exp, 10);
    assert.equal(s.store.balances.u, 2000);
    await assert.rejects(svc.claim('u'), /Belum ada/);
    assert.equal(s.store.balances.u, 2000);
  });

  it('concurrent claims grant once', async () => {
    const s = fakeSessionStore();
    const svc = createWorkService({ work: fakeWorkModel(s.store), users: s.users, players: s.players, coins: s.coins });
    await svc.start('u', 'ojol');
    s.store.rows.u.ends_at = Math.floor(Date.now() / 1000) - 1;
    const results = await Promise.allSettled(
      Array.from({ length: 3 }, () => svc.claim('u', { random: () => 0 }))
    );
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(s.store.balances.u, 1900);
  });
});

describe('expedition service (pure)', () => {
  function fakeExpeditionModel(sessionStore) {
    return {
      async find(id) {
        return sessionStore.rows[id] ?? null;
      },
      async start(id, { type, duration, durationSec, rewardCoin, rewardExp }) {
        const cur = sessionStore.rows[id];
        if (cur && cur.status === 'active') return null;
        const now = Math.floor(Date.now() / 1000);
        const row = { jid: id, type, duration, status: 'active', reward_coin: rewardCoin, reward_exp: rewardExp, started_at: now, ends_at: now + durationSec };
        sessionStore.rows[id] = row;
        return row;
      },
      async claim(id) {
        const r = sessionStore.rows[id];
        const now = Math.floor(Date.now() / 1000);
        if (!r || r.status !== 'active' || r.ends_at > now) return null;
        r.status = 'claimed';
        return r;
      },
    };
  }

  it('rolls stored rewards at start within option ranges', async () => {
    const s = fakeSessionStore();
    const svc = createExpeditionService({ expeditions: fakeExpeditionModel(s.store), users: s.users, players: s.players, coins: s.coins });
    const row = await svc.start('u', 'coin', 'long', { random: () => 0 });
    assert.equal(row.reward_coin, 5500);
    assert.equal(row.reward_exp, 0);
    await assert.rejects(svc.start('u', 'coin', 'short'), /berjalan/);
    await assert.rejects(svc.start('u', 'coin', 'nope'), /tidak valid/);
    await assert.rejects(svc.start('u', 'nope', 'short'), /tidak valid/);
  });

  it('claim pays stored amounts; retry pays nothing', async () => {
    const s = fakeSessionStore();
    const svc = createExpeditionService({ expeditions: fakeExpeditionModel(s.store), users: s.users, players: s.players, coins: s.coins });
    await svc.start('u', 'exp', 'short', { random: () => 0 });
    s.store.rows.u.ends_at = Math.floor(Date.now() / 1000) - 1;
    const out = await svc.claim('u');
    assert.equal(out.coin, 0);
    assert.equal(out.exp, 30);
    assert.equal(s.store.players.u.exp, 30);
    await assert.rejects(svc.claim('u'), /tidak bisa diklaim/);
    assert.equal(s.store.players.u.exp, 30);
  });
});

describe('work/expedition commands (metadata)', () => {
  it('registers legacy names, aliases, and manual cooldowns', async () => {
    const work = (await import('../src/commands/modules/economy/work.js')).default;
    const expe = (await import('../src/commands/modules/rpg/expedition.js')).default;
    assert.equal(work.name, 'work');
    assert.ok(work.aliases.includes('kerja') && work.aliases.includes('bekerja'));
    assert.equal(work.category, 'economy');
    assert.equal(work.manualCooldown, true);
    assert.equal(expe.name, 'expedition');
    assert.ok(expe.aliases.includes('expe') && expe.aliases.includes('ekspedisi'));
    assert.equal(expe.category, 'rpg');
    assert.equal(expe.manualCooldown, true);
  });
});
