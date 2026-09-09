import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
  BANK_CONFIG,
  parseBankAmount,
} from '../src/features/economy/config/bank-config.js';
import { createBankService } from '../src/features/economy/services/bank-service.js';

/** In-memory wallet mimicking the conditional-UPDATE contract. */
function fakeCoins(state = { coin: 0, bank: 0 }) {
  return {
    state,
    async ensure() {},
    async getWallet() {
      return { ...state };
    },
    async depositToBank(_userId, amount) {
      if (state.coin < amount) throw new RangeError('Coin tidak cukup');
      state.coin -= amount;
      state.bank += amount;
      return { ...state };
    },
    async withdrawFromBank(_userId, amount) {
      if (state.bank < amount) throw new RangeError('Saldo bank tidak cukup');
      state.bank -= amount;
      state.coin += amount;
      return { ...state };
    },
  };
}

const noopRepo = { ensure: async () => {} };
const makeService = (state) =>
  createBankService({ users: noopRepo, players: noopRepo, coins: fakeCoins(state) });

describe('bank config', () => {
  it('exposes only storage tunables (no interest/fee/limit)', () => {
    assert.equal(BANK_CONFIG.minDeposit, 1);
    assert.equal(BANK_CONFIG.minWithdraw, 1);
    assert.equal(BANK_CONFIG.interest, undefined);
    assert.equal(BANK_CONFIG.fee, undefined);
    assert.equal(BANK_CONFIG.bankLimit, undefined);
  });

  it('accepts plain integer amounts', () => {
    assert.equal(parseBankAmount('50000'), 50000);
    assert.equal(parseBankAmount(20000), 20000);
    assert.equal(parseBankAmount('  1000  '), 1000);
  });

  it('rejects non-numeric, decimal, zero, and negative amounts', () => {
    for (const bad of ['abc', '', '   ', undefined, null, '12.5', '10k', '50k', '1e3', 1.5, NaN, 0, '0', -5, '-5']) {
      assert.throws(() => parseBankAmount(bad, { min: 1 }), RangeError, String(bad));
    }
  });

  it('enforces the configured minimum', () => {
    assert.throws(() => parseBankAmount(50, { min: 100 }), /Minimal/);
    assert.equal(parseBankAmount(100, { min: 100 }), 100);
  });
});

describe('bank service (pure)', () => {
  it('reads balance without mutating', async () => {
    const svc = makeService({ coin: 125000, bank: 500000 });
    const first = await svc.getBalance('u');
    assert.deepEqual(first, { coin: 125000, bank: 500000, total: 625000 });
    const second = await svc.getBalance('u');
    assert.deepEqual(second, first);
  });

  it('deposit moves coin -> bank conserving total', async () => {
    const svc = makeService({ coin: 125000, bank: 0 });
    const out = await svc.deposit('u', '50000');
    assert.deepEqual(out, { coin: 75000, bank: 50000, total: 125000, amount: 50000 });
  });

  it('withdraw moves bank -> coin conserving total', async () => {
    const svc = makeService({ coin: 75000, bank: 50000 });
    const out = await svc.withdraw('u', 20000);
    assert.deepEqual(out, { coin: 95000, bank: 30000, total: 125000, amount: 20000 });
  });

  it('rejects over-deposit and over-withdraw without touching balances', async () => {
    const state = { coin: 10000, bank: 5000 };
    const svc = makeService(state);
    await assert.rejects(svc.deposit('u', 50000), /Coin tidak cukup/);
    await assert.rejects(svc.withdraw('u', 20000), /Saldo bank tidak cukup/);
    assert.deepEqual(state, { coin: 10000, bank: 5000 });
  });

  it('rejects invalid/zero/negative amounts without touching balances', async () => {
    const state = { coin: 10000, bank: 5000 };
    const svc = makeService(state);
    for (const bad of ['abc', 0, '0', -5, 1.5]) {
      await assert.rejects(svc.deposit('u', bad), RangeError);
      await assert.rejects(svc.withdraw('u', bad), RangeError);
    }
    assert.deepEqual(state, { coin: 10000, bank: 5000 });
  });
});

describe('balance/bank commands (metadata)', () => {
  it('registers economy commands with legacy balance aliases', async () => {
    const balance = (await import('../src/commands/modules/economy/balance.js')).default;
    const bank = (await import('../src/commands/modules/economy/bank.js')).default;
    assert.equal(balance.name, 'balance');
    assert.deepEqual([...balance.aliases].sort(), ['bal', 'dompet', 'saldo']);
    assert.equal(balance.category, 'economy');
    assert.equal(bank.name, 'bank');
    assert.equal(bank.category, 'economy');
    assert.equal(typeof balance.execute, 'function');
    assert.equal(typeof bank.execute, 'function');
  });
});
