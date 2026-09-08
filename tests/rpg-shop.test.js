import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  SHOP_ITEMS,
  getShopItems,
  getPurchasableItems,
  getShopItem,
} from '../src/features/rpg/config/shop-config.js';
import {
  CERELIA_ITEM,
  SIGN_CARDS,
} from '../src/features/rpg/config/card-config.js';
import { createInventoryService } from '../src/features/rpg/services/inventory-service.js';
import { createShopService } from '../src/features/rpg/services/shop-service.js';
import { formatInventory } from '../src/commands/modules/rpg/inventory.js';

describe('shop config', () => {
  it('1. reads items directly from config with no second list', () => {
    assert.deepEqual(
      getShopItems().map((i) => i.id),
      Object.keys(SHOP_ITEMS)
    );
    for (const item of getShopItems()) {
      assert.ok(item.id && item.name && item.description !== undefined);
      assert.ok(Number.isInteger(item.price) && item.price >= 0);
      assert.equal(item.currency, 'coin');
      assert.equal(typeof item.purchasable, 'boolean');
    }
  });

  it('2. cerelia is listed automatically with the card-system id', () => {
    const cerelia = getShopItem('cerelia');
    assert.ok(cerelia);
    assert.equal(cerelia.id, CERELIA_ITEM.id);
    assert.equal(cerelia.name, CERELIA_ITEM.name);
    assert.equal(cerelia.price, 5000);
    assert.equal(cerelia.purchasable, true);
    assert.ok(getPurchasableItems().some((i) => i.id === 'cerelia'));
    assert.equal(getShopItem('nope'), null);
    assert.equal(getShopItem(''), null);
  });

  it('all sign cards sell for 250k with card grants', () => {
    for (const def of Object.values(SIGN_CARDS)) {
      const entry = getShopItem(def.id);
      assert.ok(entry, def.id);
      assert.equal(entry.price, 250000);
      assert.equal(entry.currency, 'coin');
      assert.equal(entry.purchasable, true);
      assert.equal(entry.cardId, def.id);
      assert.equal(entry.name, def.name);
    }
  });

  it('3. every config entry is buyable without per-item logic', async () => {
    // Generic proof: buy works for ALL purchasable entries through the
    // same code path, so a newly added entry needs no service change.
    // Plain entries land in inventory; cardId entries grant ownership.
    for (const item of getPurchasableItems()) {
      const calls = [];
      const svc = createShopService({
        playerModel: { ensure: async () => null },
        coinModel: {
          ensure: async () => null,
          spendCoin: async (u, total) => {
            calls.push(['spend', total]);
            return 1000000 - total;
          },
          getBalance: async () => 1000000,
        },
        inventoryModel: {
          add: async (u, id, qty) => {
            calls.push(['add', id, qty]);
            return { quantity: qty };
          },
        },
        cardService: {
          grantCard: async (u, cardId) => {
            calls.push(['grant', cardId]);
            return { card: { definition: { name: cardId } }, isNew: true };
          },
        },
        db: { begin: (fn) => fn({}) },
      });
      const result = await svc.buyItem('u', item.id, 2);
      assert.equal(result.total, item.price * 2);
      if (item.cardId) {
        assert.deepEqual(calls, [
          ['spend', item.price * 2],
          ['grant', item.cardId],
        ]);
        assert.ok(result.card);
      } else {
        assert.deepEqual(calls, [
          ['spend', item.price * 2],
          ['add', item.id, 2],
        ]);
        assert.equal(result.card, null);
      }
    }
  });

  it('card entries reject re-buy while inventory items stack', async () => {
    const owned = new Set();
    const svc = createShopService({
      playerModel: { ensure: async () => null },
      coinModel: {
        ensure: async () => null,
        spendCoin: async () => 0,
        getBalance: async () => 1000000,
      },
      inventoryModel: {
        add: async (u, id, qty) => ({ quantity: qty }),
      },
      cardService: {
        grantCard: async (u, cardId) => {
          if (owned.has(cardId))
            return { card: { definition: { name: cardId } }, isNew: false };
          owned.add(cardId);
          return { card: { definition: { name: cardId } }, isNew: true };
        },
      },
      db: { begin: (fn) => fn({}) },
    });
    const signEntry = getPurchasableItems().find((i) => i.cardId);
    assert.ok(signEntry, 'expected a card entry in shop');
    await svc.buyItem('u', signEntry.id, 1);
    await assert.rejects(svc.buyItem('u', signEntry.id, 1), /Sudah memiliki/);
  });

  it('service source has no hardcoded item ids', async () => {
    const { readFile } = await import('node:fs/promises');
    for (const file of [
      '../src/features/rpg/services/shop-service.js',
      '../src/features/rpg/services/inventory-service.js',
      '../src/commands/modules/rpg/shop.js',
      '../src/commands/modules/rpg/inventory.js',
    ]) {
      const src = await readFile(new URL(file, import.meta.url), 'utf8');
      assert.ok(!src.includes("'cerelia'") && !src.includes('"cerelia"'), file);
    }
  });
});

