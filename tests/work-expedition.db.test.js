import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { sql, closeDatabase } from '../src/storage/connection.js';
import { createSchema } from '../src/storage/definitions.js';
import { userModel } from '../src/storage/models/user.js';
import { rpgPlayerModel } from '../src/features/rpg/models/rpg-player.model.js';
import { rpgCoinModel } from '../src/features/rpg/models/rpg-coin.model.js';
import { workService } from '../src/features/economy/services/work-service.js';
import { expeditionService } from '../src/features/rpg/services/expedition-service.js';

let dbAvailable;
try {
  await sql`SELECT 1`;
  dbAvailable = true;
} catch {
  dbAvailable = false;
}

const RUN = `${process.pid}-${Date.now()}`;
const uid = (n) => `workexpe-${RUN}-${n}@test.local`;
const createdUsers = [];

async function makeUser(n) {
  const userId = uid(n);
  await userModel.ensure(userId, { pushName: 'Tester' });
  await rpgPlayerModel.ensure(userId);
  await rpgCoinModel.ensure(userId);
  createdUsers.push(userId);
  return userId;
}

async function finishWork(userId) {
  await sql`UPDATE work_sessions SET ends_at = ${Math.floor(Date.now() / 1000) - 1} WHERE jid = ${userId}`;
}

async function finishExpedition(userId) {
  await sql`UPDATE expeditions SET ends_at = ${Math.floor(Date.now() / 1000) - 1} WHERE jid = ${userId}`;
}

function mockCtx(overrides = {}) {
  const replies = [];
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
    },
    replies,
  };
}

describe('work + expedition (database)', { skip: !dbAvailable }, () => {
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

  it('work start blocks second job; early claim rejected', async () => {
    const userId = await makeUser('w1');
    const row = await workService.start(userId, 'ojol');
    assert.equal(row.status, 'active');
    assert.equal(row.job, 'ojol');
    await assert.rejects(workService.start(userId, 'kuli'), /masih bekerja/);
    await assert.rejects(workService.claim(userId), /Belum ada/);
    const state = await workService.getState(userId);
    assert.equal(state.active, true);
    assert.equal(state.finished, false);
  });

  it('work claim pays ranges into wallet + player, once only', async () => {
    const userId = await makeUser('w2');
    await workService.start(userId, 'kuli');
    await finishWork(userId);
    const out = await workService.claim(userId, { random: () => 0 });
    assert.equal(out.coin, 2000);
    assert.equal(out.exp, 10);
    assert.equal(await rpgCoinModel.getBalance(userId), 2000);
    const player = await rpgPlayerModel.get(userId);
    assert.equal(player.exp, 10);
    await assert.rejects(workService.claim(userId), /Belum ada/);
    assert.equal(await rpgCoinModel.getBalance(userId), 2000);
  });

  it('work concurrent claims grant once', async () => {
    const userId = await makeUser('w3');
    await workService.start(userId, 'ojol');
    await finishWork(userId);
    const results = await Promise.allSettled(
      Array.from({ length: 3 }, () => workService.claim(userId, { random: () => 0 }))
    );
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(await rpgCoinModel.getBalance(userId), 1900);
  });

  it('expedition start stores ranged rewards; double start rejected', async () => {
    const userId = await makeUser('e1');
    const row = await expeditionService.start(userId, 'coin', 'long', { random: () => 0 });
    assert.equal(row.reward_coin, 5500);
    assert.equal(row.reward_exp, 0);
    await assert.rejects(expeditionService.start(userId, 'coin', 'short'), /berjalan/);
    await assert.rejects(expeditionService.start(userId, 'coin', 'nope'), /tidak valid/);
    await assert.rejects(expeditionService.claim(userId), /tidak bisa diklaim/);
  });

  it('expedition claim pays stored coin + exp, retry pays nothing', async () => {
    const userId = await makeUser('e2');
    await expeditionService.start(userId, 'exp', 'short', { random: () => 0 });
    await finishExpedition(userId);
    const out = await expeditionService.claim(userId);
    assert.equal(out.coin, 0);
    assert.equal(out.exp, 30);
    const player = await rpgPlayerModel.get(userId);
    assert.equal(player.exp, 30);
    await assert.rejects(expeditionService.claim(userId), /tidak bisa diklaim/);
    assert.equal((await rpgPlayerModel.get(userId)).exp, 30);
  });

  it('expedition coin claim credits wallet exactly', async () => {
    const userId = await makeUser('e3');
    const row = await expeditionService.start(userId, 'coin', 'short', { random: () => 0 });
    assert.equal(row.reward_coin, 2000);
    await finishExpedition(userId);
    const out = await expeditionService.claim(userId);
    assert.equal(out.coin, 2000);
    assert.equal(await rpgCoinModel.getBalance(userId), 2000);
  });

  it('commands stay thin: unknown options and claim paths', async () => {
    const workMod = await import('../src/commands/modules/economy/work.js');
    const expeMod = await import('../src/commands/modules/rpg/expedition.js');
    const userId = await makeUser('cmd');

    const unknownJob = mockCtx({ sender: userId, args: ['nope'] });
    await assert.rejects(workMod.default.execute(unknownJob.ctx), /tidak ditemukan/);

    const noWork = mockCtx({ sender: userId, args: ['claim'] });
    await assert.rejects(workMod.default.execute(noWork.ctx), /belum bekerja/i);

    const started = mockCtx({ sender: userId, args: ['ojol'] });
    await workMod.default.execute(started.ctx);
    assert.ok(started.replies[0].includes('MULAI BEKERJA'));

    const unknownType = mockCtx({ sender: userId, args: ['nope', 'short'] });
    await assert.rejects(expeMod.default.execute(unknownType.ctx), /tidak valid/);

    const noExpe = mockCtx({ sender: userId, args: ['claim'] });
    await assert.rejects(expeMod.default.execute(noExpe.ctx), /bisa diklaim/);

    const estarted = mockCtx({ sender: userId, args: ['coin', 'short'] });
    await expeMod.default.execute(estarted.ctx);
    assert.ok(estarted.replies[0].includes('Durasi'));
  });
});
