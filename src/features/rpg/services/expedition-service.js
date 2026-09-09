/**
 * RPG 2.0 — Expedition service (migrated from legacy, same flow).
 *
 * Pick a track + duration -> rewards are rolled ONCE at start and stored
 * -> claim pays out exactly the stored amounts. Coin goes to the existing
 * wallet, EXP to the RPG player row (existing curve), both atomically with
 * the session flip in one transaction.
 *
 * Dropped vs legacy: the card coin-bonus multiplier
 * (`cardService.coinRewardTotal`) — the 2.0 card system has no income-bonus
 * concept, and inventing one is out of scope. Stored coin pays out as-is.
 */
import { sql } from '#storage/connection.js';
import { expeditionModel } from '../models/expedition.model.js';
import { userModel } from '#storage/models/user.js';
import { rpgPlayerModel } from '../models/rpg-player.model.js';
import { rpgCoinModel } from '../models/rpg-coin.model.js';
import { grantPlayerExp } from './player-progress.js';
import {
  EXPEDITIONS,
  getCategory,
  getOption,
  durationLabel,
  formatClock,
} from '../config/expedition-config.js';
import { F } from '#helpers/index.js';

export function randInt(min, max, random = Math.random) {
  return Math.floor(min + random() * (max - min + 1));
}

export function rewardLine(row) {
  const coin = Number(row.reward_coin) || 0;
  const exp = Number(row.reward_exp) || 0;
  const parts = [];
  if (coin > 0) parts.push(`🪙 ${F.formatNumber(coin)} Coin`);
  if (exp > 0) parts.push(`⭐ ${F.formatNumber(exp)} EXP`);
  return parts.join(' • ') || '-';
}

export function createExpeditionService({
  expeditions = expeditionModel,
  users = userModel,
  players = rpgPlayerModel,
  coins = rpgCoinModel,
  db = sql,
} = {}) {
  const expeditionRepo = expeditions;
  const userRepo = users;
  const playerRepo = players;
  const coinRepo = coins;

  async function ensureAll(userId, pushName = '') {
    await userRepo.ensure(userId, { pushName });
    await playerRepo.ensure(userId);
    await coinRepo.ensure(userId);
  }

  return {
    get categories() {
      return EXPEDITIONS;
    },

    getCategory,
    getOption,

    async getState(userId, { pushName = '' } = {}) {
      await ensureAll(userId, pushName);
      const row = await expeditionRepo.find(userId);
      if (!row || row.status !== 'active') {
        return { row: row ?? null, active: false, finished: false, remainingMs: 0 };
      }
      const endsAtMs = Number(row.ends_at) * 1000;
      const remainingMs = endsAtMs - Date.now();
      return {
        row,
        active: true,
        finished: remainingMs <= 0,
        remainingMs: Math.max(0, remainingMs),
        startedAtMs: Number(row.started_at) * 1000,
        endsAtMs,
        option: getOption(row.type, row.duration),
        category: getCategory(row.type),
      };
    },

    async start(userId, type, duration, { random = Math.random, pushName = '' } = {}) {
      const category = getCategory(type);
      const option = getOption(type, duration);
      if (!category || !option)
        throw new Error('Pilihan expedition tidak valid.');
      await ensureAll(userId, pushName);
      const row = await expeditionRepo.start(userId, {
        type: String(type).toLowerCase(),
        duration: String(duration).toLowerCase(),
        durationSec: Math.floor(option.durationMs / 1000),
        rewardCoin: randInt(option.coin[0], option.coin[1], random),
        rewardExp: randInt(option.exp[0], option.exp[1], random),
      });
      if (!row)
        throw new Error(
          'Masih ada expedition yang berjalan. Cek dengan `.expedition`.'
        );
      return row;
    },

    async claim(userId, { pushName = '' } = {}) {
      await ensureAll(userId, pushName);
      const result = await db.begin(async (t) => {
        const row = await expeditionRepo.claim(userId, t);
        if (!row) return null;
        const coin = Number(row.reward_coin) || 0;
        const exp = Number(row.reward_exp) || 0;
        if (coin > 0) await coinRepo.addCoin(userId, coin, t);
        let level = { leveledUp: false, newLevel: 0 };
        if (exp > 0) level = await grantPlayerExp(playerRepo, userId, exp, t);
        return { row, coin, exp, level };
      });
      if (!result)
        throw new Error(
          'Expedition tidak bisa diklaim. Ketik `.expedition` untuk cek status.'
        );
      return result;
    },

    formatStarted(row) {
      const category = getCategory(row.type);
      const option = getOption(row.type, row.duration);
      return [
        `${category.emoji} ${category.name} • ${option.name}`,
        '',
        `⏳ Durasi: ${durationLabel(option)}`,
        `🏁 Selesai: ${formatClock(Number(row.ends_at) * 1000)}`,
        `🎁 Reward: ${rewardLine(row)}`,
        '',
        'Ketik `.expedition` untuk cek status.',
      ].join('\n');
    },

    formatStatus(state) {
      const { row, option, category } = state;
      return [
        `${category.emoji} ${category.name} • ${option.name}`,
        '',
        `⏳ Durasi: ${durationLabel(option)}`,
        `📍 Status: ${state.finished ? 'Selesai' : 'Berjalan'}`,
        state.finished
          ? `🏁 Selesai pada: ${formatClock(state.endsAtMs)}`
          : `⏱️ Sisa waktu: ${F.formatDuration(state.remainingMs)}`,
        `🎁 Reward: ${rewardLine(row)}`,
        '',
        'Reward cair setelah expedition selesai.',
      ].join('\n');
    },

    formatClaim(result) {
      const { row, coin, exp, level } = result;
      const category = getCategory(row.type);
      const option = getOption(row.type, row.duration);
      const lines = [
        '🧭 *EXPEDITION CLAIMED*',
        '',
        `${category.emoji} ${category.name} • ${option.name}`,
        '',
        '🎁 Reward',
      ];
      if (coin > 0) lines.push(`🪙 +${F.formatNumber(coin)} Coin`);
      if (exp > 0) lines.push(`⭐ +${F.formatNumber(exp)} EXP`);
      if (level.leveledUp)
        lines.push('', `🎉 *LEVEL UP!* Kamu sekarang level *${level.newLevel}*!`);
      return lines.join('\n');
    },
  };
}

export const expeditionService = createExpeditionService();
