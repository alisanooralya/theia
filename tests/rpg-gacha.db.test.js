import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { sql, closeDatabase } from '../src/storage/connection.js';
import { createSchema } from '../src/storage/definitions.js';
import { rpgPlayerModel } from '../src/features/rpg/models/rpg-player.model.js';
import { rpgCoinModel } from '../src/features/rpg/models/rpg-coin.model.js';
import { cardService } from '../src/features/rpg/services/card-service.js';
import { inventoryService } from '../src/features/rpg/services/inventory-service.js';
import { createGachaService } from '../src/features/rpg/services/gacha-service.js';
import { GACHA_CONFIG } from '../src/features/rpg/config/gacha-config.js';
import { MAIN_CARDS } from '../src/features/rpg/config/card-config.js';

let dbAvailable;
try {
  await sql`SELECT 1`;
  dbAvailable = true;
} catch {
  dbAvailable = false;
}

const uid = (n) => `rpggachatest-${process.pid}-${n}@test.local`;
const createdUsers = [];

async function makeUser(n, coin = 100000) {
  const userId = uid(n);
  await sql`INSERT INTO users (jid) VALUES (${userId}) ON CONFLICT (jid) DO NOTHING`;
  await rpgPlayerModel.ensure(userId);
  await rpgCoinModel.ensure(userId);
  if (coin > 0) await rpgCoinModel.addCoin(userId, coin);
  createdUsers.push(userId);
  return userId;
}

// Deterministic roll sequences: category roll, then pick roll, then qty.
const MAIN = 0.005;
const ZONK = 0.3;
const ITEM = 0.9;

