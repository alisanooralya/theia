import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  NEWS_TYPES,
  NEWS_OUTCOME_MULT,
  NEWS_REVERSE_CHANCE,
  NEWS_TOTAL_BIAS_CLAMP,
  NEWS_TOTAL_SWING_CLAMP,
  NEWS_MAX_ACTIVE,
  NEWS_MAX_ACTIVE_PER_COMMODITY,
  NEWS_SPAWN_CHANCE,
  NEWS_TEMPLATES,
} from '../src/features/economy/config/market-news-config.js';
import {
  newsWeight,
  newsPressure,
  rollNews,
} from '../src/features/economy/market-news-engine.js';
import { createMarketNewsService } from '../src/features/economy/services/market-news-service.js';

describe('news config (migrated untouched)', () => {
  it('keeps three types with weights and outcome tables', () => {
    assert.deepEqual(Object.keys(NEWS_TYPES).sort(), ['breaking', 'news', 'rumor']);
    assert.ok(NEWS_TYPES.news.weight > NEWS_TYPES.rumor.weight);
    assert.ok(NEWS_TYPES.rumor.weight > NEWS_TYPES.breaking.weight);
    assert.deepEqual(NEWS_OUTCOME_MULT.TRUE, [0.85, 1.0]);
    assert.deepEqual(NEWS_OUTCOME_MULT.PARTIAL, [0.35, 0.6]);
    assert.deepEqual(NEWS_OUTCOME_MULT.FALSE, [0.0, 0.25]);
    assert.equal(NEWS_REVERSE_CHANCE.TRUE, 0);
    assert.equal(NEWS_TOTAL_BIAS_CLAMP, 0.04);
    assert.equal(NEWS_TOTAL_SWING_CLAMP, 1.45);
    assert.equal(NEWS_MAX_ACTIVE, 3);
    assert.equal(NEWS_MAX_ACTIVE_PER_COMMODITY, 1);
    assert.ok(NEWS_SPAWN_CHANCE > 0 && NEWS_SPAWN_CHANCE < 1);
    assert.ok(NEWS_TEMPLATES.length > 20);
  });

  it('keeps ambiguous multi-commodity templates without answers', () => {
    const multi = NEWS_TEMPLATES.filter((t) => t.targets.length > 1);
    assert.ok(multi.length >= 3);
    for (const t of NEWS_TEMPLATES) {
      assert.ok(t.title && t.message && t.direction !== undefined);
      // No explicit trading signals or revealed mechanics in the text.
      assert.ok(!/bullish|bearish|harga akan|pasti naik|pasti turun|outcome|dampak .*persen/i.test(t.message + ' ' + t.title));
    }
  });
});

describe('news envelope (delayed ramp-up, active, decay)', () => {
  it('follows 0 -> rise -> full -> fade -> 0', () => {
    const delay = 1;
    const ramp = 2;
    const total = delay + 4;
    assert.equal(newsWeight(0, total, delay, ramp), 0);
    const w1 = newsWeight(1, total, delay, ramp);
    const w2 = newsWeight(2, total, delay, ramp);
    const w4 = newsWeight(4, total, delay, ramp);
    assert.ok(w1 > 0 && w1 < 1, 'ramp-up partial');
    assert.ok(w2 >= w1, 'rises to full');
    assert.ok(w4 < w2, 'decays at the tail');
    assert.equal(newsWeight(5, total, delay, ramp), 0);
    assert.equal(newsWeight(99, total, delay, ramp), 0);
  });
});

