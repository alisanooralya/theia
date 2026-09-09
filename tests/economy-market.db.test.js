import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { sql, closeDatabase } from '../src/storage/connection.js';
import { createSchema } from '../src/storage/definitions.js';
import { userModel } from '../src/storage/models/user.js';
import { rpgPlayerModel } from '../src/features/rpg/models/rpg-player.model.js';
import { rpgCoinModel } from '../src/features/rpg/models/rpg-coin.model.js';
import { marketModel } from '../src/features/economy/models/market.model.js';
import { marketService } from '../src/features/economy/services/market-service.js';
import {
  COMMODITY_IDS,
  TICK_MS,
  MAX_CATCHUP_TICKS,
  MAX_ORDER_QTY,
} from '../src/features/economy/config/market-config.js';

let dbAvailable;
try {
  await sql`SELECT 1`;
  dbAvailable = true;
} catch {
  dbAvailable = false;
}

const RUN = `${process.pid}-${Date.now()}`;
const uid = (n) => `mkttest-${RUN}-${n}@test.local`;
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

async function setPrice(id, price) {
  await sql`UPDATE market_commodities SET price = ${price}, prev_price = ${price} WHERE id = ${id}`;
}

function mockCtx(overrides = {}) {
  const replies = [];
  return {
    ctx: {
      sender: overrides.sender,
      pushName: 'Tester',
      mentions: [],
      quoted: null,
      args: overrides.args ?? [],
      reply: async (m) => replies.push(m),
      // NOTE: real ctx.fail throws synchronously (see messages/context.js).
      fail: (m) => {
        throw new Error(m);
      },
    },
    replies,
  };
}

const computeNext = (states, tick) => marketService.computeNext(states, tick);

