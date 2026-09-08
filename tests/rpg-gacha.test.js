import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  GACHA_CONFIG,
  allowedPullCounts,
  gachaCost,
  rollPull,
  rollMainCard,
  rollShopItem,
  rollItemQuantity,
} from '../src/features/rpg/config/gacha-config.js';
import { MAIN_CARDS } from '../src/features/rpg/config/card-config.js';
import {
  SHOP_ITEMS,
  getPurchasableItems,
} from '../src/features/rpg/config/shop-config.js';
import {
  parseGachaArgs,
  formatGachaResult,
  executeGacha,
  GACHA_USAGE,
} from '../src/commands/modules/rpg/gacha.js';

describe('gacha config', () => {
  it('4-5. costs come from config (1x 2500, 10x 25000)', () => {
    assert.equal(gachaCost(1), 2500);
    assert.equal(gachaCost(10), 25000);
    assert.deepEqual(allowedPullCounts(), [1, 10]);
    assert.throws(() => gachaCost(5), RangeError);
  });

  it('7-10. rates total 100% (main 1, zonk 50, shop item 49)', () => {
    const { mainCard, zonk, shopItem } = GACHA_CONFIG.rates;
    assert.equal(mainCard, 0.01);
    assert.equal(zonk, 0.5);
    assert.equal(shopItem, 0.49);
    assert.ok(Math.abs(mainCard + zonk + shopItem - 1) < 1e-9);
  });

  it('roll boundaries route to the right category', () => {
    assert.equal(
      rollPull(() => 0.0),
      'main'
    );
    assert.equal(
      rollPull(() => 0.009),
      'main'
    );
    assert.equal(
      rollPull(() => 0.01),
      'zonk'
    );
    assert.equal(
      rollPull(() => 0.5),
      'zonk'
    );
    assert.equal(
      rollPull(() => 0.51),
      'shopItem'
    );
    assert.equal(
      rollPull(() => 0.99),
      'shopItem'
    );
  });

  it('11. main pool is exactly the card config', () => {
    const ids = Object.keys(MAIN_CARDS);
    assert.ok(ids.length >= 4);
    const seen = new Set();
    for (let i = 0; i < 200; i += 1) seen.add(rollMainCard());
    assert.deepEqual([...seen].sort(), ids.sort());
  });

  it('12-13. shop pool is exactly the purchasable shop config', () => {
    const ids = getPurchasableItems().map((i) => i.id);
    assert.deepEqual(
      ids,
      Object.keys(SHOP_ITEMS).filter((id) => SHOP_ITEMS[id].purchasable)
    );
    assert.ok(ids.includes('cerelia'));
    assert.equal(
      rollShopItem(() => 0),
      ids[0]
    );
  });

  it('item quantity stays in the configured range', () => {
    const { min, max } = GACHA_CONFIG.itemQuantity;
    for (let i = 0; i < 100; i += 1) {
      const q = rollItemQuantity();
      assert.ok(q >= min && q <= max);
    }
    assert.equal(
      rollItemQuantity(() => 0),
      min
    );
    assert.equal(
      rollItemQuantity(() => 0.999),
      max
    );
  });
});

describe('gacha command parsing and UI', () => {
  it('1-3. only 1 and 10 are valid; empty shows usage', () => {
    assert.equal(parseGachaArgs(['1']), 1);
    assert.equal(parseGachaArgs(['10']), 10);
    assert.equal(parseGachaArgs([]), null);
    assert.throws(() => parseGachaArgs(['5']), RangeError);
    assert.throws(() => parseGachaArgs(['0']), RangeError);
    assert.throws(() => parseGachaArgs(['abc']), RangeError);
    assert.ok(GACHA_USAGE.includes('.gacha 1'));
  });

  it('formats results with per-pull lines and totals', () => {
    const text = formatGachaResult({
      results: [
        { index: 1, type: 'main', cardName: 'Girgas' },
        { index: 2, type: 'zonk' },
        { index: 3, type: 'shopItem', itemName: 'Cerelia', quantity: 3 },
      ],
    });
    assert.ok(text.includes('1. 🃏 Girgas'));
    assert.ok(text.includes('2. ❌ Zonk'));
    assert.ok(text.includes('3. 🧪 Cerelia ×3'));
    assert.ok(text.includes('• Girgas ×1'));
    assert.ok(text.includes('• Cerelia ×3'));
    assert.ok(text.includes('• Zonk ×1'));
  });

  it('28. animation delays once and result edits it in place', async () => {
    let delays = 0;
    const replies = [];
    const edits = [];
    const fakeKey = { id: 'anim1' };
    const ctx = {
      sender: 'u@test',
      jid: 'g@test',
      args: ['10'],
      reply: async (msg) => {
        replies.push(msg);
        return { key: fakeKey };
      },
      sock: {
        sendMessage: async (jid, body) => edits.push([jid, body]),
      },
    };
    await executeGacha(ctx, {
      sleepFn: async () => {
        delays += 1;
      },
      pullFn: async (sender, count) => {
        return {
          requestKey: 'k',
          count,
          total: 25000,
          results: [],
          duplicate: false,
        };
      },
    });
    assert.equal(delays, 1);
    assert.equal(replies.length, 1);
    assert.ok(replies[0].includes('Sedang melakukan gacha'));
    assert.equal(edits.length, 1);
    assert.equal(edits[0][0], 'g@test');
    assert.equal(edits[0][1].edit, fakeKey);
    assert.ok(edits[0][1].text.includes('GACHA RESULT'));
  });

  it('edit failure surfaces without crashing the caller', async () => {
    const mod = await import('../src/commands/modules/rpg/gacha.js');
    const replies = [];
    const ctx = {
      sender: 'u@test',
      jid: 'g@test',
      args: ['1'],
      reply: async (msg) => replies.push(msg),
      sock: {
        sendMessage: async () => {
          throw new Error('no edit');
        },
      },
    };
    await mod.default.execute(ctx);
    assert.equal(replies.length, 2);
    assert.ok(replies[1].includes('Gagal:'));
  });
});
