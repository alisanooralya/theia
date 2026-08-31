import { sql } from '#storage/connection.js';

class WalletModel {
  async find(jid, client = sql) {
    const rows = await client`SELECT * FROM wallets WHERE jid = ${jid}`;
    return rows[0] ?? null;
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
      if (w.bank + amount > w.bank_limit)
        throw new Error(`Limit bank terlampaui (max: ${w.bank_limit})`);
      await this.addCash(jid, -amount, t);
      await this.addBank(jid, amount, t);
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
