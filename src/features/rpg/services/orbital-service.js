import { sql } from '#storage/connection.js';
import { userModel } from '#storage/models/user.js';
import { rpgPlayerModel } from '../models/rpg-player.model.js';
import { rpgCoinModel } from '../models/rpg-coin.model.js';
import { rpgInventoryModel } from '../models/rpg-inventory.model.js';
import { orbitalModel } from '../models/orbital.model.js';
import { finalStatService } from './final-stat-service.js';
import { createCardService } from './card-service.js';
import {
  autoSkillAction,
  battleSkillsFromEffects,
  createBattle,
  simulateBattle,
} from './battle-engine.js';
import { grantPlayerExp } from './player-progress.js';
import {
  ORBITAL_BOSS_INTERVAL,
  ORBITAL_COST_BOSS,
  ORBITAL_COST_NORMAL,
  ORBITAL_ENEMY,
  ORBITAL_MAX_FLOOR,
  ORBITAL_RECORDS,
  ORBITAL_REWARD_BOSS,
  ORBITAL_REWARD_NORMAL,
  ORBITAL_SIGNAL_MAX,
  ORBITAL_SIGNAL_REGEN_MS,
  ORBITAL_SIGNAL_START,
  costForFloor,
  enemyForFloor,
  isBossFloor,
  recordForFloor,
} from '../config/orbital-lift-config.js';

function rollInt(min, max, random = Math.random) {
  return min + Math.floor(random() * (max - min + 1));
}

export function accrueSignal(signal, updatedAt, nowMs = Date.now()) {
  let value = Math.max(0, Number(signal) || 0);
  let updated = Number(updatedAt) || 0;
  if (value >= ORBITAL_SIGNAL_MAX) {
    return { value: ORBITAL_SIGNAL_MAX, updatedAt: nowMs, nextInMs: 0 };
  }
  if (updated <= 0) updated = nowMs;
  const gained = Math.floor((nowMs - updated) / ORBITAL_SIGNAL_REGEN_MS);
  if (gained > 0) {
    value = Math.min(ORBITAL_SIGNAL_MAX, value + gained);
    updated += gained * ORBITAL_SIGNAL_REGEN_MS;
  }
  if (value >= ORBITAL_SIGNAL_MAX) return { value, updatedAt: updated, nextInMs: 0 };
  return { value, updatedAt: updated, nextInMs: updated + ORBITAL_SIGNAL_REGEN_MS - nowMs };
}

