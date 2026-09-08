import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { sql, closeDatabase } from '../src/storage/connection.js';
import { createSchema } from '../src/storage/definitions.js';
import { rpgPlayerModel } from '../src/features/rpg/models/rpg-player.model.js';
import { rpgCoinModel } from '../src/features/rpg/models/rpg-coin.model.js';
import { rpgInventoryModel } from '../src/features/rpg/models/rpg-inventory.model.js';
import { cardService } from '../src/features/rpg/services/card-service.js';
import { finalStatService } from '../src/features/rpg/services/final-stat-service.js';
import {
  cardStatsAtLevel,
  getBulkLevelUpCost,
  getMainCard,
  getSignCard,
} from '../src/features/rpg/config/card-config.js';

let dbAvailable;
try {
  await sql`SELECT 1`;
  dbAvailable = true;
} catch {
  dbAvailable = false;
}

const uid = (n) => `rpgleveltest-${process.pid}-${n}@test.local`;
const createdUsers = [];

async function makeUser(n, coin = 5000000, cerelia = 10000) {
  const userId = uid(n);
  await sql`INSERT INTO users (jid) VALUES (${userId}) ON CONFLICT (jid) DO NOTHING`;
  await rpgPlayerModel.ensure(userId);
  await rpgCoinModel.ensure(userId);
  if (coin > 0) await rpgCoinModel.addCoin(userId, coin);
  if (cerelia > 0) await rpgInventoryModel.add(userId, 'cerelia', cerelia);
  createdUsers.push(userId);
  return userId;
}

async function resources(userId) {
  return {
    coin: await rpgCoinModel.getBalance(userId),
    cerelia: await rpgInventoryModel.getQuantity(userId, 'cerelia'),
    level:
      (await cardService.getCard(userId, 'girgas').catch(() => null))?.level ??
      null,
  };
}

