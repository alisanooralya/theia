/**
 * Bot feature tools — expose common bot commands as agent tools.
 * Reuses existing services/models; no new dependencies.
 */
import { userModel, walletModel, cooldownModel, workModel } from '#storage/models/index.js';
import { workService } from '#features/economy/work.js';
import { F } from '#helpers/index.js';
import SETTINGS from '#environment/settings.js';

const WIB_OFFSET = 7;

function wibDayKey(tsSec) {
  const d = new Date(tsSec * 1000);
  const utc = d.getTime() + d.getTimezoneOffset() * 60_000;
  const wib = new Date(utc + WIB_OFFSET * 3_600_000);
  return wib.toISOString().slice(0, 10);
}

const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const startedAt = Date.now();

export const botFeatureTools = [
  {
    name: 'claim_daily',
    description: 'Klaim reward harian (coin + EXP). Reset setiap jam 00:00 WIB.',
    permission: 'user',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async execute(_args, ctx) {
      const user = await userModel.ensure(ctx.userId);
      const todayKey = wibDayKey(Math.floor(Date.now() / 1000));
      const lastKey = user.last_daily ? wibDayKey(user.last_daily) : null;

      if (lastKey === todayKey) {
        return {
          success: false,
          error: 'Klaim daily sudah dilakukan hari ini. Reset berikutnya jam 00:00 WIB.',
        };
      }

      const cash = randInt(5500, 6000);
      const exp = randInt(30, 50);
      const [, { leveledUp, newLevel }] = await Promise.all([
        walletModel.reward(ctx.userId, cash, 'daily reward'),
        userModel.addExp(ctx.userId, exp),
      ]);
      const streak = await userModel.recordDaily(ctx.userId);

      const lines = [
        '🎁 *Daily Reward!*',
        '',
        `🪙 +${F.formatNumber(cash)} coin`,
        `⭐ +${exp} EXP`,
        `🔥 Streak: *${streak} hari*`,
      ];
      if (leveledUp) lines.push('', `🎉 *LEVEL UP!* Level *${newLevel}*!`);

      return { success: true, message: lines.join('\n') };
    },
  },
  {
    name: 'get_balance_detail',
    description: 'Cek saldo detail: coin, bank, limit bank, total, level, EXP.',
    permission: 'user',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async execute(_args, ctx) {
      const user = await userModel.ensure(ctx.userId);
      const interest = await walletModel.accrueBankInterest(ctx.userId);
      const wallet = await walletModel.find(ctx.userId);
      const total = (wallet?.cash ?? 0) + (wallet?.bank ?? 0);
      const expForNext = await userModel.expForLevel(user.level + 1);

      return {
        success: true,
        data: {
          cash: wallet?.cash ?? 0,
          bank: wallet?.bank ?? 0,
          bankLimit: wallet?.bank_limit ?? 5_000_000,
          total,
          level: user.level,
          exp: user.exp,
          expForNext,
          interest: interest.applied
            ? { days: interest.days, amount: interest.interest, capped: interest.capped }
            : null,
        },
      };
    },
  },
  {
    name: 'start_work',
    description: 'Mulai pekerjaan. Pekerjaan tersedia: ojol, kuli, kebun, programmer, guru, chef.',
    permission: 'user',
    parameters: {
      type: 'object',
      properties: {
        job_id: {
          type: 'string',
          description: 'ID pekerjaan: ojol, kuli, kebun, programmer, guru, chef',
        },
      },
      required: ['job_id'],
      additionalProperties: false,
    },
    async execute(args, ctx) {
      const job = workService.getJob(args.job_id);
      if (!job) {
        return {
          success: false,
          error: `Pekerjaan tidak dikenal. Pilihan: ${workService.jobs.map((j) => j.id).join(', ')}`,
        };
      }

      const state = await workService.getState(ctx.userId);
      if (state.active) {
        if (state.finished) {
          return {
            success: false,
            error: 'Pekerjaan sudah selesai. Klaim dulu dengan claim_work.',
          };
        }
        return {
          success: false,
          error: `Masih bekerja sebagai ${state.job.label}. Sisa waktu: ${F.formatDuration(state.remainingMs)}.`,
        };
      }

      const row = await workService.start(ctx.userId, job.id);
      return {
        success: true,
        message: workService.formatStarted(row),
      };
    },
  },
  {
    name: 'claim_work',
    description: 'Klaim hasil pekerjaan yang sudah selesai.',
    permission: 'user',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async execute(_args, ctx) {
      const state = await workService.getState(ctx.userId);
      if (!state.active) {
        return { success: false, error: 'Tidak ada pekerjaan aktif. Mulai dengan start_work.' };
      }
      if (!state.finished) {
        return {
          success: false,
          error: `Pekerjaan belum selesai. Sisa: ${F.formatDuration(state.remainingMs)}.`,
        };
      }

      const result = await workService.claim(ctx.userId);
      return {
        success: true,
        message: workService.formatClaim(result),
      };
    },
  },
  {
    name: 'get_work_status',
    description: 'Cek status pekerjaan yang sedang aktif.',
    permission: 'user',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async execute(_args, ctx) {
      const state = await workService.getState(ctx.userId);
      if (!state.active) {
        return { success: true, data: { active: false, message: 'Tidak ada pekerjaan aktif.' } };
      }
      return {
        success: true,
        data: {
          active: true,
          job: state.job?.label ?? state.row.job,
          finished: state.finished,
          remainingMs: state.remainingMs,
          endsAt: state.endsAtMs,
        },
      };
    },
  },
  {
    name: 'list_work_jobs',
    description: 'Daftar semua pekerjaan yang tersedia beserta estimasi penghasilan.',
    permission: 'user',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async execute() {
      const jobs = workService.jobs.map((j) => ({
        id: j.id,
        label: j.label,
        emoji: j.emoji,
        duration: workService.durationLabel(j),
        coinEstimate: workService.coinRange(j),
        expEstimate: workService.expRange(j),
      }));
      return { success: true, data: jobs };
    },
  },
  {
    name: 'get_cooldowns',
    description: 'Lihat semua cooldown aktif untuk user (daily, work, dll).',
    permission: 'user',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async execute(_args, ctx) {
      const active = await cooldownModel.getByUser(ctx.userId);
      const work = await workModel.findActive(ctx.userId);
      const lines = [];

      if (work) {
        const remaining = Number(work.ends_at) * 1000 - Date.now();
        if (remaining > 0) {
          lines.push({ feature: `work (${work.job})`, remainingMs: remaining });
        }
      }

      for (const { command, remaining } of active) {
        lines.push({ feature: command, remainingMs: remaining });
      }

      return {
        success: true,
        data: {
          cooldowns: lines,
          message: lines.length === 0 ? 'Semua fitur siap digunakan.' : undefined,
        },
      };
    },
  },
  {
    name: 'get_bot_info',
    description: 'Info sistem bot: uptime, versi Node, platform, memory.',
    permission: 'user',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async execute() {
      const mem = process.memoryUsage();
      return {
        success: true,
        data: {
          name: SETTINGS.botName,
          uptime: F.formatDuration(Date.now() - startedAt),
          node: process.version,
          platform: `${process.platform} ${process.arch}`,
          heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024),
          rssMB: Math.round(mem.rss / 1024 / 1024),
        },
      };
    },
  },
  {
    name: 'check_ping',
    description: 'Cek latency response time bot.',
    permission: 'user',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    async execute() {
      const start = Date.now();
      try {
        await fetch('https://google.com', { method: 'HEAD' });
      } catch {}
      const latency = Date.now() - start;
      return {
        success: true,
        data: { latencyMs: latency, message: `Pong! ${latency} ms` },
      };
    },
  },
];
