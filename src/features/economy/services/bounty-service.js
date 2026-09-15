import { sql } from '#storage/connection.js';
import { userModel } from '#storage/models/user.js';
import { rpgPlayerModel } from '../../rpg/models/rpg-player.model.js';
import { rpgCoinModel } from '../../rpg/models/rpg-coin.model.js';
import { finalStatService } from '../../rpg/services/final-stat-service.js';
import { createCardService } from '../../rpg/services/card-service.js';
import {
  autoSkillAction,
  battleSkillsFromEffects,
  createBattle,
  simulateBattle,
} from '../../rpg/services/battle-engine.js';
import { bountyModel } from '../models/bounty.model.js';
import {
  BOUNTY_CONFIG,
  bountyExpiresAt,
  calcBountySplit,
  rollBountyPercent,
} from '../config/bounty-config.js';
import { logger } from '#helpers/logger.js';

export function buildSnapshot(final) {
  if (!final) throw new RangeError('final stats required for snapshot');
  return {
    level: final.level,
    maxHp: final.maxHp,
    atk: final.atk,
    def: final.def,
    critRate: final.critRate,
    critDmg: final.critDmg,
  };
}

export function createBountyService({
  users = userModel,
  players = rpgPlayerModel,
  coins = rpgCoinModel,
  finals = finalStatService,
  cards = createCardService(),
  bounties = bountyModel,
  db = sql,
  config = BOUNTY_CONFIG,
} = {}) {
  const userRepo = users;
  const playerRepo = players;
  const coinRepo = coins;
  const finalsSvc = finals;
  const cardsSvc = cards;
  const bountyRepo = bounties;

  async function ensureAll(userId, pushName = '') {
    await userRepo.ensure(userId, { pushName });
    await playerRepo.ensure(userId);
    await coinRepo.ensure(userId);
  }

  async function expireActiveLocked(ownerId, nowMs, client) {
    const active = await bountyRepo.findActiveByOwner(ownerId, client, true);
    if (!active) return null;
    if (active.expires_at > nowMs) return null;
    const expired = await bountyRepo.expire(active.id, nowMs, client);
    if (!expired) return null;
    await coinRepo.addCoin(ownerId, expired.bounty_coin, client);
    logger.info(
      { owner: ownerId, bounty: expired.id },
      'Bounty expired, coin refunded'
    );
    return expired;
  }

  return {
    config,
    rollBountyPercent,
    calcBountySplit,
    buildSnapshot,

    async getActive(ownerId, { nowMs = Date.now() } = {}) {
      const active = await bountyRepo.findActiveByOwner(ownerId);
      if (!active) return null;
      if (active.expires_at > nowMs) return active;
      await db.begin(async (tx) => {
        await expireActiveLocked(ownerId, nowMs, tx);
      });
      return null;
    },

    async listBoard({ nowMs = Date.now(), limit = config.boardLimit } = {}) {
      await db.begin(async (tx) => {
        const due = await bountyRepo.expireDue(nowMs, tx);
        for (const row of due) {
          await coinRepo.addCoin(row.owner_id, row.bounty_coin, tx);
        }
        if (due.length) {
          logger.info({ count: due.length }, 'Bounty expireDue refunded');
        }
      });
      return bountyRepo.listActive(limit);
    },

    async expireDue({ nowMs = Date.now() } = {}) {
      return db.begin(async (tx) => {
        const due = await bountyRepo.expireDue(nowMs, tx);
        for (const row of due) {
          await coinRepo.addCoin(row.owner_id, row.bounty_coin, tx);
        }
        return due;
      });
    },

    async hunt(
      hunterId,
      targetId,
      { nowMs = Date.now(), random = Math.random, pushName = '' } = {}
    ) {
      if (hunterId === targetId) {
        const err = new RangeError('Tidak bisa memburu diri sendiri.');
        err.code = 'SELF_HUNT';
        throw err;
      }
      await ensureAll(hunterId, pushName);

      // Lazy expiry in its own transaction so the refund commits even
      // though the hunt itself is rejected below. Throwing after a write
      // inside the main transaction would roll the refund back.
      const pre = await bountyRepo.findActiveByOwner(targetId);
      if (pre && pre.expires_at <= nowMs) {
        await db.begin(async (tx) => {
          await expireActiveLocked(targetId, nowMs, tx);
        });
        const err = new RangeError(
          'Bounty sudah expired dan dikembalikan ke pemilik.'
        );
        err.code = 'EXPIRED';
        throw err;
      }

      const hunterFinal = await finalsSvc.getFinalStats(hunterId);
      const hunterEffects = await cardsSvc.getActiveEffects(hunterId);
      const hunterSkills = battleSkillsFromEffects(hunterEffects);

      return db.begin(async (tx) => {
        const bounty = await bountyRepo.findActiveByOwner(targetId, tx, true);
        if (!bounty) {
          const err = new RangeError('Target tidak memiliki bounty aktif.');
          err.code = 'NO_BOUNTY';
          throw err;
        }
        if (bounty.expires_at <= nowMs) {
          // Lost the race with expiry: settle refund in this same
          // transaction and return normally so it commits.
          const expired = await bountyRepo.expire(bounty.id, nowMs, tx);
          if (expired) {
            await coinRepo.addCoin(targetId, expired.bounty_coin, tx);
          }
          return { won: false, expired: true, rounds: 0, bounty: expired };
        }

        const hpRows = await tx.unsafe(
          'SELECT current_hp FROM rpg_players WHERE user_id = $1 FOR UPDATE',
          [hunterId]
        );
        const hunterHp = Number(hpRows[0]?.current_hp ?? 0);
        if (!(hunterHp > 0)) {
          const err = new RangeError(
            'HP kamu 0! Heal dulu sebelum berburu buronan.'
          );
          err.code = 'HP0';
          throw err;
        }

        const snap = bounty.snapshot;
        const state = createBattle({
          playerStats: {
            maxHp: hunterFinal.maxHp,
            currentHp: hunterHp,
            atk: hunterFinal.atk,
            def: hunterFinal.def,
            critRate: hunterFinal.critRate,
            critDmg: hunterFinal.critDmg,
          },
          enemy: {
            id: targetId,
            name: bounty.crime_name || targetId,
            behavior: 'basic',
            stats: {
              maxHp: snap.maxHp,
              atk: snap.atk,
              def: snap.def,
              critRate: snap.critRate ?? 0,
              critDmg: snap.critDmg ?? 2.0,
            },
          },
          playerSkills: hunterSkills,
          enemySkills: null,
          maxRounds: config.maxRounds,
          battleId: `bounty:${hunterId}:${targetId}:${nowMs}`,
        });

        const end = simulateBattle(state, autoSkillAction, random);
        const won = end.status === 'WIN';
        const hunterHpAfter = end.player.hp;

        await playerRepo.setCurrentHp(hunterId, hunterHpAfter, tx);

        if (!won) {
          return {
            won: false,
            draw: end.status === 'DRAW',
            rounds: end.round,
            bounty,
          };
        }

        const claimed = await bountyRepo.claim(bounty.id, hunterId, nowMs, tx);
        if (!claimed) {
          const err = new RangeError('Bounty sudah diselesaikan orang lain.');
          err.code = 'ALREADY_CLAIMED';
          throw err;
        }
        await coinRepo.addCoin(hunterId, claimed.bounty_coin, tx);
        logger.info(
          { bounty: claimed.id, hunter: hunterId, target: targetId },
          'Bounty claimed'
        );
        return {
          won: true,
          rounds: end.round,
          bounty: claimed,
          reward: claimed.bounty_coin,
        };
      });
    },
  };
}

export const bountyService = createBountyService();

export { bountyExpiresAt };