export function createOrbitalService({
  users = userModel,
  players = rpgPlayerModel,
  coins = rpgCoinModel,
  inventory = rpgInventoryModel,
  orbital = orbitalModel,
  finals = finalStatService,
  cards = createCardService(),
  db = sql,
} = {}) {
  const userRepo = users;
  const playerRepo = players;
  const coinRepo = coins;
  const inventoryRepo = inventory;
  const orbitalRepo = orbital;
  const finalsSvc = finals;
  const cardsSvc = cards;

  async function ensureAll(userId, client) {
    await userRepo.ensure(userId, {}, client);
    await playerRepo.ensure(userId, client);
    await coinRepo.ensure(userId, client);
    await orbitalRepo.ensure(userId, client);
  }

  async function recordOwned(userId, recordId, client) {
    return (await inventoryRepo.getQuantity(userId, recordId, client)) > 0;
  }

  return {
    async status(userId, { nowMs = Date.now() } = {}) {
      await ensureAll(userId, db);
      const row = await orbitalRepo.get(userId, db);
      const floor = Number(row?.floor ?? 1);
      const accrued = accrueSignal(
        Number(row?.signal ?? ORBITAL_SIGNAL_START),
        Number(row?.signal_updated_at ?? 0),
        nowMs
      );
      const done = floor > ORBITAL_MAX_FLOOR;
      return {
        floor,
        done,
        boss: isBossFloor(floor),
        cost: done ? 0 : costForFloor(floor),
        enemy: done ? null : enemyForFloor(floor),
        signal: accrued.value,
        signalMax: ORBITAL_SIGNAL_MAX,
        nextSignalInMs: accrued.nextInMs,
        nextRecord: done ? null : recordForFloor(floor),
      };
    },

    async enter(userId, { nowMs = Date.now(), random = Math.random } = {}) {
      await ensureAll(userId, db);

      const final = await finalsSvc.getFinalStats(userId);
      if (final.currentHp <= 0) {
        const err = new RangeError('HP kamu 0! Heal dulu sebelum Orbital Lift.');
        err.code = 'HP0';
        throw err;
      }
      const activeEffects = await cardsSvc.getActiveEffects(userId);
      const playerSkills = battleSkillsFromEffects(activeEffects);

      return db.begin(async (t) => {
        const row = await orbitalRepo.lock(userId, t);
        const floor = Number(row?.floor ?? 1);
        if (floor > ORBITAL_MAX_FLOOR) {
          const err = new RangeError('Orbital Lift sudah tamat. Tunggu season berikutnya.');
          err.code = 'COMPLETED';
          throw err;
        }
        const boss = isBossFloor(floor);
        const cost = boss ? ORBITAL_COST_BOSS : ORBITAL_COST_NORMAL;
        const accrued = accrueSignal(Number(row.signal), Number(row.signal_updated_at), nowMs);
        if (accrued.value < cost) {
          const err = new RangeError(
            `Signal kurang (punya ${accrued.value}, butuh ${cost}).`
          );
          err.code = 'NO_SIGNAL';
          throw err;
        }
        const afterSignal = accrued.value - cost;

        const enemy = enemyForFloor(floor);
        const state = createBattle({
          playerStats: {
            maxHp: final.maxHp,
            currentHp: Math.max(0, final.currentHp),
            atk: final.atk,
            def: final.def,
            critRate: final.critRate,
            critDmg: final.critDmg,
          },
          enemy,
          playerSkills,
          enemySkills: boss ? ORBITAL_ENEMY.bossSkill : null,
          battleId: `orbital:${userId}:f${floor}:${nowMs}`,
        });
        const end = simulateBattle(state, autoSkillAction, random);
        const won = end.status === 'WIN';

        await playerRepo.setCurrentHp(userId, end.player.hp, t);

        let rewards = null;
        let record = null;
        let newFloor = floor;
        if (won) {
          const coinBase = rollInt(
            ORBITAL_REWARD_NORMAL.coin.min,
            ORBITAL_REWARD_NORMAL.coin.max,
            random
          );
          const coin = boss ? coinBase * ORBITAL_REWARD_BOSS.coinMult : coinBase;
          const exp = boss
            ? ORBITAL_REWARD_NORMAL.exp * ORBITAL_REWARD_BOSS.expMult
            : ORBITAL_REWARD_NORMAL.exp;
          const cereliaRange = boss ? ORBITAL_REWARD_BOSS.cerelia : ORBITAL_REWARD_NORMAL.cerelia;
          const cerelia = rollInt(cereliaRange.min, cereliaRange.max, random);
          await coinRepo.addCoin(userId, coin, t);
          await grantPlayerExp(playerRepo, userId, exp, t);
          await inventoryRepo.add(userId, 'cerelia', cerelia, t);
          rewards = { coin, exp, cerelia };
          newFloor = floor + 1;
          if (boss) {
            const unlocked = recordForFloor(floor);
            if (unlocked && !(await recordOwned(userId, unlocked.id, t))) {
              await inventoryRepo.add(userId, unlocked.id, 1, t);
            }
            record = unlocked;
          }
        }

        await orbitalRepo.save(
          userId,
          { floor: newFloor, signal: afterSignal, signalUpdatedAt: accrued.updatedAt },
          t
        );
        return {
          won,
          draw: end.status === 'DRAW',
          floor,
          boss,
          newFloor,
          rounds: end.round,
          playerHp: end.player.hp,
          enemyHp: end.enemy.hp,
          rewards,
          record,
        };
      });
    },

    async records(userId) {
      await ensureAll(userId, db);
      const owned = [];
      for (const record of ORBITAL_RECORDS) {
        if (await recordOwned(userId, record.id, db)) owned.push(record);
      }
      return owned;
    },

    async readRecord(userId, recordId) {
      const record =
        ORBITAL_RECORDS.find(
          (entry) => entry.id === String(recordId ?? '').toLowerCase()
        ) ?? null;
      if (!record) {
        const err = new RangeError('Record tidak ditemukan.');
        err.code = 'UNKNOWN_RECORD';
        throw err;
      }
      await ensureAll(userId, db);
      if (!(await recordOwned(userId, record.id, db))) {
        const err = new RangeError('Kamu belum memiliki Record ini.');
        err.code = 'LOCKED_RECORD';
        throw err;
      }
      return record;
    },
  };
}

export const orbitalService = createOrbitalService();

export { ORBITAL_BOSS_INTERVAL, ORBITAL_MAX_FLOOR };