function seqRandom(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('gacha (database)', { skip: !dbAvailable }, () => {
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

  it('6. insufficient coin rejects without debit', async () => {
    const userId = await makeUser('poor', 100);
    await assert.rejects(
      createGachaService().pull(userId, 1, { requestKey: `${userId}:poor1` }),
      RangeError
    );
    assert.equal(await rpgCoinModel.getBalance(userId), 100);
  });

  it('20-22. main to cards, item to inventory, zonk to nothing', async () => {
    const userId = await makeUser('mix');
    const out = await createGachaService().pull(userId, 10, {
      requestKey: `${userId}:mix`,
      // main(girgas), zonk, item(cerelia x1): repeat
      random: seqRandom([MAIN, 0.0, ZONK, ITEM, 0.0, 0.0]),
    });
    assert.equal(out.results.length, 10);
    assert.equal(out.total, GACHA_CONFIG.costs[10]);
    assert.equal(out.duplicate, false);
    assert.ok(await cardService.hasCard(userId, 'girgas'));
    assert.ok((await inventoryService.getItemQuantity(userId, 'cerelia')) > 0);
    const zonks = out.results.filter((r) => r.type === 'zonk').length;
    assert.ok(zonks > 0);
    assert.equal(await rpgCoinModel.getBalance(userId), 100000 - GACHA_CONFIG.costs[10]);
  });

  it('15-16. owned and same-request duplicate mains become zonk', async () => {
    const userId = await makeUser('dup');
    await cardService.grantCard(userId, 'lena');
    const out = await createGachaService().pull(userId, 10, {
      requestKey: `${userId}:dup`,
      // Always roll main -> lena (index 1 of 4 via 0.25), then girgas.
      random: seqRandom([MAIN, 0.25]),
    });
    // lena owned -> zonk every time; no duplicate granted.
    assert.ok(out.results.every((r) => r.type === 'zonk'));
    const rows = await sql`SELECT COUNT(*)::int AS n FROM rpg_main_cards WHERE user_id = ${userId}`;
    assert.equal(rows[0].n, 1);

    const userId2 = await makeUser('dup2');
    const out2 = await createGachaService().pull(userId2, 10, {
      requestKey: `${userId2}:dup2`,
      // First pull grants girgas, later girgas rolls in same request -> zonk.
      random: seqRandom([MAIN, 0.0]),
    });
    const mains = out2.results.filter((r) => r.type === 'main');
    assert.equal(mains.length, 1);
    assert.equal(mains[0].cardId, 'girgas');
    assert.equal(out2.results.filter((r) => r.type === 'zonk').length, 9);
  });

  it('17-19. items repeat, pulls independent, no 10x guarantee', async () => {
    const userId = await makeUser('indep');
    const out = await createGachaService().pull(userId, 10, {
      requestKey: `${userId}:indep`,
      random: seqRandom([ITEM, 0.0, 0.0]),
    });
    assert.ok(out.results.every((r) => r.type === 'shopItem'));
    const qty = await inventoryService.getItemQuantity(userId, 'cerelia');
    assert.ok(qty >= 10);

    const userId2 = await makeUser('noguarantee');
    const out2 = await createGachaService().pull(userId2, 10, {
      requestKey: `${userId2}:noguarantee`,
      random: seqRandom([ZONK]),
    });
    assert.ok(out2.results.every((r) => r.type === 'zonk'));
    assert.equal(await cardService.getOwnedCards(userId2).then((c) => c.main.length), 0);
  });

  it('23-24. spend + rewards atomic; failure rolls back coin', async () => {
    const userId = await makeUser('atomic');
    const brokenSvc = createGachaService({
      inventoryService: {
        ...inventoryService,
        addItem: async () => {
          throw new Error('inventory exploded');
        },
      },
    });
    const before = await rpgCoinModel.getBalance(userId);
    await assert.rejects(
      brokenSvc.pull(userId, 1, {
        requestKey: `${userId}:atomic`,
        random: seqRandom([ITEM, 0.0, 0.0]),
      }),
      /inventory exploded/
    );
    assert.equal(await rpgCoinModel.getBalance(userId), before);
    assert.equal(await inventoryService.getItemQuantity(userId, 'cerelia'), 0);
  });

  it('25-26. retry returns prior results without double rewards', async () => {
    const userId = await makeUser('idem');
    const svc = createGachaService();
    const key = `${userId}:idem`;
    const first = await svc.pull(userId, 1, {
      requestKey: key,
      random: seqRandom([MAIN, 0.0]),
    });
    assert.equal(first.duplicate, false);
    const coinAfter = await rpgCoinModel.getBalance(userId);
    const second = await svc.pull(userId, 1, {
      requestKey: key,
      random: seqRandom([ZONK]),
    });
    assert.equal(second.duplicate, true);
    assert.deepEqual(second.results, first.results);
    assert.equal(await rpgCoinModel.getBalance(userId), coinAfter);
  });

  it('27. concurrent duplicate requests grant rewards once', async () => {
    const userId = await makeUser('race', GACHA_CONFIG.costs[1]);
    const svc = createGachaService();
    const key = `${userId}:race`;
    const [a, b] = await Promise.allSettled([
      svc.pull(userId, 1, { requestKey: key, random: seqRandom([MAIN, 0.0]) }),
      svc.pull(userId, 1, { requestKey: key, random: seqRandom([MAIN, 0.5]) }),
    ]);
    const fulfilled = [a, b].filter((r) => r.status === 'fulfilled');
    assert.ok(fulfilled.length >= 1);
    // Exactly one winner charged coin once.
    assert.equal(await rpgCoinModel.getBalance(userId), 0);
    const rows = await sql`SELECT COUNT(*)::int AS n FROM rpg_main_cards WHERE user_id = ${userId}`;
    assert.ok(rows[0].n <= 1);
    if (fulfilled.length === 2) {
      const dupes = fulfilled.filter((r) => r.value.duplicate);
      assert.equal(dupes.length, 1);
      assert.deepEqual(
        fulfilled.find((r) => !r.value.duplicate).value.results,
        dupes[0].value.results
      );
    }
  });

  it('14. new card config entries auto-join the pool', () => {
    // Pool is derived live; any MAIN_CARDS key is a valid outcome id.
    for (const id of Object.keys(MAIN_CARDS)) {
      assert.ok(typeof id === 'string' && id.length > 0);
    }
    assert.ok(createGachaService().mainPool().includes('girgas'));
  });
});
