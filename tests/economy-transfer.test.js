import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { TRANSFER_CONFIG } from '../src/features/economy/config/transfer-config.js';
import { createTransferService } from '../src/features/economy/services/transfer-service.js';

/** In-memory wallets mimicking the transferCoin contract. */
function fakeCoins(balances = {}) {
  return {
    balances,
    async ensure(id) {
      if (!(id in this.balances)) this.balances[id] = 0;
    },
    async transferCoin(fromId, toId, amount) {
      if (fromId === toId) throw new RangeError('Tidak bisa transfer ke diri sendiri.');
      if ((this.balances[fromId] ?? 0) < amount) throw new RangeError('Coin tidak cukup');
      this.balances[fromId] -= amount;
      this.balances[toId] = (this.balances[toId] ?? 0) + amount;
      return { senderCoin: this.balances[fromId], receiverCoin: this.balances[toId] };
    },
  };
}

const noopRepo = { ensure: async () => {} };
const makeService = (balances) =>
  createTransferService({ users: noopRepo, players: noopRepo, coins: fakeCoins(balances) });

describe('transfer config', () => {
  it('exposes only storage tunables (no tax/fee)', () => {
    assert.equal(TRANSFER_CONFIG.minTransfer, 1);
    assert.equal(TRANSFER_CONFIG.tax, undefined);
    assert.equal(TRANSFER_CONFIG.fee, undefined);
    assert.equal(TRANSFER_CONFIG.taxRate, undefined);
  });
});

describe('transfer service (pure)', () => {
  it('moves the full amount with nothing burned', async () => {
    const svc = makeService({ alice: 50000, bob: 0 });
    const out = await svc.transfer('alice', 'bob', '20000');
    assert.deepEqual(out, { amount: 20000, senderCoin: 30000, receiverCoin: 20000 });
  });

  it('rejects missing target with usage', async () => {
    const svc = makeService({ alice: 50000 });
    await assert.rejects(svc.transfer('alice', null, 1000), /Usage/);
  });

  it('rejects self-transfer without touching funds', async () => {
    const balances = { alice: 50000 };
    const svc = makeService(balances);
    await assert.rejects(svc.transfer('alice', 'alice', 1000), /diri sendiri/);
    assert.deepEqual(balances, { alice: 50000 });
  });

  it('rejects over-balance without touching funds', async () => {
    const balances = { alice: 10000, bob: 5000 };
    const svc = makeService(balances);
    await assert.rejects(svc.transfer('alice', 'bob', 50000), /Coin tidak cukup/);
    assert.deepEqual(balances, { alice: 10000, bob: 5000 });
  });

  it('rejects invalid/zero/negative amounts without touching funds', async () => {
    const balances = { alice: 10000, bob: 5000 };
    const svc = makeService(balances);
    for (const bad of ['abc', undefined, 0, '0', -5, 1.5]) {
      await assert.rejects(svc.transfer('alice', 'bob', bad), RangeError);
    }
    assert.deepEqual(balances, { alice: 10000, bob: 5000 });
  });

  it('conserves sender+receiver total', async () => {
    const balances = { alice: 50000, bob: 10000 };
    const svc = makeService(balances);
    await svc.transfer('alice', 'bob', 20000);
    await svc.transfer('bob', 'alice', 5000);
    assert.equal(balances.alice + balances.bob, 60000);
  });
});

describe('transfer command (metadata)', () => {
  it('registers the economy command with legacy aliases', async () => {
    const mod = (await import('../src/commands/modules/economy/transfer.js')).default;
    assert.equal(mod.name, 'transfer');
    assert.ok(mod.aliases.includes('tf'));
    assert.ok(mod.aliases.includes('kirim'));
    assert.equal(mod.category, 'economy');
    assert.equal(typeof mod.execute, 'function');
  });
});