describe('news pressure (clamped, hidden)', () => {
  function fakeNews(bias, swing = 1.1, start = 10, total = 6) {
    return {
      start_tick: start,
      affected_commodities: 'rice',
      hidden_impact: JSON.stringify({
        perCommodity: { rice: { bias, swing } },
        delay: 1,
        ramp: 2,
        total,
      }),
    };
  }

  it('is zero outside the effect window', () => {
    assert.deepEqual(newsPressure([fakeNews(0.02)], 'rice', 10), { bias: 0, swing: 1 });
    assert.deepEqual(newsPressure([fakeNews(0.02)], 'rice', 99), { bias: 0, swing: 1 });
    assert.deepEqual(newsPressure([fakeNews(0.02)], 'gold', 12), { bias: 0, swing: 1 });
  });

  it('ramps inside the window and clamps the total bias', () => {
    const mid = newsPressure([fakeNews(0.02)], 'rice', 12);
    assert.ok(mid.bias > 0 && mid.bias <= 0.02);
    const stacked = newsPressure(
      [fakeNews(0.05), fakeNews(0.05), fakeNews(0.05), fakeNews(-0.05), fakeNews(-0.05)],
      'rice',
      12
    );
    assert.ok(Math.abs(stacked.bias) <= NEWS_TOTAL_BIAS_CLAMP);
    assert.ok(stacked.swing >= 1 / NEWS_TOTAL_SWING_CLAMP && stacked.swing <= NEWS_TOTAL_SWING_CLAMP);
  });
});

describe('rollNews guards', () => {
  it('respects max active, cooldowns, and per-commodity caps', () => {
    const busy = [
      { targets: ['rice'] },
      { targets: ['coffee'] },
      { targets: ['oil'] },
    ];
    assert.equal(rollNews({ tick: 100, active: busy }), null);
    assert.equal(rollNews({ tick: 5, active: [], lastAny: 4 }), null);
    const riceBusy = [{ targets: ['rice'] }];
    for (let i = 0; i < 50; i++) {
      const out = rollNews({ tick: 100, active: riceBusy });
      if (out) {
        assert.ok(!out.targets.includes('rice'), 'rice capped at 1 active');
      }
    }
  });

  it('rolls well-formed hidden payloads', () => {
    let seen = null;
    for (let i = 0; i < 200 && !seen; i++) {
      seen = rollNews({ tick: 100, active: [] });
    }
    assert.ok(seen, 'spawned within 200 rolls at 0.32 chance');
    assert.ok(['TRUE', 'PARTIAL', 'FALSE'].includes(seen.hidden_outcome));
    assert.ok(seen.expire_tick > seen.start_tick);
    assert.ok(seen.impact.perCommodity && seen.impact.total > 0);
    assert.match(seen.news_key, /^100-/);
  });

  it('distributes types and outcomes roughly per config', () => {
    const types = {};
    const outcomes = {};
    for (let i = 0; i < 400; i++) {
      const out = rollNews({ tick: 100 + i, active: [] });
      if (!out) continue;
      types[out.type] = (types[out.type] ?? 0) + 1;
      outcomes[out.hidden_outcome] = (outcomes[out.hidden_outcome] ?? 0) + 1;
    }
    assert.ok((types.news ?? 0) > (types.rumor ?? 0));
    assert.ok((types.rumor ?? 0) > (types.breaking ?? 0));
    assert.ok(outcomes.TRUE > outcomes.FALSE, 'news-leaning mix overall');
  });
});

describe('news service views hide internals', () => {
  it('feed exposes no outcome, impact, or bias', async () => {
    const rows = [
      {
        id: 1,
        type: 'rumor',
        title: 'X',
        message: 'Ambiguous message.',
        affected_commodities: 'rice,oil',
        hidden_outcome: 'FALSE',
        hidden_impact: '{"perCommodity":{"rice":{"bias":0.01,"swing":1.1}}}',
        created_at: Math.floor(Date.now() / 1000) - 60,
      },
    ];
    const svc = createMarketNewsService({
      news: { recent: async () => rows.map((r) => ({ ...r, targets: ['rice', 'oil'], impact: {} })) },
    });
    const feed = await svc.feed();
    const text = JSON.stringify(feed);
    assert.ok(feed[0].message.includes('Ambiguous'));
    assert.ok(!/FALSE|hidden|bias|impact|outcome|confidence/i.test(text));
  });

  it('announcement text hides direction and internals', () => {
    const svc = createMarketNewsService({});
    const text = svc.buildAnnouncement({
      type: 'breaking',
      targets: ['gold'],
      message: 'Something happened.',
    });
    assert.ok(text.includes('BREAKING NEWS'));
    assert.ok(!/TRUE|FALSE|bias|impact|phase/i.test(text));
  });
});
