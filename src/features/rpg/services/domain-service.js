import { randomUUID } from 'node:crypto';
import { sql } from '#storage/connection.js';
import { getDomain, rollReward } from '../config/domain-config.js';
import { expRequiredForLevel } from '../config/stats-config.js';
import { rpgPlayerModel } from '../models/rpg-player.model.js';
import { rpgCoinModel } from '../models/rpg-coin.model.js';
import { rpgInventoryModel } from '../models/rpg-inventory.model.js';
import { finalStatService as defaultFinals } from './final-stat-service.js';
import { createCardService } from './card-service.js';
import {
  battleSkillsFromEffects,
  createBattle,
  simulateBattle,
} from './battle-engine.js';

export function makeDomainKey(userId, difficulty) {
  return `domain:${userId}:${difficulty}:${Date.now()}:${randomUUID()}`;
}

function applyExp(level, exp, gained) {
  let total = exp + gained;
  let lv = level;
  for (;;) {
    const need = expRequiredForLevel(lv);
    if (total < need) break;
    total -= need;
    lv += 1;
  }
  return { level: lv, exp: total };
}

export function createDomainService({
  playerModel,
  coinModel,
  inventoryModel,
  finalStatsService,
  cardService,
  db = sql,
} = {}) {
  const players = playerModel ?? rpgPlayerModel;
  const coins = coinModel ?? rpgCoinModel;
  const inventory = inventoryModel ?? rpgInventoryModel;
  const finals = finalStatsService ?? defaultFinals;
  const cards = cardService ?? createCardService();

  async function claimRun(requestKey, userId, difficulty, client) {
    const rows = await client`
      INSERT INTO rpg_domain_runs (request_key, user_id, difficulty)
      VALUES (${requestKey}, ${userId}, ${difficulty})
      ON CONFLICT (request_key) DO NOTHING
      RETURNING request_key
    `;
    return Boolean(rows[0]);
  }

  async function priorRun(requestKey, userId, client) {
    const rows = await client`
      SELECT status, rewards FROM rpg_domain_runs
      WHERE request_key = ${requestKey} AND user_id = ${userId}
    `;
    if (!rows[0]) return null;
    let rewards;
    try {
      rewards = JSON.parse(rows[0].rewards);
    } catch {
      rewards = {};
    }
    return { status: rows[0].status, rewards };
  }

  return {
    async runDomain(
      userId,
      difficulty,
      { requestKey = null, random = Math.random, maxRounds = null } = {}
    ) {
      const domain = getDomain(difficulty);
      if (!domain) throw new RangeError(`Unknown difficulty: ${difficulty}`);
      const key = requestKey ?? makeDomainKey(userId, domain.id);
      await players.ensure(userId);
      await coins.ensure(userId);

      return db.begin(async (tx) => {
        const claimed = await claimRun(key, userId, domain.id, tx);
        if (!claimed) {
          const prior = await priorRun(key, userId, tx);
          if (!prior) throw new RangeError('Domain request sudah diproses.');
          return {
            requestKey: key,
            difficulty: domain.id,
            bossName: domain.boss.name,
            status: prior.status,
            rounds: null,
            rewards: prior.rewards,
            leveledUp: false,
            duplicate: true,
          };
        }

        await tx`SELECT user_id FROM rpg_players WHERE user_id = ${userId} FOR UPDATE`;
        const final = await finals.getFinalStats(userId);
        const activeEffects = await cards.getActiveEffects(userId);
        const playerSkills = battleSkillsFromEffects(activeEffects);

        const state = createBattle({
          playerStats: {
            maxHp: final.maxHp,
            currentHp: final.currentHp,
            atk: final.atk,
            def: final.def,
            critRate: final.critRate,
            critDmg: final.critDmg,
          },
          enemy: domain.boss,
          playerSkills,
          battleId: key,
          ...(maxRounds ? { maxRounds } : {}),
        });
        const end = simulateBattle(state, () => 'basic_attack', random);
        const playerHp = end.player.hp;

        await players.setCurrentHp(userId, playerHp, tx);

        if (end.status !== 'WIN') {
          await tx`
            UPDATE rpg_domain_runs SET status = ${end.status}, rewards = '{}'
            WHERE request_key = ${key}
          `;
          return {
            requestKey: key,
            difficulty: domain.id,
            bossName: domain.boss.name,
            status: end.status,
            rounds: end.round,
            rewards: null,
            leveledUp: false,
            duplicate: false,
          };
        }

        const rewards = {
          exp: rollReward(domain.rewards.exp, random),
          coin: rollReward(domain.rewards.coin, random),
          cerelia: rollReward(domain.rewards.cerelia, random),
        };
        const player = await players.get(userId, tx);
        const grown = applyExp(player.level, player.exp, rewards.exp);
        await players.setLevel(userId, grown.level, tx);
        await players.setExp(userId, grown.exp, tx);
        await coins.addCoin(userId, rewards.coin, tx);
        await inventory.add(userId, 'cerelia', rewards.cerelia, tx);
        await tx`
          UPDATE rpg_domain_runs
          SET status = 'WIN', rewards = ${JSON.stringify(rewards)}
          WHERE request_key = ${key}
        `;
        return {
          requestKey: key,
          difficulty: domain.id,
          bossName: domain.boss.name,
          status: 'WIN',
          rounds: end.round,
          rewards,
          leveledUp: grown.level > player.level,
          duplicate: false,
        };
      });
    },
  };
}

export const domainService = createDomainService();
