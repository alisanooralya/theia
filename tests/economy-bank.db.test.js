import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { sql, closeDatabase } from '../src/storage/connection.js';
import { createSchema } from '../src/storage/definitions.js';
import { userModel } from '../src/storage/models/user.js';
import { rpgPlayerModel } from '../src/features/rpg/models/rpg-player.model.js';
import { rpgCoinModel } from '../src/features/rpg/models/rpg-coin.model.js';
import { bankService } from '../src/features/economy/services/bank-service.js';

let dbAvailable;
try {
  await sql`SELECT 1`;
  dbAvailable = true;
} catch {
  dbAvailable = false;
}

const uid = (n) => `banktest-${process.pid}-${n}@test.local`;
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
  return {
    ctx: {
      sender: overrides.sender,
      pushName: 'Tester',
      mentions: overrides.mentions ?? [],
      quoted: overrides.quoted ?? null,
      args: overrides.args ?? [],
      reply: async (m, _opts) => replies.push(m),
      // NOTE: real ctx.fail throws synchronously (see messages/context.js),
      // so the mock must too — the commands call it without await.
      fail: (m) => {
        throw new Error(m);
      },
    },
    replies,
  };
}

describe('economy balance + bank (database)', { skip: !dbAvailable }, () => {
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

  it('cek balance: reads coin/bank/total without mutating', async () => {
    const userId = await makeFundedUser('balance', 125000);
    const first = await bankService.getBalance(userId);
    assert.deepEqual(first, { coin: 125000, bank: 0, total: 125000 });
    const second = await bankService.getBalance(userId);
    assert.deepEqual(second, first);
  });

  it('cek bank (.bank no args shows bank balance)', async () => {
    const userId = await makeFundedUser('bankshow', 80000);
    await bankService.deposit(userId, 30000);
    const { ctx, replies } = mockCtx({ sender: userId, args: [] });
    const mod = await import('../src/commands/modules/economy/bank.js');
    await mod.default.execute(ctx);
    assert.ok(replies[0].includes('BANK'));
    assert.ok(replies[0].includes('30'));
    assert.ok(replies[0].includes('50'));
  });

  it('deposit berhasil: coin berkurang, bank bertambah, total tetap', async () => {
    const userId = await makeFundedUser('deposit', 125000);
    const out = await bankService.deposit(userId, '50000');
    assert.deepEqual(out, { coin: 75000, bank: 50000, total: 125000, amount: 50000 });
  });

  it('withdraw berhasil: bank berkurang, coin bertambah, total tetap', async () => {
    const userId = await makeFundedUser('withdraw', 100000);
    await bankService.deposit(userId, 50000);
    const out = await bankService.withdraw(userId, 20000);
    assert.deepEqual(out, { coin: 70000, bank: 30000, total: 100000, amount: 20000 });
  });

  it('deposit melebihi coin ditolak, saldo tidak berubah', async () => {
    const userId = await makeFundedUser('overdeposit', 10000);
    await assert.rejects(bankService.deposit(userId, 50000), /Coin tidak cukup/);
    assert.deepEqual(await bankService.getBalance(userId), { coin: 10000, bank: 0, total: 10000 });
  });

  it('withdraw melebihi bank ditolak, saldo tidak berubah', async () => {
    const userId = await makeFundedUser('overwithdraw', 20000);
    await bankService.deposit(userId, 5000);
    await assert.rejects(bankService.withdraw(userId, 20000), /Saldo bank tidak cukup/);
    assert.deepEqual(await bankService.getBalance(userId), { coin: 15000, bank: 5000, total: 20000 });
  });

  it('invalid amount ditolak (atomic: saldo tidak berubah)', async () => {
    const userId = await makeFundedUser('invalid', 30000);
    for (const bad of ['abc', undefined, '10k', 1.5]) {
      await assert.rejects(bankService.deposit(userId, bad), RangeError);
      await assert.rejects(bankService.withdraw(userId, bad), RangeError);
    }
    assert.deepEqual(await bankService.getBalance(userId), { coin: 30000, bank: 0, total: 30000 });
  });

  it('zero/negative amount ditolak (atomic: saldo tidak berubah)', async () => {
    const userId = await makeFundedUser('zeroneg', 30000);
    for (const bad of [0, '0', -5, '-5']) {
      await assert.rejects(bankService.deposit(userId, bad), RangeError);
      await assert.rejects(bankService.withdraw(userId, bad), RangeError);
    }
    assert.deepEqual(await bankService.getBalance(userId), { coin: 30000, bank: 0, total: 30000 });
  });

  it('concurrent deposit: 10x10rb dari 100rb -> coin 0, bank 100rb', async () => {
    const userId = await makeFundedUser('racedeposit', 100000);
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => bankService.deposit(userId, 10000))
    );
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 10);
    assert.deepEqual(await bankService.getBalance(userId), { coin: 0, bank: 100000, total: 100000 });
  });

  it('concurrent withdraw: 10x10rb dari bank 100rb -> coin 100rb, bank 0', async () => {
    const userId = await makeFundedUser('racewithdraw', 100000);
    await bankService.deposit(userId, 100000);
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => bankService.withdraw(userId, 10000))
    );
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 10);
    assert.deepEqual(await bankService.getBalance(userId), { coin: 100000, bank: 0, total: 100000 });
  });

  it('concurrent contention: 5x20rb dari 50rb -> tepat 2 berhasil, tanpa negatif', async () => {
    const userId = await makeFundedUser('racecontent', 50000);
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => bankService.deposit(userId, 20000))
    );
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 2);
    assert.equal(results.filter((r) => r.status === 'rejected').length, 3);
    assert.deepEqual(await bankService.getBalance(userId), { coin: 10000, bank: 40000, total: 50000 });
  });

  it('conservation: rangkaian deposit/withdraw tidak mengubah total', async () => {
    const userId = await makeFundedUser('conserve', 90000);
    const totals = [];
    totals.push((await bankService.deposit(userId, 30000)).total);
    totals.push((await bankService.withdraw(userId, 10000)).total);
    totals.push((await bankService.deposit(userId, 15000)).total);
    totals.push((await bankService.withdraw(userId, 35000)).total);
    assert.ok(totals.every((t) => t === 90000));
    assert.deepEqual(await bankService.getBalance(userId), { coin: 90000, bank: 0, total: 90000 });
  });

  it('commands stay thin: balance/bank execute against real db', async () => {
    const userId = await makeFundedUser('cmd', 125000);
    const otherId = await makeFundedUser('cmdother', 7000);
    const balanceMod = await import('../src/commands/modules/economy/balance.js');
    const bankMod = await import('../src/commands/modules/economy/bank.js');

    const self = mockCtx({ sender: userId, args: [] });
    await balanceMod.default.execute(self.ctx);
    assert.ok(self.replies[0].includes('💰 Coin:'));
    assert.ok(self.replies[0].includes('🏦 Bank:'));
    assert.ok(self.replies[0].includes('💎 Total:'));

    const mention = mockCtx({ sender: userId, mentions: [otherId], args: [] });
    await balanceMod.default.execute(mention.ctx);
    assert.ok(mention.replies[0].includes('💎 Total:'));

    const deposit = mockCtx({ sender: userId, args: ['deposit', '50000'] });
    await bankMod.default.execute(deposit.ctx);
    assert.ok(deposit.replies[0].includes('Deposit'));

    const withdraw = mockCtx({ sender: userId, args: ['ambil', '20000'] });
    await bankMod.default.execute(withdraw.ctx);
    assert.ok(withdraw.replies[0].includes('Withdraw'));

    const bad = mockCtx({ sender: userId, args: ['deposit'] });
    await assert.rejects(bankMod.default.execute(bad.ctx), /Usage/);

    const badAmount = mockCtx({ sender: userId, args: ['deposit', 'abc'] });
    await assert.rejects(bankMod.default.execute(badAmount.ctx), /Jumlah tidak valid/);

    const usage = mockCtx({ sender: userId, args: ['bogus'] });
    await assert.rejects(bankMod.default.execute(usage.ctx), /Usage/);

    assert.deepEqual(await bankService.getBalance(userId), { coin: 95000, bank: 30000, total: 125000 });
  });
});
