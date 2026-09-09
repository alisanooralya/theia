import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { sql, closeDatabase } from '../src/storage/connection.js';
import { createSchema } from '../src/storage/definitions.js';
import { rpgPlayerModel } from '../src/features/rpg/models/rpg-player.model.js';
import { rpgCoinModel } from '../src/features/rpg/models/rpg-coin.model.js';
import { rpgInventoryModel } from '../src/features/rpg/models/rpg-inventory.model.js';
import { cardService } from '../src/features/rpg/services/card-service.js';
import { finalStatService } from '../src/features/rpg/services/final-stat-service.js';
import { createDomainService } from '../src/features/rpg/services/domain-service.js';
import { DOMAINS } from '../src/features/rpg/config/domain-config.js';
import { executeDomain } from '../src/commands/modules/rpg/domain.js';

let dbAvailable;
try {
  await sql`SELECT 1`;
  dbAvailable = true;
} catch {
  dbAvailable = false;
}

const uid = (n) => `rpgdomtest-${process.pid}-${n}@test.local`;
const createdUsers = [];

async function makeUser(n) {
  const userId = uid(n);
  await sql`INSERT INTO users (jid) VALUES (${userId}) ON CONFLICT (jid) DO NOTHING`;
  await rpgPlayerModel.ensure(userId);
  await rpgCoinModel.ensure(userId);
  createdUsers.push(userId);
  return userId;
}

async function strongUser(n) {
  const userId = await makeUser(n);
  await rpgCoinModel.addCoin(userId, 5000000);
  await rpgInventoryModel.add(userId, 'cerelia', 10000);
  await cardService.grantCard(userId, 'girgas');
  await cardService.equipMainCard(userId, 'girgas');
  await cardService.bulkLevelUp(userId, 'girgas', 100);
  await cardService.grantCard(userId, 'girgas_sign');
  await cardService.equipSignCard(userId, 'girgas_sign');
  await cardService.bulkLevelUp(userId, 'girgas_sign', 50);
  // Battles run on persistent currentHp: top up to full via existing API.
  const full = await finalStatService.getFinalStats(userId);
  await rpgPlayerModel.setCurrentHp(userId, full.maxHp);
  return userId;
}

function noCrit() {
  return 0.999999;
}

