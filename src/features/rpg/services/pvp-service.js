import { sql } from '#storage/connection.js';
import { userModel } from '#storage/models/user.js';
import { rpgPlayerModel } from '../models/rpg-player.model.js';
import { rpgCoinModel } from '../models/rpg-coin.model.js';
import { pvpModel } from '../models/pvp.model.js';
import { finalStatService } from './final-stat-service.js';
import { createCardService } from './card-service.js';
import {
  autoSkillAction,
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

  async function findPendingByConfirmMsg(confirmMsgId) {
    return pvpRepo.findByConfirmMsgId(confirmMsgId);
  }

  async function acceptBySession(id) {
    // Give the battle a fresh deadline so the accepted session cannot be
    // reaped between accept and start; never-started rows still expire
    // once this grace passes (see pvpModel.expireStale).
    const graceSec = Math.floor(config.battleTtlMs / 1000) + 60;
    return pvpRepo.accept(id, Math.floor(Date.now() / 1000), sql, graceSec);
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
        behavior: 'skill_based',
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

    // Both sides auto-cast their active skill whenever it is off cooldown;
    // without this the active skills would never fire in a full-sim duel.
    const end = simulateBattle(state, autoSkillAction, random);
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
      let healed = null;
      if (!draw) {
        const winnerMax = winner === challenger ? cFinal.maxHp : tFinal.maxHp;
        const winnerHp = winner === challenger ? challengerHp : targetHp;
        healed = Math.min(
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
        // Post-heal values so the displayed HP matches what is stored.
        challengerHp: !draw && winner === challenger ? healed : challengerHp,
        targetHp: !draw && winner === target ? healed : targetHp,
        // Battle-start snapshot so the UI timeline anchors to the same
        // numbers the engine actually simulated from.
        startHp: {
          challenger: cFinal.currentHp,
          target: tFinal.currentHp,
          challengerMax: cFinal.maxHp,
          targetMax: tFinal.maxHp,
        },
        coin: coinApplied,
        loserLoss,
        exp: draw ? 0 : { win: config.expWin, lose: config.expLose },
        log: end.log,
      };
      // The session may have been cancelled mid-battle (e.g. target
      // declined in the same instant); rolling back keeps HP, coins and
      // EXP consistent instead of rewarding a dead session.
      const finished = await pvpRepo.finish(id, result, tx);
      if (!finished) throw new RangeError('Sesi PvP sudah tidak aktif.');
      return result;
    });
  }

  async function cancel(id) {
    await pvpRepo.cancel(id);
  }

  return {
    challenge,
    bindConfirm,
    findPendingByConfirmMsg,
    acceptBySession,
    run,
    cancel,
  };
}

export const pvpService = createPvpService();
