import { userModel } from '#storage/models/user.js';
import { rpgPlayerModel } from '../../rpg/models/rpg-player.model.js';
import { rpgCoinModel } from '../../rpg/models/rpg-coin.model.js';
import { parseBankAmount } from '../config/bank-config.js';
import { TRANSFER_CONFIG } from '../config/transfer-config.js';

export function createTransferService({ users, players, coins } = {}) {
  const userRepo = users ?? userModel;
  const playerRepo = players ?? rpgPlayerModel;
  const coinRepo = coins ?? rpgCoinModel;

  async function ensureAll(userId, pushName = '') {
    await userRepo.ensure(userId, { pushName });
    await playerRepo.ensure(userId);
    await coinRepo.ensure(userId);
  }

  return {
    async transfer(fromId, toId, rawAmount, { pushName = '' } = {}) {
      if (!toId) throw new RangeError('Usage: `.transfer @tag <jumlah>`');
      const amount = parseBankAmount(rawAmount, {
        min: TRANSFER_CONFIG.minTransfer,
      });
      await ensureAll(fromId, pushName);
      await ensureAll(toId);
      const out = await coinRepo.transferCoin(fromId, toId, amount);
      return { amount, ...out };
    },
  };
}

export const transferService = createTransferService();