describe('domain runs (database)', { skip: !dbAvailable }, () => {
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

  it('WIN grants ranged EXP/Coin/Cerelia + records the run', async () => {
    const userId = await strongUser('win');
    const before = await rpgPlayerModel.get(userId);
    const coinBefore = await rpgCoinModel.getBalance(userId);
    const cerBefore = await rpgInventoryModel.getQuantity(userId, 'cerelia');
    const out = await createDomainService().runDomain(userId, 'easy', {
      requestKey: `${userId}:win`,
      random: noCrit,
    });
    assert.equal(out.status, 'WIN');
    assert.equal(out.duplicate, false);
    const { exp, coin, cerelia } = DOMAINS.easy.rewards;
    assert.ok(out.rewards.exp >= exp.min && out.rewards.exp <= exp.max);
    assert.ok(out.rewards.coin >= coin.min && out.rewards.coin <= coin.max);
    assert.ok(out.rewards.cerelia >= cerelia.min && out.rewards.cerelia <= cerelia.max);
    const after = await rpgPlayerModel.get(userId);
    assert.ok(after.exp >= 0 && after.level >= before.level);
    assert.equal((await rpgCoinModel.getBalance(userId)) - coinBefore, out.rewards.coin);
    assert.equal((await rpgInventoryModel.getQuantity(userId, 'cerelia')) - cerBefore, out.rewards.cerelia);
    const runs = await sql`SELECT status FROM rpg_domain_runs WHERE request_key = ${`${userId}:win`}`;
    assert.equal(runs[0].status, 'WIN');
  });

  it('big EXP rewards level up through the existing curve', async () => {
    const userId = await strongUser('lvl');
    const out = await createDomainService().runDomain(userId, 'hard', {
      requestKey: `${userId}:lvl`,
      random: noCrit,
    });
    assert.equal(out.status, 'WIN');
    // 600+ EXP from level 1 must cross at least one threshold (100).
    const player = await rpgPlayerModel.get(userId);
    assert.ok(player.level > 1);
    assert.equal(out.leveledUp, true);
  });

  it('LOSE grants nothing but records the run', async () => {
    const userId = await makeUser('lose');
    await rpgPlayerModel.setCurrentHp(userId, 1);
    const out = await createDomainService().runDomain(userId, 'hard', {
      requestKey: `${userId}:lose`,
      random: noCrit,
    });
    assert.equal(out.status, 'LOSE');
    assert.equal(out.rewards, null);
    const player = await rpgPlayerModel.get(userId);
    assert.equal(player.exp, 0);
    assert.equal(await rpgCoinModel.getBalance(userId), 0);
    assert.equal(await rpgInventoryModel.getQuantity(userId, 'cerelia'), 0);
    // Persistent HP untouched by battle damage.
    assert.equal((await rpgPlayerModel.get(userId)).current_hp, 1);
  });

  it('DRAW grants nothing', async () => {
    const userId = await strongUser('draw');
    const out = await createDomainService().runDomain(userId, 'medium', {
      requestKey: `${userId}:draw`,
      random: noCrit,
      maxRounds: 1,
    });
    assert.equal(out.status, 'DRAW');
    assert.equal(out.rewards, null);
    const player = await rpgPlayerModel.get(userId);
    assert.equal(player.exp, 0);
    assert.equal(player.level, 1);
  });

  it('reward failure rolls everything back', async () => {
    const userId = await strongUser('atomic');
    const broken = createDomainService({
      inventoryModel: {
        ...rpgInventoryModel,
        add: async () => {
          throw new Error('inventory exploded');
        },
      },
    });
    const before = await rpgPlayerModel.get(userId);
    const coinBefore = await rpgCoinModel.getBalance(userId);
    const cerBefore = await rpgInventoryModel.getQuantity(userId, 'cerelia');
    await assert.rejects(
      broken.runDomain(userId, 'easy', { requestKey: `${userId}:atomic`, random: noCrit }),
      /inventory exploded/
    );
    assert.deepEqual(await rpgPlayerModel.get(userId), before);
    assert.equal(await rpgCoinModel.getBalance(userId), coinBefore);
    assert.equal(await rpgInventoryModel.getQuantity(userId, 'cerelia'), cerBefore);
  });

  it('retry returns the stored outcome without double rewards', async () => {
    const userId = await strongUser('idem');
    const svc = createDomainService();
    const key = `${userId}:idem`;
    const first = await svc.runDomain(userId, 'easy', { requestKey: key, random: noCrit });
    assert.equal(first.duplicate, false);
    const coinAfter = await rpgCoinModel.getBalance(userId);
    const expAfter = (await rpgPlayerModel.get(userId)).exp;
    const second = await svc.runDomain(userId, 'easy', { requestKey: key, random: noCrit });
    assert.equal(second.duplicate, true);
    assert.equal(second.status, first.status);
    assert.deepEqual(second.rewards, first.rewards);
    assert.equal(await rpgCoinModel.getBalance(userId), coinAfter);
    assert.equal((await rpgPlayerModel.get(userId)).exp, expAfter);
  });

  it('concurrent duplicate keys grant once', async () => {
    const userId = await strongUser('race');
    const svc = createDomainService();
    const key = `${userId}:race`;
    const [a, b] = await Promise.allSettled([
      svc.runDomain(userId, 'easy', { requestKey: key, random: noCrit }),
      svc.runDomain(userId, 'easy', { requestKey: key, random: noCrit }),
    ]);
    const fulfilled = [a, b].filter((r) => r.status === 'fulfilled');
    assert.ok(fulfilled.length >= 1);
    const winners = fulfilled.filter((r) => !r.value.duplicate);
    assert.ok(winners.length <= 1);
  });

  it('HP 0 and unknown difficulty are rejected', async () => {
    const userId = await makeUser('hp0');
    await rpgPlayerModel.setCurrentHp(userId, 0);
    await assert.rejects(
      createDomainService().runDomain(userId, 'easy', { requestKey: `${userId}:hp0` }),
      RangeError
    );
    await assert.rejects(createDomainService().runDomain(userId, 'extreme'), RangeError);
  });

  it('command lists difficulties and runs battles', async () => {
    const replies = [];
    const userId = await strongUser('cmd');
    await executeDomain({ sender: userId, args: [], reply: async (m) => replies.push(m) });
    assert.ok(replies[0].includes('Easy') && replies[0].includes('Hard'));
    const run = [];
    const edits = [];
    const fakeKey = { id: 'domain1' };
    await executeDomain({
      sender: userId,
      jid: 'g@test',
      args: ['easy'],
      reply: async (m) => {
        run.push(m);
        return { key: fakeKey };
      },
      fail: async (m) => {
        throw new Error(m);
      },
      sock: {
        sendMessage: async (jid, body) => edits.push([jid, body]),
      },
    });
    assert.ok(run[0].includes('Slime King'));
    assert.equal(edits.length, 1);
    assert.equal(edits[0][1].edit, fakeKey);
    assert.ok(edits[0][1].text.includes('DOMAIN CLEAR') || edits[0][1].text.includes('DOMAIN FAILED'));
  });
});
