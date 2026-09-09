import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  COMMODITIES,
  COMMODITY_IDS,
  COMMODITY_ALIASES,
  PHASES,
  TICK_MS,
  CHECK_INTERVAL_MS,
  HISTORY_LIMIT,
  MAX_ORDER_QTY,
  MAX_TRADE_VALUE,
  MAX_CATCHUP_TICKS,
} from '../src/features/economy/config/market-config.js';
import {
  initialCommodityState,
  stepCommodity,
  rollEvent,
  readIndicators,
  readTrend,
  rollPhaseDuration,
} from '../src/features/economy/market-engine.js';
import { createMarketService } from '../src/features/economy/services/market-service.js';

describe('market config (migrated untouched)', () => {
  it('lists the five legacy commodities with engine tunables', () => {
    assert.deepEqual([...COMMODITY_IDS].sort(), ['coffee', 'diamond', 'gold', 'oil', 'rice']);
    for (const id of COMMODITY_IDS) {
      const c = COMMODITIES[id];
      for (const key of ['basePrice', 'drift', 'noise', 'phaseScale', 'crashRisk', 'gravity', 'floorMult', 'ceilMult']) {
        assert.equal(typeof c[key], 'number', `${id}.${key}`);
      }
    }
    assert.equal(TICK_MS, 3600000);
    assert.equal(CHECK_INTERVAL_MS, 60000);
    assert.equal(HISTORY_LIMIT, 24);
    assert.equal(MAX_ORDER_QTY, 100000);
    assert.equal(MAX_TRADE_VALUE, 2000000000);
    assert.equal(MAX_CATCHUP_TICKS, 6);
  });

  it('keeps legacy aliases and phases', () => {
    assert.equal(COMMODITY_ALIASES.emas, 'gold');
    assert.equal(COMMODITY_ALIASES.kopi, 'coffee');
    assert.ok(PHASES.normal && PHASES.boom && PHASES.crash);
  });

  it('has no news tables/config in the migrated path', async () => {
    const fs = await import('node:fs');
    assert.equal(fs.existsSync('src/features/economy/market-news.js'), false);
    assert.equal(fs.existsSync('src/features/economy/models/market-news.model.js'), false);
  });
});

describe('price engine (pure)', () => {
  it('seeds every commodity at base price in normal phase', () => {
    for (const id of COMMODITY_IDS) {
      const s = initialCommodityState(id);
      assert.equal(s.price, COMMODITIES[id].basePrice);
      assert.equal(s.prev_price, COMMODITIES[id].basePrice);
      assert.equal(s.phase, 'normal');
    }
    assert.throws(() => initialCommodityState('nope'), /tidak dikenal/);
  });

  it('keeps prices inside floor/ceil over hundreds of ticks', () => {
    for (const id of COMMODITY_IDS) {
      const c = COMMODITIES[id];
      const floor = Math.max(1, Math.round(c.basePrice * c.floorMult));
      const ceil = Math.round(c.basePrice * c.ceilMult);
      let state = initialCommodityState(id);
      for (let i = 0; i < 200; i++) {
        state = stepCommodity(state);
        assert.ok(state.price >= floor && state.price <= ceil, `${id} tick ${i}: ${state.price}`);
        assert.ok(PHASES[state.phase], `${id} phase ${state.phase}`);
      }
    }
  });

  it('reports trend and indicators', () => {
    assert.equal(readTrend(20), '📈 Strong');
    assert.equal(readTrend(5), '📈 Up');
    assert.equal(readTrend(-20), '📉 Falling');
    assert.equal(readTrend(-5), '📉 Down');
    assert.equal(readTrend(0), '➖ Stabil');
    const ind = readIndicators({ momentum: 0, phase: 'normal' });
    assert.ok(ind.demand && ind.supply);
    assert.ok(rollPhaseDuration('normal') >= 3);
    const rolled = rollEvent([]);
    assert.ok(rolled === null || (rolled.event && Number.isInteger(rolled.ticks)));
  });
});

describe('market service helpers (pure)', () => {
  const svc = createMarketService({
    market: {},
    users: { ensure: async () => {} },
    players: { ensure: async () => {} },
    coins: { ensure: async () => {}, getWallet: async () => ({ coin: 0, bank: 0 }) },
  });

  it('resolves ids, aliases, and prefixes', () => {
    assert.equal(svc.resolveId('gold'), 'gold');
    assert.equal(svc.resolveId('Emas'), 'gold');
    assert.equal(svc.resolveId('gol'), 'gold');
    assert.equal(svc.resolveId('beras'), 'rice');
    assert.equal(svc.resolveId('nope'), null);
    assert.equal(svc.resolveId(''), null);
  });

  it('validates quantities strictly', () => {
    assert.equal(svc.parseQuantity('10'), 10);
    // Legacy parseInt semantics preserved (no redesign): '1.5' -> 1.
    assert.equal(svc.parseQuantity('1.5'), 1);
    for (const bad of ['0', '-5', 'abc', '', undefined]) {
      assert.throws(() => svc.parseQuantity(bad), Error);
    }
    assert.throws(() => svc.parseQuantity(String(MAX_ORDER_QTY + 1)), /Maksimal/);
  });

  it('computes next-state shape without news', () => {
    const states = COMMODITY_IDS.map((id) => initialCommodityState(id));
    const out = svc.computeNext(states, 1);
    assert.equal(out.states.length, 5);
    assert.equal(out.tick, 1);
    assert.ok(Array.isArray(out.events));
    assert.equal(out.news, undefined);
  });

  it('tails history and counts down to next tick', () => {
    assert.deepEqual(svc.historyTail([1, 2, 3, 4, 5, 6], 4), [3, 4, 5, 6]);
    assert.deepEqual(svc.historyTail([], 4), []);
    assert.ok(svc.nextUpdateIn() > 0 && svc.nextUpdateIn() <= TICK_MS);
  });
});

describe('market/portfolio commands (metadata)', () => {
  it('registers legacy names and aliases', async () => {
    const market = (await import('../src/commands/modules/economy/market.js')).default;
    const portfolio = (await import('../src/commands/modules/economy/portfolio.js')).default;
    assert.equal(market.name, 'market');
    assert.deepEqual([...market.aliases].sort(), ['mkt', 'pasar']);
    assert.equal(market.category, 'economy');
    assert.equal(portfolio.name, 'portfolio');
    assert.deepEqual([...portfolio.aliases].sort(), ['aset', 'porto']);
    assert.equal(portfolio.category, 'economy');
  });
});
