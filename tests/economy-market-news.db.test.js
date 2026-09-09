import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { sql, closeDatabase } from '../src/storage/connection.js';
import { createSchema } from '../src/storage/definitions.js';
import { groupModel } from '../src/storage/models/group.js';
import { marketModel } from '../src/features/economy/models/market.model.js';
import { marketNewsModel } from '../src/features/economy/models/market-news.model.js';
import { marketService } from '../src/features/economy/services/market-service.js';
import { createMarketNewsService } from '../src/features/economy/services/market-news-service.js';
import { newsPressure } from '../src/features/economy/market-news-engine.js';

let dbAvailable;
try {
  await sql`SELECT 1`;
  dbAvailable = true;
} catch {
  dbAvailable = false;
}

const RUN = `${process.pid}-${Date.now()}`;
const createdNewsIds = [];
const createdGroups = [];

function trackNews(row) {
  if (row?.id) createdNewsIds.push(row.id);
  return row;
}

async function makeNews(overrides = {}) {
  const tick = overrides.start_tick ?? 1000;
  const total = overrides.total ?? 5;
  const row = await marketNewsModel.insert(
    {
      news_key: `test-${RUN}-${createdNewsIds.length}-${Math.random()}`,
      type: 'news',
      template_id: 'test',
      title: 'Test News',
      message: 'Ambiguous test message.',
      targets: ['rice'],
      hidden_outcome: 'TRUE',
      start_tick: tick,
      expire_tick: tick + total,
      impact: {
        perCommodity: { rice: { bias: 0.01, swing: 1.1 } },
        delay: 1,
        ramp: 2,
        total,
        outcome: 'TRUE',
        reversed: false,
      },
      ...overrides,
    }
  );
  return trackNews(row);
}

