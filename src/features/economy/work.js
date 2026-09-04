import { sql } from '#storage/connection.js';
import { workModel, walletModel, userModel } from '#storage/models/index.js';
import { F } from '#helpers/index.js';
import SETTINGS from '#environment/settings.js';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const JOBS = [
  {
    id: 'ojol',
    name: 'ojol',
    label: 'Ojol',
    emoji: '🛵',
    durationMs: 30 * MINUTE,
    coin: [1900, 2400],
    exp: [8, 12],
  },
  {
    id: 'kuli',
    name: 'kuli bangunan',
    label: 'Kuli Bangunan',
    emoji: '🧱',
    durationMs: 45 * MINUTE,
    coin: [2000, 3000],
    exp: [10, 16],
  },
  {
    id: 'kebun',
    name: 'tukang kebun',
    label: 'Tukang Kebun',
    emoji: '🌱',
    durationMs: 1 * HOUR,
    coin: [2800, 3600],
    exp: [12, 18],
  },
  {
    id: 'programmer',
    name: 'programmer freelance',
    label: 'Programmer Freelance',
    emoji: '💻',
    durationMs: 1 * HOUR,
    coin: [5000, 6800],
    exp: [25, 35],
  },
  {
    id: 'guru',
    name: 'guru les',
    label: 'Guru Les',
    emoji: '📚',
    durationMs: 2 * HOUR,
    coin: [5900, 7200],
    exp: [45, 60],
  },
  {
    id: 'chef',
    name: 'chef',
    label: 'Chef',
    emoji: '👨‍🍳',
    durationMs: 3 * HOUR,
    coin: [7000, 10000],
    exp: [55, 70],
  },
];

const clockFormat = new Intl.DateTimeFormat('id-ID', {
  timeZone: SETTINGS.timezone,
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function compactCoin(value) {
  return value >= 1000 ? `${value / 1000}k` : String(value);
}

class WorkService {
  get jobs() {
    return JOBS;
  }

  getJob(id) {
    if (!id) return null;
    const key = String(id).toLowerCase();
    return JOBS.find((job) => job.id === key) ?? null;
  }

  durationLabel(job) {
    const minutes = Math.round(job.durationMs / MINUTE);
    if (minutes % 60 === 0) return `${minutes / 60} jam`;
    return `${minutes} menit`;
  }

  coinRange(job) {
    return `🪙 ${compactCoin(job.coin[0])}-${compactCoin(job.coin[1])} Coin`;
  }

  expRange(job) {
    return `⭐ ${job.exp[0]}-${job.exp[1]} EXP`;
  }

  estimateLine(job) {
    return `${this.coinRange(job)} • ${this.expRange(job)}`;
  }

  jobLine(job) {
    return `⏱️ ${this.durationLabel(job)} • ${this.estimateLine(job)}`;
  }

  formatClock(ms) {
    return clockFormat.format(new Date(ms));
  }

  async getState(jid) {
    const row = await workModel.find(jid);
    if (!row || row.status !== 'active') {
      return {
        row: row ?? null,
        active: false,
        finished: false,
        remainingMs: 0,
      };
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
      job: this.getJob(row.job),
    };
  }

  async start(jid, id) {
    const job = this.getJob(id);
    if (!job) throw new Error('Pekerjaan tidak valid.');

    const row = await workModel.start(jid, {
      job: job.id,
      durationSec: Math.floor(job.durationMs / 1000),
    });

    if (!row) throw new Error('Kamu masih bekerja. Cek dengan `.work`.');

    return row;
  }

  async claim(jid) {
    const result = await sql.begin(async (t) => {
      const current = await workModel.findActive(jid, t);
      if (!current) return null;

      const job = this.getJob(current.job);
      if (!job) return null;

      const rewardCoin = randInt(job.coin[0], job.coin[1]);
      const rewardExp = randInt(job.exp[0], job.exp[1]);

      const row = await workModel.claim(jid, { rewardCoin, rewardExp }, t);
      if (!row) return null;

      await walletModel.reward(jid, rewardCoin, `work: ${job.name}`, t);
      const level = await userModel.addExp(jid, rewardExp, t);

      return { row, job, coin: rewardCoin, exp: rewardExp, level };
    });

    if (!result) throw new Error('Belum ada pekerjaan yang bisa diklaim.');

    return result;
  }

  formatStarted(row) {
    const job = this.getJob(row.job);

    return [
      '💼 *MULAI BEKERJA*',
      `${job.emoji} ${job.label}`,
      '',
      `⏱️ Durasi: ${this.durationLabel(job)}`,
      `🏁 Selesai: ${this.formatClock(Number(row.ends_at) * 1000)}`,
      `🪙 Estimasi: ${this.coinRange(job)}`,
      `⭐ Estimasi: ${this.expRange(job)}`,
      '',
      'Ketik `.work` untuk cek status.',
    ].join('\n');
  }

  formatStatus(state) {
    const { job } = state;

    return [
      `${job.emoji} ${job.label}`,
      '',
      `📍 Status: ${state.finished ? 'Selesai' : 'Sedang bekerja'}`,
      state.finished
        ? `🏁 Selesai pada: ${this.formatClock(state.endsAtMs)}`
        : `⏱️ Sisa waktu: ${F.formatDuration(state.remainingMs)}`,
      `🪙 Estimasi: ${this.coinRange(job)}`,
      `⭐ Estimasi: ${this.expRange(job)}`,
      '',
      state.finished ?? 'Upah cair setelah pekerjaan selesai.',
    ].join('\n');
  }

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
  }
}

export const workService = new WorkService();
