import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { sql, closeDatabase } from '../src/storage/connection.js';
import { createSchema } from '../src/storage/definitions.js';
import { userModel } from '../src/storage/models/user.js';
import { rpgPlayerModel } from '../src/features/rpg/models/rpg-player.model.js';
import { rpgCoinModel } from '../src/features/rpg/models/rpg-coin.model.js';
import { bountyService } from '../src/features/economy/services/bounty-service.js';
import { fishService } from '../src/features/economy/services/fish-service.js';
import { healService } from '../src/features/rpg/services/heal-service.js';

let dbAvailable;
try {
  await sql`SELECT 1`;
  dbAvailable = true;
} catch {
  dbAvailable = false;
}

const RUN = `${process.pid}-${Date.now()}`;
const uid = (n) => `bfh-${RUN}-${n}@test.local`;
const createdUsers = [];

async function makeUser(n, { atk = null, hp = null } = {}) {
  const userId = uid(n);
  await userModel.ensure(userId, { pushName: 'Tester' });
  await rpgPlayerModel.ensure(userId);
  await rpgCoinModel.ensure(userId);
  if (atk !== null || hp !== null) {
    const fields = {};
    if (atk !== null) {
      fields.atk = atk;
      fields.max_hp = hp ?? 100000;
      fields.current_hp = hp ?? 100000;
    }
    if (hp !== null && atk === null) {
      fields.max_hp = hp;
      fields.current_hp = hp;
    }
    await rpgPlayerModel.update(userId, fields);
  }
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

describe('bounty + fish + heal (database)', { skip: !dbAvailable }, () => {
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

  it('bounty: lose path grants nothing, consumes the daily slot', async () => {
    const userId = await makeUser('loser');
    const out = await bountyService.attempt(userId, 'easy', 'copet', {
      random: () => 0.5,
    });
    assert.equal(out.won, false);
    assert.equal(out.reward, null);
    assert.equal(await rpgCoinModel.getBalance(userId), 0);
    await assert.rejects(
      bountyService.attempt(userId, 'easy', 'copet'),
      /daily used/
    );
  });

  it('bounty: win pays config-range coin + exp exactly once', async () => {
    // One-shot killer: atk far above easy-target def, huge HP pool.
    const userId = await makeUser('winner', { atk: 100000 });
    const out = await bountyService.attempt(userId, 'easy', 'copet', {
      random: () => 0.99,
    });
    assert.equal(out.won, true);
    assert.ok(out.reward.coin >= 6000 && out.reward.coin <= 8000);
    assert.ok(out.reward.exp >= 20 && out.reward.exp <= 40);
    assert.equal(await rpgCoinModel.getBalance(userId), out.reward.coin);
    const player = await rpgPlayerModel.get(userId);
    assert.ok(player.exp >= 20 && player.exp <= 40);
    await assert.rejects(
      bountyService.attempt(userId, 'easy', 'copet'),
      /daily used/
    );
  });

  it('bounty: concurrent attempts -> exactly one reward', async () => {
    const userId = await makeUser('raceb', { atk: 100000 });
    const results = await Promise.allSettled([
      bountyService.attempt(userId, 'easy', 'copet'),
      bountyService.attempt(userId, 'easy', 'copet'),
      bountyService.attempt(userId, 'easy', 'copet'),
    ]);
    const wins = results.filter(
      (r) => r.status === 'fulfilled' && r.value.won
    );
    const dailyUsed = results.filter(
      (r) =>
        r.status === 'rejected' &&
        String(r.reason?.message).includes('daily used')
    );
    assert.equal(wins.length, 1);
    assert.equal(dailyUsed.length, 2);
    const player = await rpgPlayerModel.get(userId);
    assert.equal(await rpgCoinModel.getBalance(userId), wins[0].value.reward.coin);
    assert.equal(player.exp, wins[0].value.reward.exp);
  });

  it('bounty: HP 0 rejected without consuming the daily slot', async () => {
    const userId = await makeUser('dead', { atk: 100000 });
    await rpgPlayerModel.setCurrentHp(userId, 0);
    await assert.rejects(
      bountyService.attempt(userId, 'easy', 'copet'),
      /HP kamu 0/
    );
    // Slot untouched: heal (funded) then hunt succeeds on the same WIB day.
    await rpgCoinModel.addCoin(userId, 100000);
    await healService.heal(userId);
    const out = await bountyService.attempt(userId, 'easy', 'copet', {
      random: () => 0.99,
    });
    assert.equal(out.won, true);
  });

  it('fish: pays coin within range + flat exp', async () => {
    const userId = await makeUser('angler');
    const out = await fishService.fish(userId, { random: () => 0 });
    assert.equal(out.fish.name, 'Botol Plastik');
    assert.equal(out.coin, 10);
    assert.equal(out.exp, 1);
    assert.equal(await rpgCoinModel.getBalance(userId), 10);
    const player = await rpgPlayerModel.get(userId);
    assert.equal(player.exp, 1);
  });

  it('fish: three concurrent casts each pay exactly once', async () => {
    const userId = await makeUser('angler2');
    const results = await Promise.all(
      Array.from({ length: 3 }, () => fishService.fish(userId, { random: () => 0 }))
    );
    assert.equal(results.length, 3);
    assert.equal(await rpgCoinModel.getBalance(userId), 30);
    assert.equal((await rpgPlayerModel.get(userId)).exp, 3);
  });

  it('heal: partial HP -> full heal at exactly 1 Coin per HP', async () => {
    const userId = await makeUser('hurt', { hp: 100000 });
    await rpgPlayerModel.setCurrentHp(userId, 320);
    const player = await rpgPlayerModel.get(userId);
    const maxHp = player.max_hp;
    assert.equal(maxHp, 100000);
    await rpgCoinModel.addCoin(userId, 100000);
    const out = await healService.heal(userId);
    assert.equal(out.healed, maxHp - 320);
    assert.equal(out.cost, maxHp - 320);
    assert.equal(out.currentHp, maxHp);
    assert.equal(await rpgCoinModel.getBalance(userId), 100000 - (maxHp - 320));
    assert.equal((await rpgPlayerModel.get(userId)).current_hp, maxHp);
  });

  it('heal: full HP rejected without touching coin', async () => {
    const userId = await makeUser('healthy', { hp: 100000 });
    await rpgCoinModel.addCoin(userId, 500);
    const before = await rpgCoinModel.getBalance(userId);
    await assert.rejects(healService.heal(userId), /sudah penuh/);
    assert.equal(await rpgCoinModel.getBalance(userId), before);
  });

  it('heal: insufficient coin rejected, HP unchanged', async () => {
    const userId = await makeUser('poor', { hp: 100000 });
    await rpgPlayerModel.setCurrentHp(userId, 50000);
    await assert.rejects(healService.heal(userId), /Coin tidak cukup/);
    assert.equal((await rpgPlayerModel.get(userId)).current_hp, 50000);
    assert.equal(await rpgCoinModel.getBalance(userId), 0);
  });

  it('heal: HP 0 heals maxHp (Final Stats) at 1:1', async () => {
    const userId = await makeUser('ko', { hp: 100000 });
    await rpgPlayerModel.setCurrentHp(userId, 0);
    await rpgCoinModel.addCoin(userId, 100000);
    const out = await healService.heal(userId);
    assert.equal(out.healed, 100000);
    assert.equal(out.cost, 100000);
    assert.equal((await rpgPlayerModel.get(userId)).current_hp, 100000);
    assert.equal(await rpgCoinModel.getBalance(userId), 0);
  });

  it('heal: failure rolls back fully (coin untouched)', async () => {
    const userId = await makeUser('rollback', { hp: 100000 });
    await rpgPlayerModel.setCurrentHp(userId, 1000);
    await rpgCoinModel.addCoin(userId, 100000);
    const broken = createBrokenHeal();
    await assert.rejects(broken.heal(userId), /hp exploded/);
    assert.equal(await rpgCoinModel.getBalance(userId), 100000);
    assert.equal((await rpgPlayerModel.get(userId)).current_hp, 1000);
  });

  it('heal: concurrent heals -> one pays, other sees full HP', async () => {
    const userId = await makeUser('raceh', { hp: 100000 });
    await rpgPlayerModel.setCurrentHp(userId, 1000);
    await rpgCoinModel.addCoin(userId, 200000);
    const results = await Promise.allSettled([
      healService.heal(userId),
      healService.heal(userId),
    ]);
    const paid = results.filter((r) => r.status === 'fulfilled');
    const full = results.filter(
      (r) => r.status === 'rejected' && String(r.reason?.message).includes('penuh')
    );
    assert.equal(paid.length, 1);
    assert.equal(full.length, 1);
    assert.equal(paid[0].value.cost, 99000);
    assert.equal((await rpgPlayerModel.get(userId)).current_hp, 100000);
    assert.equal(await rpgCoinModel.getBalance(userId), 200000 - 99000);
  });

  it('commands stay thin: bounty menu/unknown, fish flow, heal flow', async () => {
    const bountyMod = await import('../src/commands/modules/economy/bounty.js');
    const fishMod = await import('../src/commands/modules/economy/fish.js');
    const healMod = await import('../src/commands/modules/rpg/heal.js');

    const hunter = await makeUser('cmd', { atk: 100000 });
    // (Menu path needs a live sock for the interactive builder; covered
    // by the bot runtime. Service + gate paths are tested here.)

    const badDiff = mockCtx({ sender: hunter, args: ['nope', 'copet'] });
    await assert.rejects(bountyMod.default.execute(badDiff.ctx), /Difficulty tidak valid/);

    const badTarget = mockCtx({ sender: hunter, args: ['easy', 'nope'] });
    await assert.rejects(bountyMod.default.execute(badTarget.ctx), /tidak ditemukan/);

    const fisher = await makeUser('cmdfish');
    const cast = mockCtx({ sender: fisher, args: [] });
    await fishMod.default.execute(cast.ctx);
    assert.ok(cast.replies[0].includes('memancing'));
    assert.ok(cast.edits.length === 1);
    assert.ok(cast.edits[0].text.includes('Fishing!'));

    const wounded = await makeUser('cmdheal', { hp: 100000 });
    await rpgPlayerModel.setCurrentHp(wounded, 99000);
    await rpgCoinModel.addCoin(wounded, 5000);
    const healed = mockCtx({ sender: wounded, args: [] });
    await healMod.default.execute(healed.ctx);
    assert.ok(healed.replies[0].includes('Heal berhasil'));
    assert.ok(healed.replies[0].includes('1,000'));
    assert.equal((await rpgPlayerModel.get(wounded)).current_hp, 100000);
    assert.equal(await rpgCoinModel.getBalance(wounded), 5000 - 1000);
  });
});

/** Heal service whose HP write explodes: proves full rollback. */
function createBrokenHeal() {
  const { createHealService } = healModule;
  return createHealService({
    players: {
      ensure: (u) => rpgPlayerModel.ensure(u),
      setCurrentHp: async () => {
        throw new Error('hp exploded');
      },
      get: (u, t) => rpgPlayerModel.get(u, t),
    },
  });
}

import * as healModule from '../src/features/rpg/services/heal-service.js';