function mockCtx(overrides = {}) {
  const replies = [];
  return {
    ctx: {
      sender: overrides.sender ?? 'user@test.local',
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

describe('economy market news (database)', { skip: !dbAvailable }, () => {
  before(async () => {
    await createSchema();
    await createSchema();
    await marketService.ensureReady();
  });

  after(async () => {
    if (createdNewsIds.length) {
      await sql`DELETE FROM market_news WHERE id = ANY(${createdNewsIds})`;
    }
    if (createdGroups.length) {
      await sql`DELETE FROM groups WHERE jid = ANY(${createdGroups})`;
    }
    await closeDatabase();
  });

  it('insert dedupes by news_key; active/lastTicks reflect rows', async () => {
    const first = await makeNews({ news_key: `dedupe-${RUN}` });
    assert.ok(first?.id);
    const dup = await marketNewsModel.insert({
      news_key: `dedupe-${RUN}`,
      type: 'news',
      targets: ['rice'],
      message: 'x',
      hidden_outcome: 'TRUE',
      start_tick: 1,
      expire_tick: 6,
      impact: {},
    });
    assert.equal(dup, null);
    const active = await marketNewsModel.active();
    assert.ok(active.some((n) => n.id === first.id));
    assert.ok(active[0].targets.includes('rice'));
    assert.ok(active[0].impact.perCommodity.rice);
    const cooldown = await marketNewsModel.lastTicks();
    assert.ok(cooldown.any >= 1000);
  });

  it('expireDue + skipStale retire old news; expired rows press zero', async () => {
    const row = await makeNews({ start_tick: 2000, total: 3 });
    await marketNewsModel.expireDue(2002);
    assert.equal((await marketNewsModel.find(row.id)).status, 'ACTIVE');
    await marketNewsModel.expireDue(2003);
    const found = await marketNewsModel.find(row.id);
    assert.equal(found.status, 'EXPIRED');
    assert.ok((await marketNewsModel.skipStale()) >= 1);
    const skipped = await marketNewsModel.find(row.id);
    assert.equal(skipped.announce_status, 'SKIPPED');
    const pressure = newsPressure([skipped], 'rice', 2010);
    assert.deepEqual(pressure, { bias: 0, swing: 1 });
  });

  it('claim is single-winner under concurrency; retry loses', async () => {
    const row = await makeNews({ start_tick: 3000, total: 9 });
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => marketNewsModel.claimAnnouncement(row.id))
    );
    const wins = results.filter((r) => r.status === 'fulfilled' && r.value === true);
    assert.equal(wins.length, 1);
    assert.equal(await marketNewsModel.claimAnnouncement(row.id), false);
  });

  it('maintain spawns within bounded ticks and retires due rows', async () => {
    const svc = createMarketNewsService();
    let created = null;
    for (let t = 4000; t < 4025 && !created; t++) {
      const report = await svc.maintain(t);
      if (report.created) {
        created = trackNews(report.created);
        assert.equal(created.status, 'ACTIVE');
        assert.equal(created.announce_status, 'PENDING');
      }
    }
    assert.ok(created, 'spawned within 25 ticks');
  });

  it('announce goes only to news:1 groups, once, then never again', async () => {
    const on = `newson-${RUN}@g.us`;
    const off = `newsoff-${RUN}@g.us`;
    const missing = `newsmiss-${RUN}@g.us`;
    for (const jid of [on, off, missing]) {
      await groupModel.ensure(jid, 't');
      createdGroups.push(jid);
    }
    await groupModel.update(on, { news: 1 });
    await groupModel.update(off, { news: 0 });
    const eligible = await groupModel.findNewsGroups();
    assert.ok(eligible.includes(on));
    assert.ok(!eligible.includes(off));
    assert.ok(!eligible.includes(missing));

    const row = await makeNews({ start_tick: 5000, total: 9 });
    const sentTo = [];
    const sock = { sendMessage: async (jid) => sentTo.push(jid) };
    const svc = createMarketNewsService();
    // Drain all pending (earlier tests leave their own rows): every send
    // must go to the single eligible group, exactly once per news.
    for (let i = 0; i < 20; i++) {
      const r = await svc.announcePending(sock);
      if (!r.announced) break;
    }
    assert.ok(sentTo.length >= 1);
    assert.ok(sentTo.every((jid) => jid === on));
    assert.ok((await marketNewsModel.find(row.id)).announce_status === 'SENT');
    const second = await svc.announcePending(sock);
    assert.equal(second.announced, 0);
    assert.ok(sentTo.every((jid) => jid === on));
  });

  it('no eligible groups marks news SKIPPED without sending', async () => {
    const row = await makeNews({ start_tick: 6000, total: 9 });
    const sentTo = [];
    const sock = { sendMessage: async (jid) => sentTo.push(jid) };
    const svc = createMarketNewsService({
      groups: { findNewsGroups: async () => [] },
    });
    for (let i = 0; i < 20; i++) {
      const r = await svc.announcePending(sock);
      if (!r.announced && (await marketNewsModel.find(row.id)).announce_status !== 'PENDING') break;
    }
    const out = await svc.announcePending(sock);
    assert.equal(out.announced, 0);
    assert.equal(sentTo.length, 0);
    assert.equal((await marketNewsModel.find(row.id)).announce_status, 'SKIPPED');
  });

  it('news failure cannot roll back a valid price tick', async () => {
    const before = await marketModel.getState();
    const computeNext = (states, tick) => marketService.computeNext(states, tick);
    const advanced = await marketModel.advance(computeNext, (before.bucket + 1) * 3600000 + 1000);
    assert.equal(advanced.applied, 1);
    const broken = createMarketNewsService({
      news: {
        activeForUpdate: async () => {
          throw new Error('news db exploded');
        },
      },
    });
    await assert.rejects(broken.maintain(advanced.tick), /exploded/);
    const after = await marketModel.getState();
    assert.equal(after.tick, before.tick + 1);
  });

  it('.market news shows feed; .market list stays news-free', async () => {
    await makeNews({ start_tick: 7000, total: 9, title: 'Feed Check' });
    const mod = await import('../src/commands/modules/economy/market.js');
    const news = mockCtx({ args: ['news'] });
    await mod.default.execute(news.ctx);
    assert.ok(news.replies[0].includes('MARKET NEWS'));
    const berita = mockCtx({ args: ['berita'] });
    await mod.default.execute(berita.ctx);
    assert.ok(berita.replies[0].includes('MARKET NEWS'));
    const list = mockCtx({ args: [] });
    await mod.default.execute(list.ctx);
    assert.ok(list.replies[0].includes('MARKET'));
    assert.ok(!list.replies[0].includes('📰'));
  });

  it('scheduler tick applies prices and maintains news in one run', async () => {
    const { runTick } = await import('../src/extensions/market-scheduler.js');
    const out = await runTick(Date.now());
    assert.equal(typeof out.applied, 'number');
  });
});
