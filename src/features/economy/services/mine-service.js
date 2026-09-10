import { sql } from '#storage/connection.js';
import { userModel } from '#storage/models/user.js';
import { rpgPlayerModel } from '../../rpg/models/rpg-player.model.js';
import { rpgCoinModel } from '../../rpg/models/rpg-coin.model.js';
import { grantPlayerExp } from '../../rpg/services/player-progress.js';
import { pickOre, mineReward } from '../config/mine-config.js';

export function createMineService({
  users = userModel,
  players = rpgPlayerModel,
  coins = rpgCoinModel,
  db = sql,
} = {}) {
  const userRepo = users;
  const playerRepo = players;
  const coinRepo = coins;

  return {
    async mine(userId, { random = Math.random, pushName = '' } = {}) {
      await userRepo.ensure(userId, { pushName });
      await playerRepo.ensure(userId);
      await coinRepo.ensure(userId);

      const ore = pickOre(random);
      const coin = mineReward(ore, random);

      return db.begin(async (t) => {
        await coinRepo.addCoin(userId, coin, t);
        const level = await grantPlayerExp(playerRepo, userId, ore.exp, t);
        return { ore, coin, exp: ore.exp, level };
      });
    },
  };
}

export const mineService = createMineService();