describe('economy market (database)', { skip: !dbAvailable }, () => {
  before(async () => {
    await createSchema();
    await createSchema();
    await marketService.ensureReady();
  });

  after(async () => {
    if (createdUsers.length) {
      await sql`DELETE FROM market_trades WHERE jid = ANY(${createdUsers})`;
      await sql`DELETE FROM users WHERE jid = ANY(${createdUsers})`;
    }
    await closeDatabase();
  });

  it('initialization: seeds state, commodities, and history idempotently', async () => {
    await marketService.ensureReady();
    await marketService.ensureReady();
    const state = await marketModel.getState();
    assert.ok(state && state.bucket > 0);
    const states = await marketModel.all();
    assert.equal(states.length, 5);
    // Seeding is insert-once (exact base values covered by engine unit
    // tests); here assert presence + sane prices on the shared tables.
    for (const id of COMMODITY_IDS) {
      const s = states.find((x) => x.id === id);
      assert.ok(s.price > 0);
      const hist = await marketModel.history(id);
      assert.ok(hist.length >= 1);
    }
  });

  it('overview/detail: decorated prices with history', async () => {
    const list = await marketService.overview();
    assert.equal(list.length, 5);
    for (const item of list) {
      assert.ok(item.price > 0 && item.trend && item.demand && item.supply);
    }
    const detail = await marketService.detail('rice');
    assert.equal(detail.id, 'rice');
    assert.ok(Array.isArray(detail.history) && detail.history.length >= 1);
    await assert.rejects(marketService.detail('nope'), /tidak ditemukan/);
  });

  it('buy: deducts coin, books holding with average cost, logs trade', async () => {
    await setPrice('rice', 1000);
    const userId = await makeFundedUser('buy', 50000);
    const out = await marketService.buy(userId, 'rice', '10');
    assert.equal(out.total, 10000);
    assert.equal(out.heldQty, 10);
    assert.equal(out.avgCost, 1000);
    assert.equal(out.cashLeft, 40000);
    assert.equal(await rpgCoinModel.getBalance(userId), 40000);
    const holding = await marketModel.getHolding(userId, 'rice');
    assert.deepEqual({ quantity: holding.quantity, total_cost: holding.total_cost }, { quantity: 10, total_cost: 10000 });
    const trades = await sql`SELECT * FROM market_trades WHERE jid = ${userId} AND side = 'buy'`;
    assert.equal(trades.length, 1);
    assert.equal(Number(trades[0].total), 10000);
  });

  it('second buy: average cost blends across price levels', async () => {
    const userId = await makeFundedUser('avg', 50000);
    await setPrice('rice', 1000);
    await marketService.buy(userId, 'rice', 10);
    await setPrice('rice', 2000);
    const out = await marketService.buy(userId, 'rice', 10);
    assert.equal(out.heldQty, 20);
    assert.equal(out.avgCost, 1500);
    assert.equal(await rpgCoinModel.getBalance(userId), 20000);
  });

  it('partial sell: keeps average cost of the remainder, books profit', async () => {
    const userId = await makeFundedUser('partial', 50000);
    await setPrice('rice', 1000);
    await marketService.buy(userId, 'rice', 10);
    await setPrice('rice', 2000);
    await marketService.buy(userId, 'rice', 10);
    const out = await marketService.sell(userId, 'rice', 5);
    assert.equal(out.gross, 10000);
    assert.equal(out.profit, 2500);
    assert.equal(out.remaining, 15);
    assert.equal(out.avgCost, 1500);
    assert.equal(out.cashLeft, 30000);
    const holding = await marketModel.getHolding(userId, 'rice');
    assert.equal(holding.quantity, 15);
    assert.equal(holding.total_cost, 22500);
  });

  it('full liquidation: zeroes holding, accumulates realized P/L', async () => {
    const userId = await makeFundedUser('full', 50000);
    await setPrice('rice', 1000);
    await marketService.buy(userId, 'rice', 10);
    await setPrice('rice', 2000);
    await marketService.buy(userId, 'rice', 10);
    await marketService.sell(userId, 'rice', 5);
    const out = await marketService.sell(userId, 'rice', 15);
    assert.equal(out.gross, 30000);
    assert.equal(out.profit, 7500);
    assert.equal(out.remaining, 0);
    const holding = await marketModel.getHolding(userId, 'rice');
    assert.equal(holding.quantity, 0);
    assert.equal(holding.total_cost, 0);
    assert.equal(await marketModel.realizedTotal(userId), 10000);
    assert.equal((await marketService.portfolio(userId)).items.length, 0);
    assert.equal(await rpgCoinModel.getBalance(userId), 60000);
  });

  it('insufficient coin: buy rejected, nothing written', async () => {
    await setPrice('rice', 2000);
    const userId = await makeFundedUser('poor', 500);
    await assert.rejects(marketService.buy(userId, 'rice', 1), /Coin tidak cukup/);
    assert.equal(await rpgCoinModel.getBalance(userId), 500);
    assert.equal(await marketModel.getHolding(userId, 'rice'), null);
  });

  it('insufficient holding: sell rejected, coin untouched', async () => {
    const userId = await makeFundedUser('empty', 9000);
    await assert.rejects(marketService.sell(userId, 'rice', 1), /tidak cukup/);
    assert.equal(await rpgCoinModel.getBalance(userId), 9000);
  });

  it('invalid quantity rejected', async () => {
    const userId = await makeFundedUser('qty', 90000);
    // Legacy parseInt semantics preserved: '1.5' parses to 1 (valid).
    for (const bad of ['0', '-3', 'abc', undefined]) {
      await assert.rejects(marketService.buy(userId, 'rice', bad), Error);
      await assert.rejects(marketService.sell(userId, 'rice', bad), Error);
    }
    await assert.rejects(marketService.buy(userId, 'rice', String(MAX_ORDER_QTY + 1)), /Maksimal/);
    await assert.rejects(marketService.buy(userId, 'nope', 1), /tidak ditemukan/);
    assert.equal(await rpgCoinModel.getBalance(userId), 90000);
  });

  it('portfolio: values reconcile (market + invested + realized + cash)', async () => {
    await setPrice('gold', 16000);
    const userId = await makeFundedUser('pf', 100000);
    await marketService.buy(userId, 'gold', 2);
    const pf = await marketService.portfolio(userId);
    assert.equal(pf.items.length, 1);
    assert.equal(pf.invested, 32000);
    assert.equal(pf.marketValue, 32000);
    assert.equal(pf.cash, 68000);
    assert.equal(pf.totalAsset, 100000);
    assert.equal(pf.realized, 0);
  });

  it('concurrent buys: funded orders all succeed exactly once', async () => {
    await setPrice('coffee', 3000);
    const price = 3000;
    // Generous funding: a tick from a parallel suite run may reprice
    // mid-race; accounting below holds under any interleaving.
    const userId = await makeFundedUser('racebuy', price * 15);
    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => marketService.buy(userId, 'coffee', 1))
    );
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 10);
    assert.equal((await marketModel.getHolding(userId, 'coffee')).quantity, 10);
    const trades = await sql`SELECT total FROM market_trades WHERE jid = ${userId} AND side = 'buy'`;
    const spent = trades.reduce((sum, r) => sum + Number(r.total), 0);
    assert.equal(price * 15 - (await rpgCoinModel.getBalance(userId)), spent);
  });

  it('concurrent contention: winners bounded by funds, never negative', async () => {
    await setPrice('coffee', 3000);
    const price = 3000;
    const userId = await makeFundedUser('racecontent', price * 5);
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => marketService.buy(userId, 'coffee', 1))
    );
    const wins = results.filter((r) => r.status === 'fulfilled').length;
    // At least the first arrival always affords (single-tick moves are
    // capped, so funds cannot evaporate mid-race); losers fail cleanly.
    assert.ok(wins >= 1 && wins <= 5);
    assert.equal((await marketModel.getHolding(userId, 'coffee')).quantity, wins);
    const coin = await rpgCoinModel.getBalance(userId);
    assert.ok(coin >= 0);
    const trades = await sql`SELECT total FROM market_trades WHERE jid = ${userId} AND side = 'buy'`;
    const spent = trades.reduce((sum, r) => sum + Number(r.total), 0);
    assert.equal(price * 5 - coin, spent);
  });

  it('concurrent buy+sell: wallet matches order receipts exactly', async () => {
    await setPrice('coffee', 3000);
    const funds = 30000;
    const userId = await makeFundedUser('racemix', funds);
    const seed = [];
    for (let i = 0; i < 5; i++) {
      seed.push(await marketService.buy(userId, 'coffee', 1));
    }
    const results = await Promise.allSettled([
      ...Array.from({ length: 5 }, () => marketService.buy(userId, 'coffee', 1)),
      ...Array.from({ length: 5 }, () => marketService.sell(userId, 'coffee', 1)),
    ]);
    // Each order carries its own locked price, so receipts reconcile
    // with the wallet under any interleaving or mid-race price move.
    const raceBuys = results.slice(0, 5).filter((r) => r.status === 'fulfilled').map((r) => r.value);
    const raceSells = results.slice(5).filter((r) => r.status === 'fulfilled').map((r) => r.value);
    assert.equal(raceSells.length, 5);
    const holding = await marketModel.getHolding(userId, 'coffee');
    assert.equal(holding.quantity, 5 + raceBuys.length - raceSells.length);
    const expectCoin =
      funds -
      seed.reduce((s, b) => s + b.total, 0) -
      raceBuys.reduce((s, b) => s + b.total, 0) +
      raceSells.reduce((s, o) => s + o.gross, 0);
    assert.equal(await rpgCoinModel.getBalance(userId), expectCoin);
  });

  it('concurrent ticks: same bucket applies exactly once', async () => {
    const state = await marketModel.getState();
    const nextBucketMs = (state.bucket + 1) * TICK_MS + 1000;
    const [a, b] = await Promise.all([
      marketModel.advance(computeNext, nextBucketMs),
      marketModel.advance(computeNext, nextBucketMs),
    ]);
    assert.equal(a.applied + b.applied, 1);
    const skipped = [a, b].find((r) => r.applied === 0);
    assert.equal(skipped.skipped, true);
  });

  it('commands stay thin: list, trade, detail, unknown, portfolio', async () => {
    const userId = await makeFundedUser('cmd', 60000);
    await setPrice('oil', 8000);
    const marketMod = await import('../src/commands/modules/economy/market.js');
    const pfMod = await import('../src/commands/modules/economy/portfolio.js');

    const list = mockCtx({ sender: userId, args: [] });
    await marketMod.default.execute(list.ctx);
    assert.ok(list.replies[0].includes('MARKET'));

    const buy = mockCtx({ sender: userId, args: ['buy', 'oil', '2'] });
    await marketMod.default.execute(buy.ctx);
    assert.ok(buy.replies[0].includes('BUY'));

    const sell = mockCtx({ sender: userId, args: ['jual', 'oil', '1'] });
    await marketMod.default.execute(sell.ctx);
    assert.ok(sell.replies[0].includes('SELL'));

    const detail = mockCtx({ sender: userId, args: ['oil'] });
    await marketMod.default.execute(detail.ctx);
    assert.ok(detail.replies[0].includes('OIL'));

    const unknown = mockCtx({ sender: userId, args: ['buy', 'nope', '1'] });
    await assert.rejects(marketMod.default.execute(unknown.ctx), /tidak dikenal/);

    const pf = mockCtx({ sender: userId, args: [] });
    await pfMod.default.execute(pf.ctx);
    assert.ok(pf.replies[0].includes('PORTFOLIO'));

    const fresh = await makeFundedUser('cmdfresh', 7000);
    const empty = mockCtx({ sender: fresh, args: [] });
    await pfMod.default.execute(empty.ctx);
    assert.ok(empty.replies[0].includes('Belum ada'));
  });

  it('catch-up replays bounded ticks; repeat call restarts safely', async () => {
    const state = await marketModel.getState();
    const farMs = (state.bucket + 10) * TICK_MS + 1000;
    const first = await marketModel.advance(computeNext, farMs);
    assert.equal(first.missed, 10);
    assert.equal(first.applied, MAX_CATCHUP_TICKS);
    const again = await marketModel.advance(computeNext, farMs);
    assert.equal(again.applied, 0);
    assert.equal(again.skipped, true);
  });

  it('scheduler runTick resolves with a tick result', async () => {
    const { runTick } = await import('../src/extensions/market-scheduler.js');
    const out = await runTick(Date.now());
    assert.equal(typeof out.applied, 'number');
  });
});
