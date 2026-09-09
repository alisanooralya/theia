import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  CRIMES,
  CRIME_COOLDOWN_MS,
  getCrime,
  successChance,
  crimeStatLine,
  formatRemaining,
} from '../src/features/economy/config/crime-config.js';
import {
  randInt,
  rollOutcome,
  createCrimeService,
} from '../src/features/economy/services/crime-service.js';

function fakeStore(balances = {}, jailed = {}) {
  return {
    balances,
    jailed,
    users: { ensure: async () => {} },
    players: { ensure: async () => {} },
  };
}

function fakeCoins(store) {
  return {
    async ensure(id) {
      if (!(id in store.balances)) store.balances[id] = 0;
    },
    async addCoin(id, amount) {
      if (!Number.isInteger(amount) || amount < 1) throw new RangeError('bad amount');
      store.balances[id] = (store.balances[id] ?? 0) + amount;
    },
    async spendCoin(id, amount) {
      if ((store.balances[id] ?? 0) < amount) throw new RangeError('Coin tidak cukup');
      store.balances[id] -= amount;
      return store.balances[id];
    },
    async getBalance(id) {
      return store.balances[id] ?? 0;
    },
  };
}

function fakeUsers(store) {
  return {
    ensure: async () => {},
    getPrisonUntil: async (id) => store.jailed[id] ?? 0,
    setPrisonUntil: async (id, until) => {
      store.jailed[id] = until;
    },
  };
}

const makeService = (store) => {
  const coins = fakeCoins(store);
  return createCrimeService({
    users: fakeUsers(store),
    players: store.players,
    coins,
  });
};

describe('crime config (legacy values)', () => {
  it('keeps five crimes with ranges, chances, and jail terms', () => {
    assert.deepEqual(CRIMES.map((c) => c.id), ['jambret', 'hacker', 'copet', 'judi', 'skimming']);
    assert.equal(CRIME_COOLDOWN_MS, 3600000);
    const copet = getCrime('copet');
    assert.deepEqual(copet.reward, [3000, 4000]);
    assert.equal(copet.successChance, 0.75);
    assert.equal(copet.prisonMs, 4 * 3600000);
    assert.equal(getCrime('SKIMMING').id, 'skimming');
    assert.equal(getCrime('nope'), null);
    assert.ok(!('exp' in copet), 'no legacy user-exp field');
  });

  it('formats stats and jail countdown like legacy', () => {
    assert.equal(crimeStatLine(getCrime('copet')), '🪙 3k-4k • Sukses 75% • Jail 4j');
    assert.equal(successChance(getCrime('judi')), 0.4);
    assert.equal(successChance(getCrime('copet')), 0.75);
    assert.equal(formatRemaining(125), '02:05');
    assert.equal(formatRemaining(59), '00:59');
  });
});

describe('rollOutcome (legacy table)', () => {
  it('forces each branch deterministically', () => {
    const copet = getCrime('copet');
    assert.equal(rollOutcome(copet, () => 0), 'success');
    assert.equal(rollOutcome(copet, () => 0.8), 'caught');
    assert.equal(rollOutcome(copet, () => 0.999), 'fail');
    const judi = getCrime('judi');
    assert.equal(rollOutcome(judi, () => 0.01), 'jackpot');
    assert.equal(rollOutcome(judi, () => 0.2), 'success');
    assert.equal(rollOutcome(judi, () => 0.5), 'caught');
    assert.equal(rollOutcome(judi, () => 0.9), 'lose');
  });

  it('distributes roughly per chances', () => {
    const counts = {};
    for (let i = 0; i < 2000; i++) {
      const o = rollOutcome(getCrime('jambret'));
      counts[o] = (counts[o] ?? 0) + 1;
    }
    assert.ok(counts.success > 900 && counts.success < 1300);
    assert.ok(counts.caught > 400 && counts.caught < 800);
    assert.ok(counts.fail > 100 && counts.fail < 400);
  });

  it('rolls integers within range', () => {
    for (let i = 0; i < 200; i++) {
      const v = randInt(4000, 6000);
      assert.ok(v >= 4000 && v <= 6000);
    }
    assert.equal(randInt(5, 9, () => 0), 5);
  });
});

describe('crime service (pure)', () => {
  it('rejects unknown crime and jailed users', async () => {
    const store = fakeStore({ u: 1000 });
    const svc = makeService(store);
    await assert.rejects(svc.commitCrime('u', 'nope'), /unknown crime/);
    store.jailed.u = Math.floor(Date.now() / 1000) + 3600;
    assert.ok((await svc.jailRemaining('u')) > 3500);
    await assert.rejects(svc.commitCrime('u', 'copet'), /jailed/);
  });

  it('success credits config-range reward exactly once', async () => {
    const store = fakeStore({ u: 1000 });
    const svc = makeService(store);
    const out = await svc.commitCrime('u', 'copet', { random: () => 0 });
    assert.equal(out.outcome, 'success');
    assert.equal(out.reward, 3000);
    assert.equal(store.balances.u, 4000);
  });

  it('fail changes nothing; caught fines and jails', async () => {
    const store = fakeStore({ u: 10000 });
    const svc = makeService(store);
    const fail = await svc.commitCrime('u', 'copet', { random: () => 0.999 });
    assert.equal(fail.outcome, 'fail');
    assert.equal(store.balances.u, 10000);
    assert.equal(store.jailed.u ?? 0, 0);
    const c2 = await svc.commitCrime('u', 'copet', { random: () => 0.8 });
    assert.equal(c2.outcome, 'caught');
    assert.ok(c2.penalty >= 500 && c2.penalty <= 1500);
    assert.equal(store.balances.u, 10000 - c2.penalty);
    assert.ok(store.jailed.u > Math.floor(Date.now() / 1000));
    await assert.rejects(svc.commitCrime('u', 'copet'), /jailed/);
  });

  it('judi jackpot/lose follow legacy branches', async () => {
    const store = fakeStore({ u: 5000 });
    const svc = makeService(store);
    const jack = await svc.commitCrime('u', 'judi', { random: () => 0.01 });
    assert.equal(jack.outcome, 'jackpot');
    assert.ok(jack.reward >= 15000 && jack.reward <= 30000);
    const store2 = fakeStore({ v: 5000 });
    const svc2 = makeService(store2);
    const lose = await svc2.commitCrime('v', 'judi', { random: () => 0.9 });
    assert.equal(lose.outcome, 'lose');
    assert.ok(lose.lose >= 500 && lose.lose <= 2000);
    assert.equal(store2.balances.v, 5000 - lose.lose);
  });

  it('concurrent crimes stay consistent, no negatives', async () => {
    const store = fakeStore({ u: 0 });
    const svc = makeService(store);
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => svc.commitCrime('u', 'copet', { random: () => 0 }))
    );
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 5);
    assert.equal(store.balances.u, 15000);
  });
});

describe('crime command (metadata)', () => {
  it('registers legacy name, aliases, and manual cooldown', async () => {
    const mod = (await import('../src/commands/modules/economy/crime.js')).default;
    assert.equal(mod.name, 'crime');
    assert.ok(mod.aliases.includes('kejahatan'));
    assert.ok(mod.aliases.includes('jahat'));
    assert.equal(mod.category, 'economy');
    assert.equal(mod.manualCooldown, true);
    assert.equal(typeof mod.execute, 'function');
  });
});
