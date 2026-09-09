import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { sql, closeDatabase } from '../src/storage/connection.js';
import { createSchema } from '../src/storage/definitions.js';
import { userModel } from '../src/storage/models/user.js';
import { rpgPlayerModel } from '../src/features/rpg/models/rpg-player.model.js';
import { rpgCoinModel } from '../src/features/rpg/models/rpg-coin.model.js';
import { transferService } from '../src/features/economy/services/transfer-service.js';

let dbAvailable;
try {
  await sql`SELECT 1`;
  dbAvailable = true;
} catch {
  dbAvailable = false;
}

const uid = (n) => `transfertest-${process.pid}-${n}@test.local`;
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

function trackUser(userId) {
  createdUsers.push(userId);
  return userId;
}

function mockCtx(overrides = {}) {
  const replies = [];
  return {
    ctx: {
      sender: overrides.sender,
      pushName: 'Tester',
      mentions: overrides.mentions ?? [],
      quoted: overrides.quoted ?? null,
      args: overrides.args ?? [],
      reply: async (m, _opts) => replies.push(m),
      // NOTE: real ctx.fail throws synchronously (see messages/context.js).
      fail: (m) => {
        throw new Error(m);
      },
    },
    replies,
  };
}

describe('economy transfer (database)', { skip: !dbAvailable }, () => {
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

  it('transfer berhasil: full amount pindah, total conserved', async () => {
    const alice = await makeFundedUser('t1a', 50000);
    const bob = trackUser(uid('t1b'));
    const out = await transferService.transfer(alice, bob, '20000');
    assert.deepEqual(out, { amount: 20000, senderCoin: 30000, receiverCoin: 20000 });
    assert.equal(await rpgCoinModel.getBalance(alice), 30000);
    assert.equal(await rpgCoinModel.getBalance(bob), 20000);
  });

  it('melebihi saldo ditolak, kedua saldo tidak berubah', async () => {
    const alice = await makeFundedUser('t2a', 10000);
    const bob = await makeFundedUser('t2b', 5000);
    await assert.rejects(transferService.transfer(alice, bob, 50000), /Coin tidak cukup/);
    assert.equal(await rpgCoinModel.getBalance(alice), 10000);
    assert.equal(await rpgCoinModel.getBalance(bob), 5000);
  });

  it('invalid/zero/negative amount ditolak (atomic)', async () => {
    const alice = await makeFundedUser('t3a', 30000);
    const bob = await makeFundedUser('t3b', 0);
    for (const bad of ['abc', undefined, 0, '0', -5, 1.5]) {
      await assert.rejects(transferService.transfer(alice, bob, bad), RangeError);
    }
    assert.equal(await rpgCoinModel.getBalance(alice), 30000);
    assert.equal(await rpgCoinModel.getBalance(bob), 0);
  });

  it('self-transfer ditolak', async () => {
    const alice = await makeFundedUser('t4a', 30000);
    await assert.rejects(transferService.transfer(alice, alice, 1000), /diri sendiri/);
    assert.equal(await rpgCoinModel.getBalance(alice), 30000);
  });

  it('concurrent searah: 10x1000 dari 20000 -> semua berhasil', async () => {
    const alice = await makeFundedUser('t5a', 20000);
    const bob = trackUser(uid('t5b'));
    await rpgPlayerModel.ensure(bob);
    await rpgCoinModel.ensure(bob);
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => transferService.transfer(alice, bob, 1000))
    );
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 10);
    assert.equal(await rpgCoinModel.getBalance(alice), 10000);
    assert.equal(await rpgCoinModel.getBalance(bob), 10000);
  });

  it('concurrent contention: 5x10000 dari 20000 -> tepat 2 berhasil', async () => {
    const alice = await makeFundedUser('t6a', 20000);
    const bob = trackUser(uid('t6b'));
    await rpgPlayerModel.ensure(bob);
    await rpgCoinModel.ensure(bob);
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => transferService.transfer(alice, bob, 10000))
    );
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 2);
    assert.equal(results.filter((r) => r.status === 'rejected').length, 3);
    assert.equal(await rpgCoinModel.getBalance(alice), 0);
    assert.equal(await rpgCoinModel.getBalance(bob), 20000);
  });

  it('concurrent berlawanan arah: tanpa deadlock, total conserved', async () => {
    const alice = await makeFundedUser('t7a', 30000);
    const bob = await makeFundedUser('t7b', 30000);
    const results = await Promise.allSettled([
      ...Array.from({ length: 5 }, () => transferService.transfer(alice, bob, 10000)),
      ...Array.from({ length: 5 }, () => transferService.transfer(bob, alice, 10000)),
    ]);
    // Either direction may legitimately lose a race for funds (5x10000
    // out of 30000); what must hold: no deadlock, no negatives, and the
    // combined total conserved regardless of winners.
    assert.ok(results.every((r) => r.status === 'fulfilled' || r.status === 'rejected'));
    const aBal = await rpgCoinModel.getBalance(alice);
    const bBal = await rpgCoinModel.getBalance(bob);
    assert.ok(aBal >= 0 && bBal >= 0);
    assert.equal(aBal + bBal, 60000);
  });

  it('command stays thin: mention transfer + usage/self/invalid paths', async () => {
    const alice = await makeFundedUser('t8a', 50000);
    const bob = await makeFundedUser('t8b', 1000);
    const mod = await import('../src/commands/modules/economy/transfer.js');

    const ok = mockCtx({ sender: alice, mentions: [bob], args: ['20000'] });
    await mod.default.execute(ok.ctx);
    assert.ok(ok.replies[0].includes('Transfer'));
    assert.ok(ok.replies[0].includes('30'));

    const usage = mockCtx({ sender: alice, args: [] });
    await assert.rejects(mod.default.execute(usage.ctx), /Usage/);

    const self = mockCtx({ sender: alice, mentions: [alice], args: ['1000'] });
    await assert.rejects(mod.default.execute(self.ctx), /diri sendiri/);

    const bad = mockCtx({ sender: alice, mentions: [bob], args: ['abc'] });
    await assert.rejects(mod.default.execute(bad.ctx), /Jumlah tidak valid/);

    assert.equal(await rpgCoinModel.getBalance(alice), 30000);
    assert.equal(await rpgCoinModel.getBalance(bob), 21000);
  });
});
