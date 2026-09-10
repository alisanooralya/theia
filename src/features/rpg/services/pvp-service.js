import { sql } from '#storage/connection.js';
import { userModel } from '#storage/models/user.js';
import { rpgPlayerModel } from '../models/rpg-player.model.js';
import { rpgCoinModel } from '../models/rpg-coin.model.js';
import { pvpModel } from '../models/pvp.model.js';
import { finalStatService } from './final-stat-service.js';
import { createCardService } from './card-service.js';
import {
  battleSkillsFromEffects,
  createBattle,
  simulateBattle,
} from './battle-engine.js';
import { grantPlayerExp } from './player-progress.js';
import { PVP_CONFIG } from '../config/pvp-config.js';

export function createPvpService({
  users = userModel,
  players = rpgPlayerModel,
  coins = rpgCoinModel,
  pvp = pvpModel,
  finals = finalStatService,
  cards = createCardService(),
  db = sql,
  config = PVP_CONFIG,
} = {}) {
  const userRepo = users;
  const playerRepo = players;
  const coinRepo = coins;
  const pvpRepo = pvp;
  const finalsSvc = finals;
  const cardsSvc = cards;

  async function ensureAll(userId, pushName = '') {
    await userRepo.ensure(userId, { pushName });
    await playerRepo.ensure(userId);
    await coinRepo.ensure(userId);
  }

  async function challenge(challenger, target, { confirmMsgId = '' } = {}) {
    if (challenger === target) {
      const err = new RangeError('Tidak bisa battle dengan diri sendiri.');
      err.code = 'SELF';
      throw err;
    }
    await ensureAll(challenger);
    await ensureAll(target);

    const [cFinal, tFinal] = await Promise.all([
      finalsSvc.getFinalStats(challenger),
      finalsSvc.getFinalStats(target),
    ]);
    if (cFinal.currentHp <= 0) {
      const err = new RangeError('HP kamu 0! Heal dulu sebelum PvP.');
      err.code = 'HP0';
      throw err;
    }
    if (tFinal.currentHp <= 0) {
      const err = new RangeError('HP lawan sedang 0, tunggu dia heal dulu.');
      err.code = 'HP0_TARGET';
      throw err;
    }

    const nowSec = Math.floor(Date.now() / 1000);
    await pvpRepo.expireStale(nowSec, Math.floor(config.battleTtlMs / 1000));

    const expiresAt = nowSec + Math.floor(config.confirmTtlMs / 1000);
    const session = await pvpRepo.create(challenger, target, {
      confirmMsgId,
      expiresAt,
    });
    if (!session) {
      const err = new RangeError('Kamu atau lawan sedang ada PvP aktif.');
      err.code = 'BUSY';
      throw err;
    }
    return session;
  }

  async function bindConfirm(id, confirmMsgId) {
    if (!confirmMsgId) return pvpRepo.find(id);
    const current = await pvpRepo.find(id);
    if (!current || current.status !== 'pending') return null;
    if (current.confirm_msg_id) return current;
    try {
      await db`
        UPDATE rpg_pvp_sessions
        SET confirm_msg_id = ${confirmMsgId},
            updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
        WHERE id = ${id} AND status = 'pending'
      `;
    } catch (err) {
      if (err?.code === '23505') return null;
      throw err;
    }
    return pvpRepo.find(id);
  }

  async function accept(confirmMsgId, responderId) {
    const session = await pvpRepo.findByConfirmMsgId(confirmMsgId);
    if (!session) return null;
    if (session.target !== responderId) return null;
    const accepted = await pvpRepo.accept(session.id);
    return accepted;
  }

  async function findPendingByConfirmMsg(confirmMsgId) {
    return pvpRepo.findByConfirmMsgId(confirmMsgId);
  }

  async function acceptBySession(id) {
    return pvpRepo.accept(id);
  }

  async function run(id, { random = Math.random } = {}) {
    const started = await pvpRepo.start(id);
    if (!started) return null;

    const challenger = started.challenger;
    const target = started.target;

    const [cFinal, tFinal] = await Promise.all([
      finalsSvc.getFinalStats(challenger),
      finalsSvc.getFinalStats(target),
    ]);
    const [cEffects, tEffects] = await Promise.all([
      cardsSvc.getActiveEffects(challenger),
      cardsSvc.getActiveEffects(target),
    ]);
    const cSkills = battleSkillsFromEffects(cEffects);
    const tSkills = battleSkillsFromEffects(tEffects);

    const state = createBattle({
      playerStats: {
        maxHp: cFinal.maxHp,
        currentHp: Math.max(0, cFinal.currentHp),
        atk: cFinal.atk,
        def: cFinal.def,
        critRate: cFinal.critRate,
        critDmg: cFinal.critDmg,
      },
      enemy: {
        id: target,
        name: target,
        stats: {
          maxHp: tFinal.maxHp,
          atk: tFinal.atk,
          def: tFinal.def,
          critRate: tFinal.critRate,
          critDmg: tFinal.critDmg,
        },
      },
      playerSkills: cSkills,
      enemySkills: tSkills,
      maxRounds: config.maxRounds,
      battleId: id,
    });

    const end = simulateBattle(state, () => 'basic_attack', random);
    const draw = end.status === 'DRAW';
    const challengerWon = end.status === 'WIN';
    const winner = challengerWon ? challenger : target;
    const loser = challengerWon ? target : challenger;

    const challengerHp = end.player.hp;
    const targetHp = end.enemy.hp;

    const rewardCoin = draw
      ? 0
      : Math.floor(
          config.rewardCoin *
            Math.min(
              1 + (await pvpRepo.getStreak(winner)) * config.streakMultStep,
              config.streakMultMax
            )
        );

    return db.begin(async (tx) => {
      await playerRepo.setCurrentHp(challenger, challengerHp, tx);
      await playerRepo.setCurrentHp(target, targetHp, tx);

      let coinApplied = 0;
      let loserLoss = 0;
      if (!draw) {
        const winnerMax = winner === challenger ? cFinal.maxHp : tFinal.maxHp;
        const winnerHp = winner === challenger ? challengerHp : targetHp;
        const healed = Math.min(
          winnerMax,
          winnerHp + Math.floor(winnerMax * config.winnerHealPct)
        );
        await playerRepo.setCurrentHp(winner, healed, tx);

        if (rewardCoin > 0) await coinRepo.addCoin(winner, rewardCoin, tx);
        coinApplied = rewardCoin;

        const loserBalance = await coinRepo.getBalance(loser, tx);
        loserLoss = Math.min(config.loserLoss, loserBalance);
        if (loserLoss > 0) await coinRepo.spendCoin(loser, loserLoss, tx);

        await pvpRepo.recordWin(winner, tx);
        await pvpRepo.recordLoss(loser, tx);
        await grantPlayerExp(playerRepo, winner, config.expWin, tx);
        await grantPlayerExp(playerRepo, loser, config.expLose, tx);
      }

      const result = {
        draw,
        winner: draw ? null : winner,
        loser: draw ? null : loser,
        challenger,
        target,
        rounds: end.round,
        challengerHp,
        targetHp,
        coin: coinApplied,
        loserLoss,
        exp: draw ? 0 : { win: config.expWin, lose: config.expLose },
        log: end.log,
      };
      await pvpRepo.finish(id, result, tx);
      return result;
    });
  }

  async function cancel(id) {
    await pvpRepo.cancel(id);
  }

  return {
    challenge,
    bindConfirm,
    accept,
    findPendingByConfirmMsg,
    acceptBySession,
    run,
    cancel,
  };
}

export const pvpService = createPvpService();
