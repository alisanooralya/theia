import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { sql, closeDatabase } from '../src/storage/connection.js';
import { createSchema } from '../src/storage/definitions.js';
import { rpgPlayerModel } from '../src/features/rpg/models/rpg-player.model.js';
import { rpgCoinModel } from '../src/features/rpg/models/rpg-coin.model.js';
import { inventoryService } from '../src/features/rpg/services/inventory-service.js';
import { shopService, createShopService } from '../src/features/rpg/services/shop-service.js';
import { getShopItem } from '../src/features/rpg/config/shop-config.js';

let dbAvailable;
try {
  await sql`SELECT 1`;
  dbAvailable = true;
} catch {
  dbAvailable = false;
}

const uid = (n) => `rpgshoptest-${process.pid}-${n}@test.local`;
const createdUsers = [];

async function makeUser(n, coin = 0) {
  const userId = uid(n);
  await sql`INSERT INTO users (jid) VALUES (${userId}) ON CONFLICT (jid) DO NOTHING`;
  await rpgPlayerModel.ensure(userId);
  await rpgCoinModel.ensure(userId);
  if (coin > 0) await rpgCoinModel.addCoin(userId, coin);
  createdUsers.push(userId);
  return userId;
}

describe('shop + inventory (database)', { skip: !dbAvailable }, () => {
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

  it('migration creates wallet + inventory tables with constraints', async () => {
    for (const table of ['rpg_wallets', 'rpg_inventory']) {
      const cols = await sql`
        SELECT column_name, is_nullable FROM information_schema.columns
        WHERE table_name = ${table}
      `;
      const map = Object.fromEntries(cols.map((c) => [c.column_name, c]));
      for (const name of ['user_id', 'created_at', 'updated_at']) {
        assert.ok(map[name], `${table} missing ${name}`);
      }
      assert.equal(map.coin?.is_nullable ?? 'NO', 'NO');
      assert.equal(map.quantity?.is_nullable ?? 'NO', 'NO');
      assert.equal(map.item_id?.is_nullable ?? 'NO', 'NO');
    }
    const uniques = await sql`
      SELECT kcu.column_name FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_name = 'rpg_inventory' AND tc.constraint_type = 'UNIQUE'
    `;
    assert.deepEqual(uniques.map((r) => r.column_name).sort(), ['item_id', 'user_id']);
  });

  it('5-8. inventory add/remove with single-row accumulation', async () => {
    const userId = await makeUser('inv');
    assert.deepEqual([...(await inventoryService.getInventory(userId))], []);
    await inventoryService.addItem(userId, 'cerelia', 10);
    await inventoryService.addItem(userId, 'cerelia', 5);
    assert.equal(await inventoryService.getItemQuantity(userId, 'cerelia'), 15);
    const rows = await sql`SELECT COUNT(*)::int AS n FROM rpg_inventory WHERE user_id = ${userId}`;
    assert.equal(rows[0].n, 1);
    assert.equal(await inventoryService.removeItem(userId, 'cerelia', 6), 9);
    await assert.rejects(inventoryService.removeItem(userId, 'cerelia', 10), RangeError);
    assert.equal(await inventoryService.getItemQuantity(userId, 'cerelia'), 9);
    // Zero cleans the row; reads stay at zero.
    assert.equal(await inventoryService.removeItem(userId, 'cerelia', 9), 0);
    assert.deepEqual([...(await inventoryService.getInventory(userId))], []);
  });

  it('9-11. purchase deducts exact coin and stocks inventory', async () => {
    const userId = await makeUser('buy', 30000);
    const price = getShopItem('cerelia').price;
    const result = await shopService.buyItem(userId, 'cerelia', 5);
    assert.equal(result.total, price * 5);
    assert.equal(await rpgCoinModel.getBalance(userId), 30000 - price * 5);
    assert.equal(await inventoryService.getItemQuantity(userId, 'cerelia'), 5);
  });

  it('12. insufficient coin blocks purchase without loss', async () => {
    const userId = await makeUser('poor', 100);
    const before = await rpgCoinModel.getBalance(userId);
    await assert.rejects(shopService.buyItem(userId, 'cerelia', 1), RangeError);
    assert.equal(await rpgCoinModel.getBalance(userId), before);
    assert.equal(await inventoryService.getItemQuantity(userId, 'cerelia'), 0);
  });

  it('15. non-purchasable items rejected without side effects', async () => {
    const userId = await makeUser('flag', 100000);
    const flagged = createShopService({
      catalog: {
        getShopItems: () => [getShopItem('cerelia')],
        getPurchasableItems: () => [],
        getShopItem: (id) =>
          id === 'cerelia'
            ? { ...getShopItem('cerelia'), purchasable: false }
            : null,
      },
    });
    const before = await rpgCoinModel.getBalance(userId);
    await assert.rejects(flagged.buyItem(userId, 'cerelia', 1), /tidak dijual/);
    assert.equal(await rpgCoinModel.getBalance(userId), before);
    assert.equal(await inventoryService.getItemQuantity(userId, 'cerelia'), 0);
    assert.equal(getShopItem('cerelia').purchasable, true);
  });

  it('16. failed inventory add rolls back the coin spend', async () => {
    const userId = await makeUser('atomic', 50000);
    const broken = createShopService({
      inventoryModel: {
        add: async () => {
          throw new Error('inventory exploded');
        },
      },
    });
    const before = await rpgCoinModel.getBalance(userId);
    await assert.rejects(broken.buyItem(userId, 'cerelia', 1), /inventory exploded/);
    assert.equal(await rpgCoinModel.getBalance(userId), before);
    assert.equal(await inventoryService.getItemQuantity(userId, 'cerelia'), 0);
  });

  it('17. UNIQUE(user_id, item_id) enforced at the database', async () => {
    const userId = await makeUser('uniq');
    await inventoryService.addItem(userId, 'cerelia', 1);
    await assert.rejects(sql`INSERT INTO rpg_inventory (user_id, item_id, quantity) VALUES (${userId}, 'cerelia', 1)`);
    await assert.rejects(sql`INSERT INTO rpg_inventory (user_id, item_id, quantity) VALUES (${userId}, '', 1)`);
    await assert.rejects(sql`UPDATE rpg_inventory SET quantity = -1 WHERE user_id = ${userId}`);
  });

  it('18. inventory reads do not mutate state', async () => {
    const userId = await makeUser('read');
    await inventoryService.addItem(userId, 'cerelia', 3);
    const before = await sql`SELECT * FROM rpg_inventory WHERE user_id = ${userId} ORDER BY item_id`;
    await inventoryService.getInventory(userId);
    await inventoryService.getItemQuantity(userId, 'cerelia');
    await inventoryService.hasItem(userId, 'cerelia', 2);
    await inventoryService.getItemQuantity(userId, 'ghost_item');
    const after = await sql`SELECT * FROM rpg_inventory WHERE user_id = ${userId} ORDER BY item_id`;
    assert.deepEqual(after, before);
  });
});
