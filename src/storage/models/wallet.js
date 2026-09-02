import { sql } from '#storage/connection.js';

const INTEREST_RATE = 0.008;
// Batas aman catch-up (mencegah eksponen absurd kalau timestamp korup).
const MAX_INTEREST_DAYS = 365;
const WIB_OFFSET_MS = 7 * 3_600_000;
const DAY_MS = 86_400_000;

// Nomor hari kalender WIB — dipakai agar bunga reset jam 00:00 WIB.
function wibDayNumber(tsSec) {
  return Math.floor((tsSec * 1000 + WIB_OFFSET_MS) / DAY_MS);
}

function mapWallet(row) {
  if (!row) return null;
  const wallet = { ...row };
  if (wallet.last_interest_at !== null && wallet.last_interest_at !== undefined)
    wallet.last_interest_at = Number(wallet.last_interest_at);
  return wallet;
}

class WalletModel {
  async find(jid, client = sql) {
    const rows = await client`SELECT * FROM wallets WHERE jid = ${jid}`;
    return mapWallet(rows[0] ?? null);
  }

  get interestRate() {
    return INTEREST_RATE;
  }

  /**
   * Pertumbuhan saldo bank 0.8% per hari (compound), maksimal 1x per hari WIB.
   * Aman terhadap command spam & restart: patokannya kolom last_interest_at.
   */
  async accrueBankInterest(jid) {
    // Fast path: tanpa transaksi kalau belum lewat hari WIB berikutnya.
    const current = await this.find(jid);
    if (!current) return this._idleResult(0);
    const lastSeen = Number(current.last_interest_at) || 0;
    if (lastSeen > 0 && this._missedDays(lastSeen) <= 0)
      return this._idleResult(Number(current.bank) || 0);

    return sql.begin(async (t) => {
      const rows = await t`
        SELECT bank, bank_limit, last_interest_at FROM wallets WHERE jid = ${jid} FOR UPDATE
      `;
      const wallet = mapWallet(rows[0] ?? null);
      if (!wallet) return this._idleResult(0);

      const bank = Number(wallet.bank) || 0;
      const bankLimit = Number(wallet.bank_limit) || 0;
      const last = Number(wallet.last_interest_at) || 0;
      const nowSec = Math.floor(Date.now() / 1000);
      const idle = this._idleResult(bank);

      // Wallet lama/baru tanpa patokan: set baseline dulu, belum dapat bunga.
      if (last <= 0) {
        await this._stampInterest(jid, nowSec, t);
        return idle;
      }

      // Dicek ulang di dalam lock supaya request paralel tidak dobel bunga.
      const missed = this._missedDays(last);
      if (missed <= 0) return idle;

      const days = Math.min(missed, MAX_INTEREST_DAYS);
      if (bank <= 0) {
        await this._stampInterest(jid, nowSec, t);
        return { ...idle, days };
      }

      const grown = Math.floor(bank * Math.pow(1 + INTEREST_RATE, days));
      const target = Math.min(grown, bankLimit);
      const interest = Math.max(0, target - bank);
      if (interest <= 0) {
        await this._stampInterest(jid, nowSec, t);
        return { ...idle, days, capped: grown > bankLimit };
      }

      await t`
        UPDATE wallets
        SET bank = bank + ${interest},
            last_interest_at = ${nowSec},
            updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
        WHERE jid = ${jid}
      `;
      await t`
        INSERT INTO transactions (from_jid, to_jid, amount, type, note)
        VALUES ('system', ${jid}, ${interest}, 'interest', ${`bank interest ${days}d`})
      `;
      return {
        applied: true,
        days,
        interest,
        bank: bank + interest,
        capped: grown > bankLimit,
      };
    });
  }

  _idleResult(bank) {
    return { applied: false, days: 0, interest: 0, bank, capped: false };
  }

  _missedDays(lastSec) {
    return wibDayNumber(Math.floor(Date.now() / 1000)) - wibDayNumber(lastSec);
  }

  async _stampInterest(jid, nowSec, client = sql) {
    await client`
      UPDATE wallets SET last_interest_at = ${nowSec} WHERE jid = ${jid}
    `;
  }

  async upgradeBankLimit(jid, amount, client = sql) {
    await client`
      UPDATE wallets SET bank_limit = bank_limit + ${amount}, updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT WHERE jid = ${jid}
    `;
  }

  async addCash(jid, amount, client = sql) {
    const w = await this.find(jid, client);
    if (amount < 0 && w && w.cash < Math.abs(amount))
      throw new Error('Saldo cash tidak cukup');
    await client`
      UPDATE wallets SET cash = cash + ${amount}, updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT WHERE jid = ${jid}
    `;
  }

  async addBank(jid, amount, client = sql) {
    const w = await this.find(jid, client);
    if (amount < 0 && w && w.bank < Math.abs(amount))
      throw new Error('Saldo bank tidak cukup');
    await client`
      UPDATE wallets SET bank = bank + ${amount}, updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT WHERE jid = ${jid}
    `;
  }

  async reward(jid, amount, note = 'reward', client = sql) {
    await client`
      UPDATE wallets SET cash = cash + ${amount}, updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT WHERE jid = ${jid}
    `;
    await client`
      INSERT INTO transactions (from_jid, to_jid, amount, type, note) VALUES ('system', ${jid}, ${amount}, 'reward', ${note})
    `;
  }

  async transfer(fromJid, toJid, amount, note = '') {
    await sql.begin(async (t) => {
      const sender = await this.find(fromJid, t);
      if (!sender || sender.cash < amount)
        throw new Error('Saldo cash tidak cukup');
      await this.addCash(fromJid, -amount, t);
      await this.addCash(toJid, amount, t);
      await t`
        INSERT INTO transactions (from_jid, to_jid, amount, type, note) VALUES (${fromJid}, ${toJid}, ${amount}, 'transfer', ${note})
      `;
    });
  }

  async deposit(jid, amount) {
    await sql.begin(async (t) => {
      const w = await this.find(jid, t);
      if (!w || w.cash < amount) throw new Error('Saldo cash tidak cukup');
      const fee = Math.floor(amount * 0.05);
      const net = amount - fee;
      if (w.bank + net > w.bank_limit)
        throw new Error(`Limit bank terlampaui (max: ${w.bank_limit})`);
      await this.addCash(jid, -amount, t);
      await this.addBank(jid, net, t);
      await t`
        INSERT INTO transactions (from_jid, to_jid, amount, type, note)
        VALUES (${jid}, 'system', ${fee}, 'fee', ${'bank deposit admin fee'})
      `;
    });
  }

  async withdraw(jid, amount) {
    await sql.begin(async (t) => {
      const w = await this.find(jid, t);
      if (!w || w.bank < amount) throw new Error('Saldo bank tidak cukup');
      await this.addBank(jid, -amount, t);
      await this.addCash(jid, amount, t);
    });
  }

  async leaderboard(limit = 10) {
    return sql`
      SELECT w.jid, (w.cash + w.bank) as total, w.cash, w.bank, u.push_name
      FROM wallets w LEFT JOIN users u ON u.jid = w.jid
      ORDER BY total DESC LIMIT ${limit}
    `;
  }

  async history(jid, limit = 10) {
    return sql`
      SELECT * FROM transactions
      WHERE from_jid = ${jid} OR to_jid = ${jid}
      ORDER BY created_at DESC LIMIT ${limit}
    `;
  }
}

export const walletModel = new WalletModel();
