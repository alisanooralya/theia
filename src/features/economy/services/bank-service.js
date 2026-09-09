/**
 * Economy — Bank service (business logic; thin SQL via models).
 *
 * Read-only balance plus atomic deposit/withdraw over the existing
 * `rpg_wallets` store (single row holds both coin and bank, so each move
 * is one conditional UPDATE: total conserved, negatives impossible,
 * concurrent requests serialize on the row lock). No transaction wrapper
 * is needed around a single statement — it is already atomic.
 *
 * Storage only: no interest, growth, fee, tax, limit, investment, or
 * scheduler. Same currency (coin) everywhere; no second coin system.
 */
import { userModel } from '#storage/models/user.js';
import { rpgPlayerModel } from '../../rpg/models/rpg-player.model.js';
import { rpgCoinModel } from '../../rpg/models/rpg-coin.model.js';
import { BANK_CONFIG, parseBankAmount } from '../config/bank-config.js';

export function createBankService({
  users,
  players,
  coins,
} = {}) {
  const userRepo = users ?? userModel;
  const playerRepo = players ?? rpgPlayerModel;
  const coinRepo = coins ?? rpgCoinModel;

  async function ensureAll(userId, pushName = '') {
    await userRepo.ensure(userId, { pushName });
    await playerRepo.ensure(userId);
    await coinRepo.ensure(userId);
  }

  function withTotal(wallet, extra = {}) {
    return {
      coin: wallet.coin,
      bank: wallet.bank,
      total: wallet.coin + wallet.bank,
      ...extra,
    };
  }

  return {
    /** Read-only balance snapshot. Mutates nothing except ensuring rows. */
    async getBalance(userId, { pushName = '' } = {}) {
      await ensureAll(userId, pushName);
      return withTotal(await coinRepo.getWallet(userId));
    },

    /** Move `rawAmount` coin -> bank. Returns the new balances. */
    async deposit(userId, rawAmount, { pushName = '' } = {}) {
      const amount = parseBankAmount(rawAmount, { min: BANK_CONFIG.minDeposit });
      await ensureAll(userId, pushName);
      return withTotal(await coinRepo.depositToBank(userId, amount), { amount });
    },

    /** Move `rawAmount` bank -> coin. Returns the new balances. */
    async withdraw(userId, rawAmount, { pushName = '' } = {}) {
      const amount = parseBankAmount(rawAmount, { min: BANK_CONFIG.minWithdraw });
      await ensureAll(userId, pushName);
      return withTotal(await coinRepo.withdrawFromBank(userId, amount), { amount });
    },
  };
}

export const bankService = createBankService();
