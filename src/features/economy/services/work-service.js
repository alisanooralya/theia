/**
 * Economy 2.0 — Work service (migrated from legacy, same flow).
 *
 * Pick a job -> session runs for the job duration -> claim rolls coin+exp
 * from the job ranges and credits both atomically with the session flip.
 * Only the single conditional-claim UPDATE wins, so concurrent claims and
 * retries grant once. EXP lands on the RPG player row (existing curve).
 */
import { sql } from '#storage/connection.js';
import { workModel } from '../models/work.model.js';
import { userModel } from '#storage/models/user.js';
import { rpgPlayerModel } from '../../rpg/models/rpg-player.model.js';
import { rpgCoinModel } from '../../rpg/models/rpg-coin.model.js';
import { grantPlayerExp } from '../../rpg/services/player-progress.js';
import { JOBS, getJob } from '../config/work-config.js';
import {
  durationLabel,
  coinRange,
  expRange,
  formatClock,
} from '../config/work-config.js';
import { F } from '#helpers/index.js';

export function randInt(min, max, random = Math.random) {
  return Math.floor(min + random() * (max - min + 1));
}

export function createWorkService({
  work = workModel,
  users = userModel,
  players = rpgPlayerModel,
  coins = rpgCoinModel,
  db = sql,
} = {}) {
  const workRepo = work;
  const userRepo = users;
  const playerRepo = players;
  const coinRepo = coins;

  async function ensureAll(userId, pushName = '') {
    await userRepo.ensure(userId, { pushName });
    await playerRepo.ensure(userId);
    await coinRepo.ensure(userId);
  }

  return {
    get jobs() {
      return JOBS;
    },

    getJob,

    async getState(userId, { pushName = '' } = {}) {
      await ensureAll(userId, pushName);
      const row = await workRepo.find(userId);
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
        job: getJob(row.job),
      };
    },

    async start(userId, jobId, { pushName = '' } = {}) {
      const job = getJob(jobId);
      if (!job) throw new Error('Pekerjaan tidak valid.');
      await ensureAll(userId, pushName);
      const row = await workRepo.start(userId, {
        job: job.id,
        durationSec: Math.floor(job.durationMs / 1000),
      });
      if (!row) throw new Error('Kamu masih bekerja. Cek dengan `.work`.');
      return row;
    },

    async claim(userId, { random = Math.random, pushName = '' } = {}) {
      await ensureAll(userId, pushName);
      const result = await db.begin(async (t) => {
        const current = await workRepo.findActive(userId, t);
        if (!current) return null;
        const job = getJob(current.job);
        if (!job) return null;
        const rewardCoin = randInt(job.coin[0], job.coin[1], random);
        const rewardExp = randInt(job.exp[0], job.exp[1], random);
        const row = await workRepo.claim(userId, { rewardCoin, rewardExp }, t);
        if (!row) return null;
        await coinRepo.addCoin(userId, rewardCoin, t);
        const level = await grantPlayerExp(playerRepo, userId, rewardExp, t);
        return { row, job, coin: rewardCoin, exp: rewardExp, level };
      });
      if (!result) throw new Error('Belum ada pekerjaan yang bisa diklaim.');
      return result;
    },

    formatStarted(row) {
      const job = getJob(row.job);
      return [
        '💼 *MULAI BEKERJA*',
        `${job.emoji} ${job.label}`,
        '',
        `⏱️ Durasi: ${durationLabel(job)}`,
        `🏁 Selesai: ${formatClock(Number(row.ends_at) * 1000)}`,
        `🪙 Estimasi: ${coinRange(job)}`,
        `⭐ Estimasi: ${expRange(job)}`,
        '',
        'Ketik `.work` untuk cek status.',
      ].join('\n');
    },

    formatStatus(state) {
      const { job } = state;
      return [
        `${job.emoji} ${job.label}`,
        '',
        `📍 Status: ${state.finished ? 'Selesai' : 'Sedang bekerja'}`,
        state.finished
          ? `🏁 Selesai pada: ${formatClock(state.endsAtMs)}`
          : `⏱️ Sisa waktu: ${F.formatDuration(state.remainingMs)}`,
        `🪙 Estimasi: ${coinRange(job)}`,
        `⭐ Estimasi: ${expRange(job)}`,
        '',
        'Upah cair setelah pekerjaan selesai.',
      ].join('\n');
    },

    formatClaim(result) {
      const { job, coin, exp, level } = result;
      const lines = [
        '💼 *KERJA SELESAI*',
        `${job.emoji} ${job.label}`,
        '',
        '🎁 Upah',
        `🪙 +${F.formatNumber(coin)} Coin`,
        `⭐ +${F.formatNumber(exp)} EXP`,
      ];
      if (level?.leveledUp)
        lines.push('', `🎉 *LEVEL UP!* Kamu sekarang level *${level.newLevel}*!`);
      return lines.join('\n');
    },
  };
}

export const workService = createWorkService();
