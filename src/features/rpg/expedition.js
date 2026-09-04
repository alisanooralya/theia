import { sql } from '#storage/connection.js';
import {
  expeditionModel,
  walletModel,
  userModel,
} from '#storage/models/index.js';
import { F } from '#helpers/index.js';
import SETTINGS from '#environment/settings.js';

const HOUR = 60 * 60 * 1000;

/**
 * Semua angka balancing ada di sini.
 *
 * Skalanya dipatok ke aktivitas yang sudah ada supaya tidak keluar jalur:
 * work (100-5000 / 3 jam) dan crime (2k-10k / 1 jam) untuk Coin, serta
 * crime (15-40 EXP) dan domain (20-150 EXP) untuk EXP. Karena expedition
 * pasif dan tanpa risiko, hasil per jamnya sengaja di bawah keduanya.
 * Ubah `durationMs`, `coin`, atau `exp` di bawah untuk tuning.
 */
const EXPEDITION = {
  coin: {
    name: 'Coin Expedition',
    emoji: '🪙',
    label: '🪙 COIN',
    hint: 'Reward Coin',
    options: {
      short: {
        name: 'Short',
        durationMs: 1 * HOUR,
        coin: [1500, 2500],
        exp: [0, 0],
      },
      long: {
        name: 'Long',
        durationMs: 4 * HOUR,
        coin: [5000, 8000],
        exp: [0, 0],
      },
      extended: {
        name: 'Extended',
        durationMs: 8 * HOUR,
        coin: [10_000, 15_000],
        exp: [0, 0],
      },
    },
  },
  exp: {
    name: 'EXP Expedition',
    emoji: '✨',
    label: '✨ EXP',
    hint: 'Reward EXP, tanpa Coin',
    options: {
      short: {
        name: 'Short',
        durationMs: 1 * HOUR,
        coin: [0, 0],
        exp: [25, 40],
      },
      long: {
        name: 'Long',
        durationMs: 4 * HOUR,
        coin: [0, 0],
        exp: [120, 180],
      },
      extended: {
        name: 'Extended',
        durationMs: 8 * HOUR,
        coin: [0, 0],
        exp: [260, 380],
      },
    },
  },
};

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

class ExpeditionService {
  get categories() {
    return EXPEDITION;
  }

  getCategory(type) {
    if (!type) return null;
    return EXPEDITION[String(type).toLowerCase()] ?? null;
  }

  getOption(type, duration) {
    const category = this.getCategory(type);
    if (!category || !duration) return null;
    return category.options[String(duration).toLowerCase()] ?? null;
  }

  durationLabel(option) {
    const minutes = Math.round(option.durationMs / 60_000);
    return minutes % 60 === 0 ? `${minutes / 60}h` : `${minutes}m`;
  }

  rewardRange(option) {
    if (option.coin[1] > 0) {
      const min = compactCoin(option.coin[0]);
      const max = compactCoin(option.coin[1]);
      return `🪙 ${min}-${max} Coin`;
    }
    return `⭐ ${option.exp[0]}-${option.exp[1]} EXP`;
  }

  optionLine(option) {
    return `${this.durationLabel(option)} • ${this.rewardRange(option)}`;
  }

  formatClock(ms) {
    return clockFormat.format(new Date(ms));
  }

  /**
   * Status dihitung dari timestamp di database, bukan dari timer di memori,
   * jadi tetap benar walau bot sempat mati di tengah expedition.
   */
  async getState(jid) {
    const row = await expeditionModel.find(jid);
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
      option: this.getOption(row.type, row.duration),
      category: this.getCategory(row.type),
    };
  }

  async start(jid, type, duration) {
    const category = this.getCategory(type);
    const option = this.getOption(type, duration);
    if (!category || !option)
      throw new Error('Pilihan expedition tidak valid.');

    const row = await expeditionModel.start(jid, {
      type: String(type).toLowerCase(),
      duration: String(duration).toLowerCase(),
      durationSec: Math.floor(option.durationMs / 1000),
      rewardCoin: randInt(option.coin[0], option.coin[1]),
      rewardExp: randInt(option.exp[0], option.exp[1]),
    });

    if (!row)
      throw new Error(
        'Masih ada expedition yang berjalan. Cek dengan `.expedition`.'
      );

    return row;
  }

  /**
   * Penutupan baris dan pembayaran reward dijalankan dalam satu transaksi:
   * kalau salah satu gagal, expedition tetap belum terklaim.
   */
  async claim(jid) {
    const result = await sql.begin(async (t) => {
      const row = await expeditionModel.claim(jid, t);
      if (!row) return null;

      let level = { leveledUp: false, newLevel: 0 };
      const coin = Number(row.reward_coin) || 0;
      const exp = Number(row.reward_exp) || 0;

      if (coin > 0)
        await walletModel.reward(
          jid,
          coin,
          `expedition ${row.type} ${row.duration}`,
          t
        );
      if (exp > 0) level = await userModel.addExp(jid, exp, t);

      return { row, coin, exp, level };
    });

    if (!result)
      throw new Error(
        'Expedition tidak bisa diklaim. Ketik `.expedition` untuk cek status.'
      );

    return result;
  }

  formatStarted(row) {
    const category = this.getCategory(row.type);
    const option = this.getOption(row.type, row.duration);

    return [
      '🧭 *EXPEDITION DIMULAI*',
      '',
      `${category.emoji} ${category.name} • ${option.name}`,
      `⏳ Durasi: ${this.durationLabel(option)}`,
      `🏁 Selesai: ${this.formatClock(Number(row.ends_at) * 1000)}`,
      `🎁 Reward: ${this.rewardLine(row)}`,
      '',
      'Ketik `.expedition` untuk cek status.',
    ].join('\n');
  }

  formatStatus(state) {
    const { row, option, category } = state;

    return [
      '🧭 *EXPEDITION*',
      '',
      `${category.emoji} ${category.name} • ${option.name}`,
      `⏳ Durasi: ${this.durationLabel(option)}`,
      `📍 Status: ${state.finished ? 'Selesai' : 'Berjalan'}`,
      state.finished
        ? `🏁 Selesai pada: ${this.formatClock(state.endsAtMs)}`
        : `⏱️ Sisa waktu: ${F.formatDuration(state.remainingMs)}`,
      `🎁 Reward: ${this.rewardLine(row)}`,
      '',
      state.finished
        ? 'Ketik `.expedition claim` untuk mencairkan reward.'
        : 'Reward cair setelah expedition selesai.',
    ].join('\n');
  }

  formatClaim(result) {
    const { row, coin, exp, level } = result;
    const category = this.getCategory(row.type);
    const option = this.getOption(row.type, row.duration);

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
  }

  rewardLine(row) {
    const coin = Number(row.reward_coin) || 0;
    const exp = Number(row.reward_exp) || 0;
    const parts = [];
    if (coin > 0) parts.push(`🪙 ${F.formatNumber(coin)} Coin`);
    if (exp > 0) parts.push(`⭐ ${F.formatNumber(exp)} EXP`);
    return parts.join(' • ') || '-';
  }
}

export const expeditionService = new ExpeditionService();
