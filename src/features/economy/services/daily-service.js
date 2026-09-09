/**
 * Economy — Daily service (business logic; thin SQL via models).
 *
 * Atomic `.daily` claim: lock user row -> reject same WIB calendar day
 * -> legacy 48h streak rule -> config-range coin roll -> credit wallet
 * -> persist streak/date -> commit. Concurrent same-day claims serialize
 * on the row lock, so at most one succeeds; failures roll back coin and
 * streak together. Coin uses the existing RPG wallet store (the only
 * coin system available); no new currency, no EXP (user levels no longer
 * exist), no streak bonus (legacy had none).
 */
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
    /**
     * Claim daily for `userId`. Returns
     * { status: 'claimed', coin, streak } or
     * { status: 'already', coin: 0, streak }.
     * `nowSec`/`random` injectable for tests.
     */
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

    /** Current streak without mutating (0 when never claimed). */
    async currentStreak(userId) {
      const state = await userRepo.getDaily(userId);
      return state?.daily_streak ?? 0;
    },
  };
}

export const dailyService = createDailyService();
