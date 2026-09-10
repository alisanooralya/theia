/**
 * Economy 2.0 — Bounty service (migrated from legacy, same mechanics).
 *
 * One `attempt` = one daily-slot claim + battle + reward, all in one
 * transaction: the conditional daily UPDATE locks the user row, so
 * concurrent/retry attempts cannot double-hunt or double-reward. Battle
 * mirrors the domain flow (Final Stats snapshot + card skills, basic
 * attack rounds); WIN pays config-range coin + player EXP atomically.
 *
 * Dropped vs legacy: `cardService.coinRewardTotal` multiplier (no income
 * bonus concept in the 2.0 card system — pays full range as-is).
 */
import { sql } from '#storage/connection.js';
import { userModel } from '#storage/models/user.js';
import { rpgPlayerModel } from '../../rpg/models/rpg-player.model.js';
import { rpgCoinModel } from '../../rpg/models/rpg-coin.model.js';
import { finalStatService } from '../../rpg/services/final-stat-service.js';
import { createCardService } from '../../rpg/services/card-service.js';
import {
  battleSkillsFromEffects,
  createBattle,
  simulateBattle,
} from '../../rpg/services/battle-engine.js';
import { grantPlayerExp } from '../../rpg/services/player-progress.js';
import {
  BOUNTY_DIFFICULTY,
  getBountyDifficulty,
  getBountyTarget,
  wibDayStart,
} from '../config/bounty-config.js';
import { randInt } from './work-service.js';

export function createBountyService({
  users = userModel,
  players = rpgPlayerModel,
  coins = rpgCoinModel,
  finals = finalStatService,
  cards = createCardService(),
  db = sql,
} = {}) {
  const userRepo = users;
  const playerRepo = players;
  const coinRepo = coins;
  const finalsSvc = finals;
  const cardsSvc = cards;

  async function ensureAll(userId, pushName = '') {
    await userRepo.ensure(userId, { pushName });
    await playerRepo.ensure(userId);
    await coinRepo.ensure(userId);
  }

  return {
    get difficulty() {
      return BOUNTY_DIFFICULTY;
    },

    getBountyDifficulty,
    getBountyTarget,

    /**
     * One bounty attempt. Throws RangeError 'jailed-day' when the daily
     * slot is already used, 'hp0' when current HP is 0. Returns
     * { won, rounds, reward? }.
     */
    async attempt(
      userId,
      difficulty,
      targetId,
      {
        nowSec = Math.floor(Date.now() / 1000),
        random = Math.random,
        pushName = '',
      } = {}
    ) {
      const config = getBountyDifficulty(difficulty);
      if (!config) throw new RangeError('Difficulty tidak valid.');
      const target = getBountyTarget(difficulty, targetId);
      if (!target) throw new RangeError('Buronan tidak ditemukan.');
      await ensureAll(userId, pushName);

      const dayStart = wibDayStart(nowSec);

      // Snapshot Final Stats + card skills BEFORE the transaction: these
      // calls run ensures, and any write inside the tx (daily claim locks
      // the user row) would self-deadlock with a nested ensure.
      const final = await finalsSvc.getFinalStats(userId);
      const activeEffects = await cardsSvc.getActiveEffects(userId);
      const playerSkills = battleSkillsFromEffects(activeEffects);

      return db.begin(async (t) => {
        // Atomic daily claim: only one attempt per WIB day, race-safe.
        const claimed = await userRepo.claimBountyDay(
          userId,
          dayStart,
          nowSec,
          t
        );
        if (!claimed) {
          const err = new RangeError('daily used');
          err.code = 'DAILY_USED';
          throw err;
        }

        // No ensure may run after this point (rows are locked).
        const hpRows = await t`
          SELECT current_hp FROM rpg_players WHERE user_id = ${userId} FOR UPDATE
        `;
        const currentHp = Number(hpRows[0]?.current_hp ?? 0);
        if (currentHp <= 0) {
          const err = new RangeError(
            'HP kamu 0! Heal dulu sebelum berburu buronan.'
          );
          err.code = 'HP0';
          throw err;
        }

        const state = createBattle({
          playerStats: {
            maxHp: final.maxHp,
            currentHp,
            atk: final.atk,
            def: final.def,
            critRate: final.critRate,
            critDmg: final.critDmg,
          },
          enemy: {
            id: target.id,
            name: target.name,
            stats: { maxHp: target.hp, atk: target.atk, def: target.def },
          },
          playerSkills,
          battleId: `bounty:${userId}:${target.id}:${nowSec}`,
        });
        const end = simulateBattle(state, () => 'basic_attack', random);
        const won = end.status === 'WIN';

        let reward = null;
        if (won) {
          const coin = randInt(config.coin[0], config.coin[1], random);
          const exp = randInt(config.exp[0], config.exp[1], random);
          await coinRepo.addCoin(userId, coin, t);
          await grantPlayerExp(playerRepo, userId, exp, t);
          reward = { coin, exp };
        }

        return { won, rounds: end.round, reward };
      });
    },
  };
}

export const bountyService = createBountyService();
