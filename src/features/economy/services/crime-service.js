import { sql } from '#storage/connection.js';
import { userModel } from '#storage/models/user.js';
import { rpgPlayerModel } from '../../rpg/models/rpg-player.model.js';
import { rpgCoinModel } from '../../rpg/models/rpg-coin.model.js';
import { finalStatService } from '../../rpg/services/final-stat-service.js';
import { bountyModel } from '../models/bounty.model.js';
import { getCrime } from '../config/crime-config.js';
import {
  BOUNTY_CONFIG,
  bountyExpiresAt,
  calcBountySplit,
  rollBountyPercent,
} from '../config/bounty-config.js';
import { buildSnapshot } from './bounty-service.js';
import { logger } from '#helpers/logger.js';

export function randInt(min, max, random = Math.random) {
  return Math.floor(min + random() * (max - min + 1));
}

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

export function isSuccessOutcome(outcome) {
  return outcome === 'success' || outcome === 'jackpot';
}

export function createCrimeService({
  users = userModel,
  players = rpgPlayerModel,
  coins = rpgCoinModel,
  finals = finalStatService,
  bounties = bountyModel,
  db = sql,
} = {}) {
  const userRepo = users;
  const playerRepo = players;
  const coinRepo = coins;
  const finalsSvc = finals;
  const bountyRepo = bounties;

  async function ensureAll(userId, pushName = '') {
    await userRepo.ensure(userId, { pushName });
    await playerRepo.ensure(userId);
    await coinRepo.ensure(userId);
  }

  function bountyLockError(active) {
    const err = new RangeError('bounty active');
    err.code = 'BOUNTY_ACTIVE';
    err.bounty = active;
    err.expiresAt = active?.expires_at;
    return err;
  }

  return {
    async jailRemaining(
      userId,
      { nowSec = Math.floor(Date.now() / 1000), pushName = '' } = {}
    ) {
      await ensureAll(userId, pushName);
      const until = await userRepo.getPrisonUntil(userId);
      return Math.max(0, until - nowSec);
    },

    async bountyLock(userId, { nowMs = Date.now(), pushName = '' } = {}) {
      await ensureAll(userId, pushName);
      const active = await bountyRepo.findActiveByOwner(userId);
      if (!active) return null;
      if (active.expires_at <= nowMs) {
        await db.begin(async (tx) => {
          const locked = await bountyRepo.findActiveByOwner(userId, tx, true);
          if (!locked) return;
          if (locked.expires_at > nowMs) return;
          const expired = await bountyRepo.expire(locked.id, nowMs, tx);
          if (expired) {
            await coinRepo.addCoin(userId, expired.bounty_coin, tx);
          }
        });
        return null;
      }
      return active;
    },

    async commitCrime(
      userId,
      crimeId,
      {
        nowSec = Math.floor(Date.now() / 1000),
        nowMs = nowSec * 1000,
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

      const locked = await this.bountyLock(userId, { nowMs, pushName });
      if (locked) throw bountyLockError(locked);

      const crime = getCrime(crimeId);
      if (!crime) {
        throw new RangeError('unknown crime');
      }
      const outcome = rollOutcome(crime, random);

      if (isSuccessOutcome(outcome)) {
        const range =
          outcome === 'jackpot' ? crime.jackpotReward : crime.reward;
        const reward = randInt(range[0], range[1], random);
        const percent = rollBountyPercent(random);
        if (
          percent < BOUNTY_CONFIG.minBountyPercent ||
          percent > BOUNTY_CONFIG.maxBountyPercent
        ) {
          throw new RangeError('bounty percent out of range');
        }
        const split = calcBountySplit(reward, percent);
        const final = await finalsSvc.getFinalStats(userId);
        const snapshot = buildSnapshot(final);
        const createdAt = nowMs;
        const expiresAt = bountyExpiresAt(createdAt);

        const created = await db
          .begin(async (tx) => {
            const stillLocked = await bountyRepo.findActiveByOwner(
              userId,
              tx,
              true
            );
            if (stillLocked) throw bountyLockError(stillLocked);
            if (split.walletCoin > 0) {
              await coinRepo.addCoin(userId, split.walletCoin, tx);
            }
            const row = await bountyRepo.create(
              {
                ownerId: userId,
                crimeId: crime.id,
                crimeName: crime.name,
                coinReward: reward,
                bountyPercent: split.percent,
                bountyCoin: split.bountyCoin,
                snapshot,
                createdAt,
                expiresAt,
              },
              tx
            );
            return row;
          })
          .catch((err) => {
            if (err?.code === '23505') throw bountyLockError(null);
            throw err;
          });

        logger.info(
          { user: userId, crime: crime.id, reward, bounty: created.id },
          'Crime success, bounty created'
        );
        return {
          outcome,
          crime,
          reward,
          walletCoin: split.walletCoin,
          bountyCoin: split.bountyCoin,
          bountyPercent: split.percent,
          expiresAt,
          bounty: created,
        };
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
