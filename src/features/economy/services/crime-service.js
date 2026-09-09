/**
 * Economy 2.0 — Crime service (migrated from legacy, same mechanics).
 *
 * One `commitCrime` call = one roll + one effect application: rewards go
 * through the existing coin store's atomic UPDATE, penalties are clamped
 * to the wallet like legacy, and jail is a plain timestamp. No EXP (the
 * old user-level system is gone), no income modifiers, no escape system —
 * jail only blocks Crime.
 */
import { userModel } from '#storage/models/user.js';
import { rpgPlayerModel } from '../../rpg/models/rpg-player.model.js';
import { rpgCoinModel } from '../../rpg/models/rpg-coin.model.js';
import { getCrime } from '../config/crime-config.js';

export function randInt(min, max, random = Math.random) {
  return Math.floor(min + random() * (max - min + 1));
}

/** Legacy outcome table (jackpot only exists for gambling crimes). */
export function rollOutcome(crime, random = Math.random) {
  const roll = random();
  if (crime.gamble) {
    if (roll < crime.jackpotChance) return 'jackpot';
    if (roll < crime.jackpotChance + crime.winChance) return 'success';
    if (roll < crime.jackpotChance + crime.winChance + crime.caughtChance)
      return 'caught';
    return 'lose';
  }
  if (roll < crime.successChance) return 'success';
  if (roll < crime.successChance + crime.caughtChance) return 'caught';
  return 'fail';
}

export function createCrimeService({
  users = userModel,
  players = rpgPlayerModel,
  coins = rpgCoinModel,
} = {}) {
  const userRepo = users;
  const playerRepo = players;
  const coinRepo = coins;

  async function ensureAll(userId, pushName = '') {
    await userRepo.ensure(userId, { pushName });
    await playerRepo.ensure(userId);
    await coinRepo.ensure(userId);
  }

  return {
    /** Remaining jail seconds (0 = free). Row-creating read. */
    async jailRemaining(
      userId,
      { nowSec = Math.floor(Date.now() / 1000), pushName = '' } = {}
    ) {
      await ensureAll(userId, pushName);
      const until = await userRepo.getPrisonUntil(userId);
      return Math.max(0, until - nowSec);
    },

    /**
     * Resolve one crime attempt. Throws when jailed or unknown.
     * Returns { outcome, crime, reward, penalty, lose, prisonUntil } —
     * only the fields relevant to the outcome are set.
     */
    async commitCrime(
      userId,
      crimeId,
      {
        nowSec = Math.floor(Date.now() / 1000),
        random = Math.random,
        pushName = '',
      } = {}
    ) {
      await ensureAll(userId, pushName);
      const remaining = Math.max(
        0,
        (await userRepo.getPrisonUntil(userId)) - nowSec
      );
      if (remaining > 0) {
        const err = new RangeError('jailed');
        err.remaining = remaining;
        throw err;
      }
      const crime = getCrime(crimeId);
      if (!crime) {
        throw new RangeError('unknown crime');
      }
      const outcome = rollOutcome(crime, random);

      if (outcome === 'success' || outcome === 'jackpot') {
        const range =
          outcome === 'jackpot' ? crime.jackpotReward : crime.reward;
        const reward = randInt(range[0], range[1], random);
        await coinRepo.addCoin(userId, reward);
        return { outcome, crime, reward };
      }

      if (outcome === 'lose') {
        const lose = randInt(crime.loseCost[0], crime.loseCost[1], random);
        const balance = await coinRepo.getBalance(userId);
        const actualLose = Math.min(lose, balance);
        if (actualLose > 0) await coinRepo.spendCoin(userId, actualLose);
        return { outcome, crime, lose: actualLose };
      }

      if (outcome === 'caught') {
        const penalty = randInt(crime.penalty[0], crime.penalty[1], random);
        const balance = await coinRepo.getBalance(userId);
        const actualPenalty = Math.min(penalty, balance);
        if (actualPenalty > 0) await coinRepo.spendCoin(userId, actualPenalty);
        const prisonUntil = nowSec + Math.floor(crime.prisonMs / 1000);
        await userRepo.setPrisonUntil(userId, prisonUntil);
        return { outcome, crime, penalty: actualPenalty, prisonUntil };
      }

      return { outcome, crime };
    },
  };
}

export const crimeService = createCrimeService();
