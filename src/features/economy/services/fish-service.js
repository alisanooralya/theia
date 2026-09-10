/**
 * Economy 2.0 — Fish service (migrated from legacy, same mechanics).
 *
 * One `fish` = one weighted catch + reward, paid atomically: coin into
 * the existing wallet, flat EXP onto the RPG player row, both in the
 * same transaction as the roll. Retry/concurrency safety comes from the
 * command's regular cooldown (legacy used an in-memory Set; the cooldown
 * guard plays that role now) — every completed cast pays exactly once.
 *
 * Dropped vs legacy: `cardService.coinRewardTotal` multiplier (no income
 * bonus concept in the 2.0 card system — pays the rolled amount as-is).
 */
import { sql } from '#storage/connection.js';
import { userModel } from '#storage/models/user.js';
import { rpgPlayerModel } from '../../rpg/models/rpg-player.model.js';
import { rpgCoinModel } from '../../rpg/models/rpg-coin.model.js';
import { grantPlayerExp } from '../../rpg/services/player-progress.js';
import { pickFish, fishReward } from '../config/fish-config.js';

export function createFishService({
  users = userModel,
  players = rpgPlayerModel,
  coins = rpgCoinModel,
  db = sql,
} = {}) {
  const userRepo = users;
  const playerRepo = players;
  const coinRepo = coins;

  return {
    /**
     * One fishing cast. Returns { fish, coin, exp, level }.
     */
    async fish(userId, { random = Math.random, pushName = '' } = {}) {
      await userRepo.ensure(userId, { pushName });
      await playerRepo.ensure(userId);
      await coinRepo.ensure(userId);

      const fish = pickFish(random);
      const coin = fishReward(fish, random);

      return db.begin(async (t) => {
        await coinRepo.addCoin(userId, coin, t);
        const level = await grantPlayerExp(playerRepo, userId, fish.exp, t);
        return { fish, coin, exp: fish.exp, level };
      });
    },
  };
}

export const fishService = createFishService();
