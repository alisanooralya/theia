import { sql } from '#storage/connection.js';

const nowSec = () => Math.floor(Date.now() / 1000);

class ExpeditionModel {
  async find(jid, client = sql) {
    const rows = await client`SELECT * FROM expeditions WHERE jid = ${jid}`;
    return rows[0] ?? null;
  }

  async findActive(jid, client = sql) {
    const rows = await client`
      SELECT * FROM expeditions WHERE jid = ${jid} AND status = 'active'
    `;
    return rows[0] ?? null;
  }

  /**
   * Upsert bersyarat: baris hanya boleh ditimpa kalau expedition sebelumnya
   * sudah tidak aktif, jadi satu user maksimal punya 1 expedition jalan.
   * Mengembalikan null kalau masih ada expedition aktif.
   */
  async start(
    jid,
    { type, duration, durationSec, rewardCoin = 0, rewardExp = 0 },
    client = sql
  ) {
    const started = nowSec();
    const rows = await client`
      INSERT INTO expeditions (
        jid, type, duration, status, reward_coin, reward_exp,
        started_at, ends_at, claimed_at, updated_at
      )
      VALUES (
        ${jid}, ${type}, ${duration}, 'active', ${rewardCoin}, ${rewardExp},
        ${started}, ${started + durationSec}, 0, ${started}
      )
      ON CONFLICT (jid) DO UPDATE SET
        type = EXCLUDED.type,
        duration = EXCLUDED.duration,
        status = 'active',
        reward_coin = EXCLUDED.reward_coin,
        reward_exp = EXCLUDED.reward_exp,
        started_at = EXCLUDED.started_at,
        ends_at = EXCLUDED.ends_at,
        claimed_at = 0,
        updated_at = EXCLUDED.updated_at
      WHERE expeditions.status <> 'active'
      RETURNING *
    `;
    return rows[0] ?? null;
  }

  /**
   * Menutup expedition dalam satu statement: hanya menang kalau statusnya
   * masih active DAN waktunya sudah lewat, sehingga reward tidak bisa
   * diklaim dua kali walau perintahnya dikirim beruntun.
   */
  async claim(jid, client = sql) {
    const now = nowSec();
    const rows = await client`
      UPDATE expeditions
      SET status = 'claimed', claimed_at = ${now}, updated_at = ${now}
      WHERE jid = ${jid} AND status = 'active' AND ends_at <= ${now}
      RETURNING *
    `;
    return rows[0] ?? null;
  }
}

export const expeditionModel = new ExpeditionModel();