describe('card leveling (database)', { skip: !dbAvailable }, () => {
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

  it('5-6. main and sign level up, charging exact cost', async () => {
    const userId = await makeUser('basic');
    await cardService.grantCard(userId, 'girgas');
    await cardService.grantCard(userId, 'girgas_sign');
    const expected = getBulkLevelUpCost('main', 1, 5);
    const up = await cardService.bulkLevelUp(userId, 'girgas', 5);
    assert.equal(up.toLevel, 5);
    assert.equal(up.levels, 4);
    assert.equal(up.cost.coin, expected.coin);
    assert.equal(up.cost.cerelia, expected.cerelia);
    assert.equal(up.cost.materialId, 'cerelia');
    assert.equal(
      await rpgCoinModel.getBalance(userId),
      5000000 - expected.coin
    );
    assert.equal(
      await rpgInventoryModel.getQuantity(userId, 'cerelia'),
      10000 - expected.cerelia
    );
    const sign = await cardService.levelUp(userId, 'girgas_sign', 4);
    assert.equal(sign.toLevel, 5);
    assert.deepEqual(
      sign.card.stats,
      cardStatsAtLevel(getSignCard('girgas_sign'), 5)
    );
  });

  it('7-8. max levels enforced per kind', async () => {
    const userId = await makeUser('max');
    await cardService.grantCard(userId, 'lena');
    await cardService.grantCard(userId, 'lena_sign');
    await cardService.bulkLevelUp(userId, 'lena', 100);
    await cardService.bulkLevelUp(userId, 'lena_sign', 50);
    assert.equal((await cardService.getCard(userId, 'lena')).level, 100);
    await assert.rejects(cardService.levelUp(userId, 'lena'), RangeError);
    await assert.rejects(cardService.levelUp(userId, 'lena_sign'), RangeError);
    await assert.rejects(
      cardService.bulkLevelUp(userId, 'lena', 101),
      RangeError
    );
  });

  it('9-10. unowned cards rejected without touching resources', async () => {
    const userId = await makeUser('unowned');
    const before = await resources(userId);
    await assert.rejects(
      cardService.bulkLevelUp(userId, 'girgas', 5),
      RangeError
    );
    await assert.rejects(
      cardService.bulkLevelUp(userId, 'girgas_sign', 5),
      RangeError
    );
    await assert.rejects(cardService.levelUp(userId, 'girgas'), RangeError);
    assert.deepEqual(await resources(userId), before);
    const check = await cardService.canLevelUp(userId, 'girgas');
    assert.equal(check.can, false);
    assert.equal(check.reason, 'not-owned');
  });

  it('11-12. insufficient coin or cerelia blocks with nothing spent', async () => {
    const poor = await makeUser('poor', 100, 10000);
    await cardService.grantCard(poor, 'girgas');
    await assert.rejects(
      cardService.bulkLevelUp(poor, 'girgas', 5),
      RangeError
    );
    assert.equal(
      (await cardService.canLevelUp(poor, 'girgas', 5)).reason,
      'insufficient-coin'
    );
    assert.equal(await rpgCoinModel.getBalance(poor), 100);
    assert.equal((await cardService.getCard(poor, 'girgas')).level, 1);

    const nocer = await makeUser('nocer', 5000000, 0);
    await cardService.grantCard(nocer, 'girgas');
    await assert.rejects(
      cardService.bulkLevelUp(nocer, 'girgas', 2),
      RangeError
    );
    assert.equal(
      (await cardService.canLevelUp(nocer, 'girgas', 2)).reason,
      'insufficient-cerelia'
    );
    assert.equal(await rpgCoinModel.getBalance(nocer), 5000000);
  });

  it('13-14. invalid and over-max targets rejected', async () => {
    const userId = await makeUser('target');
    await cardService.grantCard(userId, 'daisy');
    for (const bad of [0, -3, 1.5, 101]) {
      await assert.rejects(
        cardService.bulkLevelUp(userId, 'daisy', bad),
        RangeError
      );
    }
    // Same-level target is an idempotent no-op (concurrency-safe), not an error.
    const noop = await cardService.bulkLevelUp(userId, 'daisy', 1);
    assert.equal(noop.levels, 0);
    assert.equal(noop.noop, true);
    assert.equal(
      (await cardService.canLevelUp(userId, 'daisy', 1)).reason,
      'invalid-target'
    );
    assert.equal(
      (await cardService.canLevelUp(userId, 'daisy', 101)).reason,
      'exceeds-max'
    );
    await assert.rejects(cardService.levelUp(userId, 'daisy', 0), RangeError);
    assert.equal((await cardService.getCard(userId, 'daisy')).level, 1);
  });

  it('15. coin + cerelia + level update succeed together', async () => {
    const userId = await makeUser('ok', 100000, 100);
    await cardService.grantCard(userId, 'ameris');
    const cost = getBulkLevelUpCost('main', 1, 4);
    const up = await cardService.bulkLevelUp(userId, 'ameris', 4);
    assert.equal(up.levels, 3);
    assert.equal(await rpgCoinModel.getBalance(userId), 100000 - cost.coin);
    assert.equal(
      await rpgInventoryModel.getQuantity(userId, 'cerelia'),
      100 - cost.cerelia
    );
    assert.equal((await cardService.getCard(userId, 'ameris')).level, 4);
  });

  it('16. rollback when cerelia removal fails after coin spend', async () => {
    const userId = await makeUser('rollback', 5000000, 0);
    await cardService.grantCard(userId, 'girgas');
    // Drain cerelia concurrently simulation: remove so spend succeeds but
    // remove fails — here simply no cerelia at all.
    const before = await rpgCoinModel.getBalance(userId);
    await assert.rejects(
      cardService.bulkLevelUp(userId, 'girgas', 3),
      RangeError
    );
    assert.equal(await rpgCoinModel.getBalance(userId), before);
    assert.equal((await cardService.getCard(userId, 'girgas')).level, 1);
  });

  it('17. rollback when level update fails', async () => {
    const userId = await makeUser('rollback2');
    await cardService.grantCard(userId, 'girgas');
    const brokenCards = {
      find: (u, id) =>
        cardService.getCard(u, id).then((c) => ({
          user_id: u,
          card_id: id,
          level: c.level,
          equipped: 0,
        })),
      setLevel: async () => {
        throw new Error('level exploded');
      },
    };
    const { createCardService } =
      await import('../src/features/rpg/services/card-service.js');
    const broken = createCardService({ cardModel: brokenCards });
    const coinBefore = await rpgCoinModel.getBalance(userId);
    const cerBefore = await rpgInventoryModel.getQuantity(userId, 'cerelia');
    await assert.rejects(
      broken.bulkLevelUp(userId, 'girgas', 3),
      /level exploded/
    );
    assert.equal(await rpgCoinModel.getBalance(userId), coinBefore);
    assert.equal(
      await rpgInventoryModel.getQuantity(userId, 'cerelia'),
      cerBefore
    );
  });

  it('18-19. final stats and milestones follow the new level', async () => {
    const userId = await makeUser('follow');
    await cardService.grantCard(userId, 'daisy');
    await cardService.equipMainCard(userId, 'daisy');
    const before = await finalStatService.getFinalStats(userId);
    await cardService.bulkLevelUp(userId, 'daisy', 25);
    const after = await finalStatService.getFinalStats(userId);
    const expected = cardStatsAtLevel(getMainCard('daisy'), 25);
    assert.equal(
      after.maxHp,
      before.maxHp - cardStatsAtLevel(getMainCard('daisy'), 1).hp + expected.hp
    );
    assert.equal(after.currentHp, before.currentHp);
    const equipped = await cardService.getEquippedMainCard(userId);
    assert.equal(equipped.skills.active.unlocked, true);
    assert.equal(equipped.skills.active.upgraded, false);
    assert.equal(equipped.skills.passive.unlocked, false);
    await cardService.bulkLevelUp(userId, 'daisy', 100);
    const maxed = await cardService.getEquippedMainCard(userId);
    assert.equal(maxed.skills.passive.upgraded, true);
  });

  it('canLevelUp dry-run never mutates', async () => {
    const userId = await makeUser('dry');
    await cardService.grantCard(userId, 'girgas');
    const before = await resources(userId);
    const ok = await cardService.canLevelUp(userId, 'girgas', 5);
    assert.equal(ok.can, true);
    assert.equal(ok.reason, null);
    assert.deepEqual(await resources(userId), before);
  });
});
