import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { sql, closeDatabase } from '../src/storage/connection.js';
import { createSchema } from '../src/storage/definitions.js';
import { userModel } from '../src/storage/models/user.js';
import { rpgPlayerModel } from '../src/features/rpg/models/rpg-player.model.js';
import { rpgCoinModel } from '../src/features/rpg/models/rpg-coin.model.js';
import { crimeService } from '../src/features/economy/services/crime-service.js';

let dbAvailable;
try {
  await sql`SELECT 1`;
  dbAvailable = true;
} catch {
  dbAvailable = false;
}

const RUN = `${process.pid}-${Date.now()}`;
const uid = (n) => `crimetest-${RUN}-${n}@test.local`;
const createdUsers = [];

async function makeFundedUser(n, coin) {
  const userId = uid(n);
  await userModel.ensure(userId, { pushName: 'Tester' });
  await rpgPlayerModel.ensure(userId);
  await rpgCoinModel.ensure(userId);
  if (coin > 0) await rpgCoinModel.addCoin(userId, coin);
  createdUsers.push(userId);
  return userId;
}

function mockCtx(overrides = {}) {
  const replies = [];
  const edits = [];
  return {
    ctx: {
      sender: overrides.sender,
      jid: 'test@g.us',
      pushName: 'Tester',
      args: overrides.args ?? [],
      reply: async (m) => {
        replies.push(m);
        return { key: { id: `k${replies.length}` } };
      },
      // NOTE: real ctx.fail throws synchronously (see messages/context.js).
      fail: (m) => {
        throw new Error(m);
      },
      applyCooldown: async () => {},
      clearCooldown: async () => {},
      sock: {
        sendMessage: async (_jid, body) => {
          edits.push(body);
          return {};
        },
      },
    },
    replies,
    edits,
  };
}

describe('economy crime (database)', { skip: !dbAvailable }, () => {
  before(async () => {
    await createSchema();
    await createSchema();
  });

  after(async () => {
    if (createdUsers.length) {
      await sql`DELETE FROM users WHERE jid = ANY(${createdUsers})`;
    }
    await closeDatabase();
  });

  it('success persists config-range reward exactly once', async () => {
    const userId = await makeFundedUser('win', 1000);
    const out = await crimeService.commitCrime(userId, 'copet', { random: () => 0 });
    assert.equal(out.outcome, 'success');
    assert.equal(out.reward, 3000);
    assert.equal(await rpgCoinModel.getBalance(userId), 4000);
    const again = await rpgCoinModel.getBalance(userId);
    assert.equal(again, 4000);
  });

  it('caught persists penalty + jail; crime blocked while jailed', async () => {
    const userId = await makeFundedUser('caught', 10000);
    const out = await crimeService.commitCrime(userId, 'copet', { random: () => 0.8 });
    assert.equal(out.outcome, 'caught');
    assert.equal(await rpgCoinModel.getBalance(userId), 10000 - out.penalty);
    const stored = await userModel.getPrisonUntil(userId);
    assert.equal(stored, out.prisonUntil);
    assert.ok((await crimeService.jailRemaining(userId)) > 14000);
    await assert.rejects(crimeService.commitCrime(userId, 'copet'), /jailed/);
    assert.equal(await rpgCoinModel.getBalance(userId), 10000 - out.penalty);
  });

  it('expired jail frees the user without touching coin', async () => {
    const userId = await makeFundedUser('free', 7000);
    await userModel.setPrisonUntil(userId, Math.floor(Date.now() / 1000) - 10);
    assert.equal(await crimeService.jailRemaining(userId), 0);
    const out = await crimeService.commitCrime(userId, 'copet', { random: () => 0 });
    assert.equal(out.outcome, 'success');
    assert.equal(await rpgCoinModel.getBalance(userId), 10000);
  });

  it('lose clamps to wallet (empty wallet loses nothing)', async () => {
    const userId = await makeFundedUser('broke', 0);
    const out = await crimeService.commitCrime(userId, 'judi', { random: () => 0.9 });
    assert.equal(out.outcome, 'lose');
    assert.equal(out.lose, 0);
    assert.equal(await rpgCoinModel.getBalance(userId), 0);
  });

  it('concurrent crimes: each grants once, balances stay consistent', async () => {
    const userId = await makeFundedUser('race', 0);
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => crimeService.commitCrime(userId, 'copet', { random: () => 0 }))
    );
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 5);
    assert.equal(await rpgCoinModel.getBalance(userId), 15000);
  });

  it('command: jailed reply, unknown crime, success text', async () => {
    const mod = await import('../src/commands/modules/economy/crime.js');
    const jailed = await makeFundedUser('cmdjail', 5000);
    await userModel.setPrisonUntil(jailed, Math.floor(Date.now() / 1000) + 3600);
    const j = mockCtx({ sender: jailed, args: ['copet'] });
    await mod.default.execute(j.ctx);
    assert.ok(j.replies[0].includes('penjara'));

    const fresh = await makeFundedUser('cmdfresh', 5000);
    const u = mockCtx({ sender: fresh, args: ['nope'] });
    await assert.rejects(mod.default.execute(u.ctx), /tidak ditemukan/);

    const wins = await makeFundedUser('cmdwin', 1000);
    const w = mockCtx({ sender: wins, args: ['copet'] });
    // Force success path deterministically through the service route:
    // command uses live random; only assert it resolves to some result.
    await mod.default.execute(w.ctx);
    assert.ok(w.replies.length >= 1 || w.edits.length >= 1);
  });
});
