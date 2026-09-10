import { sql } from '#storage/connection.js';
import { userModel } from '#storage/models/user.js';
import { rpgPlayerModel } from '../../rpg/models/rpg-player.model.js';
import { rpgCoinModel } from '../../rpg/models/rpg-coin.model.js';
import {
  computeStreak,
  rollDailyCoin,
  wibDayKey,
} from '../config/daily-config.js';

export function createDailyService({ users, players, coins, db = sql } = {}) {
  const userRepo = users ?? userModel;
  const playerRepo = players ?? rpgPlayerModel;
  const coinRepo = coins ?? rpgCoinModel;

  return {
    async claimDaily(
      userId,
      {
        nowSec = Math.floor(Date.now() / 1000),
        random = Math.random,
        pushName = '',
      } = {}
    ) {
      await userRepo.ensure(userId, { pushName });
      await playerRepo.ensure(userId);
      await coinRepo.ensure(userId);

      return db.begin(async (tx) => {
        const state = await userRepo.getDaily(userId, tx, true);
        const last = state?.last_daily ?? 0;
        if (last && wibDayKey(last) === wibDayKey(nowSec)) {
          return {
            status: 'already',
            coin: 0,
            streak: state?.daily_streak ?? 0,
          };
        }
        const streak = computeStreak({
          lastDaily: last,
          dailyStreak: state?.daily_streak ?? 0,
          nowSec,
        });
        const coin = rollDailyCoin(random);
        await coinRepo.addCoin(userId, coin, tx);
        await userRepo.saveDaily(userId, streak, nowSec, tx);
        return { status: 'claimed', coin, streak };
      });
    },

    async currentStreak(userId) {
      const state = await userRepo.getDaily(userId);
      return state?.daily_streak ?? 0;
    },
  };
}

export const dailyService = createDailyService();
