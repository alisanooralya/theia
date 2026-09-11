import { sql } from '#storage/connection.js';
import { userModel } from '#storage/models/user.js';
import { rpgPlayerModel } from '../../rpg/models/rpg-player.model.js';
import { rpgCoinModel } from '../../rpg/models/rpg-coin.model.js';
import { rpgInventoryModel } from '../../rpg/models/rpg-inventory.model.js';
import { farmModel } from '../models/farm.model.js';
import {
  FARM_DEMAND,
  FARM_DEMAND_PERIOD_MS,
  FARM_PLOT_CAPACITY,
  FARM_SEEDS_PER_PLANT,
  getFarmCrop,
  getFarmCrops,
} from '../config/farm-config.js';

function hashStr(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export function demandPeriod(nowMs = Date.now()) {
  return Math.floor(nowMs / FARM_DEMAND_PERIOD_MS);
}

export function demandFor(cropId, period) {
  const levels = Object.values(FARM_DEMAND);
  const total = levels.reduce((sum, level) => sum + level.weight, 0);
  const roll = mulberry32(hashStr(`${cropId}:${period}`))() * total;
  let acc = 0;
  for (const level of levels) {
    acc += level.weight;
    if (roll < acc) return level;
  }
  return levels[levels.length - 1];
}

export function demandNow(cropId, nowMs = Date.now()) {
  return demandFor(cropId, demandPeriod(nowMs));
}

export function demandForecast(cropId, nowMs = Date.now()) {
  return demandFor(cropId, demandPeriod(nowMs) + 1);
}

export function demandTrend(cropId, nowMs = Date.now()) {
  const period = demandPeriod(nowMs);
  const diff =
    demandFor(cropId, period).modifier - demandFor(cropId, period - 1).modifier;
  if (diff > 0) return 'UP';
  if (diff < 0) return 'DOWN';
  return 'FLAT';
}

export function priceFor(crop, demand) {
  return Math.max(1, Math.round(crop.basePrice * demand.modifier));
}

export function marketSnapshot(nowMs = Date.now()) {
  return getFarmCrops().map((crop) => {
    const demand = demandNow(crop.id, nowMs);
    return {
      crop,
      demand,
      forecast: demandForecast(crop.id, nowMs),
      trend: demandTrend(crop.id, nowMs),
      price: priceFor(crop, demand),
    };
  });
}

export function createFarmService({
  users = userModel,
  players = rpgPlayerModel,
  coins = rpgCoinModel,
  inventory = rpgInventoryModel,
  farm = farmModel,
  db = sql,
} = {}) {
  const userRepo = users;
  const playerRepo = players;
  const coinRepo = coins;
  const inventoryRepo = inventory;
  const farmRepo = farm;

  async function ensureAll(userId, client) {
    await userRepo.ensure(userId, {}, client);
    await playerRepo.ensure(userId, client);
    await coinRepo.ensure(userId, client);
    await farmRepo.ensure(userId, client);
  }

  function isEmpty(plot) {
    return !plot || !plot.crop_id || Number(plot.quantity) <= 0;
  }

  return {
    demandNow,
    demandForecast,
    demandTrend,
    priceFor,
    marketSnapshot,

    async status(userId, { nowMs = Date.now() } = {}) {
      await ensureAll(userId, db);
      const plot = await farmRepo.get(userId, db);
      const market = marketSnapshot(nowMs);
      if (isEmpty(plot)) return { plot: null, market };
      const crop = getFarmCrop(plot.crop_id);
      const mature = Number(plot.mature_at) <= nowMs;
      return {
        plot: {
          crop,
          quantity: Number(plot.quantity),
          plantedAt: Number(plot.planted_at),
          matureAt: Number(plot.mature_at),
          mature,
          remainingMs: mature ? 0 : Number(plot.mature_at) - nowMs,
        },
        market,
      };
    },

    async plant(userId, cropKey, { nowMs = Date.now() } = {}) {
      const crop = getFarmCrop(cropKey);
      if (!crop) {
        const err = new RangeError(
          `Crop tidak valid. Pilihan: ${getFarmCrops()
            .map((c) => c.aliases[0])
            .join(', ')}.`
        );
        err.code = 'INVALID_CROP';
        throw err;
      }
      await ensureAll(userId, db);
      return db.begin(async (t) => {
        const plot = await farmRepo.lock(userId, t);
        if (!isEmpty(plot)) {
          const err = new RangeError('Lahan sedang terisi. Harvest dulu.');
          err.code = 'OCCUPIED';
          throw err;
        }
        const seeds = await inventoryRepo.getQuantity(userId, crop.seedId, t);
        if (seeds < FARM_SEEDS_PER_PLANT) {
          const err = new RangeError(
            `${crop.seedName} kurang (punya ${seeds}, butuh ${FARM_SEEDS_PER_PLANT}).`
          );
          err.code = 'NO_SEEDS';
          throw err;
        }
        await inventoryRepo.remove(userId, crop.seedId, FARM_SEEDS_PER_PLANT, t);
        const matureAt = nowMs + crop.growthMs;
        await farmRepo.setPlanting(
          userId,
          {
            cropId: crop.id,
            quantity: FARM_PLOT_CAPACITY,
            plantedAt: nowMs,
            matureAt,
          },
          t
        );
        return { crop, quantity: FARM_PLOT_CAPACITY, matureAt };
      });
    },

    async harvest(userId, { nowMs = Date.now() } = {}) {
      await ensureAll(userId, db);
      return db.begin(async (t) => {
        const plot = await farmRepo.lock(userId, t);
        if (isEmpty(plot)) {
          const err = new RangeError('Lahan kosong, tidak ada yang dipanen.');
          err.code = 'EMPTY';
          throw err;
        }
        if (Number(plot.mature_at) > nowMs) {
          const err = new RangeError('Tanaman belum matang.');
          err.code = 'NOT_MATURE';
          err.remainingMs = Number(plot.mature_at) - nowMs;
          throw err;
        }
        const crop = getFarmCrop(plot.crop_id);
        const quantity = Number(plot.quantity);
        await inventoryRepo.add(userId, crop.harvestId, quantity, t);
        await farmRepo.clear(userId, t);
        return { crop, quantity, itemId: crop.harvestId };
      });
    },

    async sell(userId, cropKey, qty, { nowMs = Date.now() } = {}) {
      const crop = getFarmCrop(cropKey);
      if (!crop) {
        const err = new RangeError(
          `Crop tidak valid. Pilihan: ${getFarmCrops()
            .map((c) => c.aliases[0])
            .join(', ')}.`
        );
        err.code = 'INVALID_CROP';
        throw err;
      }
      if (!Number.isInteger(qty) || qty < 1) {
        const err = new RangeError('Quantity harus bilangan bulat >= 1.');
        err.code = 'INVALID_QTY';
        throw err;
      }
      await ensureAll(userId, db);
      const price = priceFor(crop, demandNow(crop.id, nowMs));
      return db.begin(async (t) => {
        await inventoryRepo.remove(userId, crop.harvestId, qty, t);
        await coinRepo.addCoin(userId, price * qty, t);
        return { crop, quantity: qty, price, total: price * qty };
      });
    },
  };
}

export const farmService = createFarmService();
