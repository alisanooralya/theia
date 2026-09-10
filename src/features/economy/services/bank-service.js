import { userModel } from '#storage/models/user.js';
import { rpgPlayerModel } from '../../rpg/models/rpg-player.model.js';
import { rpgCoinModel } from '../../rpg/models/rpg-coin.model.js';
import { BANK_CONFIG, parseBankAmount } from '../config/bank-config.js';

export function createBankService({ users, players, coins } = {}) {
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
    async getBalance(userId, { pushName = '' } = {}) {
      await ensureAll(userId, pushName);
      return withTotal(await coinRepo.getWallet(userId));
    },

    async deposit(userId, rawAmount, { pushName = '' } = {}) {
      const amount = parseBankAmount(rawAmount, {
        min: BANK_CONFIG.minDeposit,
      });
      await ensureAll(userId, pushName);
      return withTotal(await coinRepo.depositToBank(userId, amount), {
        amount,
      });
    },

    async withdraw(userId, rawAmount, { pushName = '' } = {}) {
      const amount = parseBankAmount(rawAmount, {
        min: BANK_CONFIG.minWithdraw,
      });
      await ensureAll(userId, pushName);
      return withTotal(await coinRepo.withdrawFromBank(userId, amount), {
        amount,
      });
    },
  };
}

export const bankService = createBankService();