describe('inventory service validation (stubbed model)', () => {
  function stub(state = new Map()) {
    return createInventoryService({
      inventoryModel: {
        getAll: async (u) =>
          [...state.entries()].map(([item_id, quantity]) => ({
            user_id: u,
            item_id,
            quantity,
          })),
        getQuantity: async (u, id) => state.get(`${u}:${id}`) ?? 0,
        add: async (u, id, qty) => {
          state.set(`${u}:${id}`, (state.get(`${u}:${id}`) ?? 0) + qty);
          return { quantity: state.get(`${u}:${id}`) };
        },
        remove: async (u, id, qty) => {
          const cur = state.get(`${u}:${id}`) ?? 0;
          if (cur < qty) throw new RangeError(`Item tidak cukup: ${id}`);
          const left = cur - qty;
          if (left === 0) state.delete(`${u}:${id}`);
          else state.set(`${u}:${id}`, left);
          return left;
        },
      },
    });
  }

  it('4. empty inventory reads zero without writes', async () => {
    const svc = stub();
    assert.deepEqual(await svc.getInventory('u'), []);
    assert.equal(await svc.getItemQuantity('u', 'cerelia'), 0);
    assert.equal(await svc.hasItem('u', 'cerelia'), false);
  });

  it('5-6. add accumulates on one row', async () => {
    const svc = stub();
    await svc.addItem('u', 'cerelia', 10);
    await svc.addItem('u', 'cerelia', 5);
    assert.equal(await svc.getItemQuantity('u', 'cerelia'), 15);
    assert.equal((await svc.getInventory('u')).length, 1);
    assert.equal(await svc.hasItem('u', 'cerelia', 15), true);
    assert.equal(await svc.hasItem('u', 'cerelia', 16), false);
  });

  it('7-8. remove deducts and never goes negative', async () => {
    const svc = stub();
    await svc.addItem('u', 'cerelia', 10);
    assert.equal(await svc.removeItem('u', 'cerelia', 4), 6);
    await assert.rejects(svc.removeItem('u', 'cerelia', 7), RangeError);
    assert.equal(await svc.getItemQuantity('u', 'cerelia'), 6);
  });

  it('rejects non-positive quantities and blank ids', async () => {
    const svc = stub();
    await assert.rejects(svc.addItem('u', 'cerelia', 0), RangeError);
    await assert.rejects(svc.addItem('u', 'cerelia', -2), RangeError);
    await assert.rejects(svc.addItem('u', 'cerelia', 1.5), RangeError);
    await assert.rejects(svc.removeItem('u', 'cerelia', 0), RangeError);
    await assert.rejects(svc.addItem('u', '', 1), RangeError);
  });
});

describe('shop buy validation (stubbed)', () => {
  function buyService(coin = 100000) {
    let balance = coin;
    const stock = new Map();
    const svc = createShopService({
      playerModel: { ensure: async () => null },
      coinModel: {
        ensure: async () => null,
        getBalance: async () => balance,
        spendCoin: async (u, total) => {
          if (balance < total) throw new RangeError('Coin tidak cukup');
          balance -= total;
          return balance;
        },
      },
      inventoryModel: {
        add: async (u, id, qty) => {
          stock.set(id, (stock.get(id) ?? 0) + qty);
          return { quantity: stock.get(id) };
        },
      },
      db: { begin: (fn) => fn({}) },
    });
    return { svc, balance: () => balance, stock };
  }

  it('9-11. purchase deducts coin and adds inventory', async () => {
    const { svc, balance, stock } = buyService();
    const result = await svc.buyItem('u', 'cerelia', 5);
    assert.equal(result.total, 25000);
    assert.equal(result.coinRemaining, 75000);
    assert.equal(balance(), 75000);
    assert.equal(stock.get('cerelia'), 5);
    assert.equal(result.inventoryQuantity, 5);
  });

  it('12. coin untouched when balance is short', async () => {
    const { svc, balance, stock } = buyService(100);
    await assert.rejects(svc.buyItem('u', 'cerelia', 1), RangeError);
    assert.equal(balance(), 100);
    assert.equal(stock.get('cerelia') ?? 0, 0);
  });

  it('13-14. invalid quantity and unknown items rejected', async () => {
    const { svc } = buyService();
    await assert.rejects(svc.buyItem('u', 'cerelia', 0), RangeError);
    await assert.rejects(svc.buyItem('u', 'cerelia', -1), RangeError);
    await assert.rejects(svc.buyItem('u', 'cerelia', 1.5), RangeError);
    await assert.rejects(svc.buyItem('u', 'nope', 1), RangeError);
  });
});

describe('inventory UI fallback', () => {
  it('19. unknown config ids render without crashing', () => {
    const text = formatInventory([{ item_id: 'cerelia', quantity: 10 }]);
    assert.ok(text.includes('Cerelia × 10'));
    const unknown = formatInventory([{ item_id: 'ghost_item', quantity: 5 }]);
    assert.ok(unknown.includes('Unknown Item (ghost_item) × 5'));
    assert.equal(formatInventory([]), '🎒 *INVENTORY*\n\nInventory kosong.');
  });
});
