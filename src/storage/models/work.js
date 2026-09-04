import { sql } from '#storage/connection.js';

const nowSec = () => Math.floor(Date.now() / 1000);

class WorkModel {
  async find(jid, client = sql) {
    const rows = await client`SELECT * FROM work_sessions WHERE jid = ${jid}`;
    return rows[0] ?? null;
  }

  async findActive(jid, client = sql) {
    const rows = await client`
      SELECT * FROM work_sessions WHERE jid = ${jid} AND status = 'active'
    `;
    return rows[0] ?? null;
  }

  /**
   * Upsert bersyarat: baris hanya bisa ditimpa kalau pekerjaan sebelumnya
   * sudah tidak aktif, jadi satu user maksimal punya 1 pekerjaan jalan.
   * Mengembalikan null kalau masih ada pekerjaan aktif.
   */
  async start(jid, { job, durationSec }, client = sql) {
    const started = nowSec();
    const rows = await client`
      INSERT INTO work_sessions (
        jid, job, status, reward_coin, reward_exp,
        started_at, ends_at, claimed_at, updated_at
      )
      VALUES (
        ${jid}, ${job}, 'active', 0, 0,
        ${started}, ${started + durationSec}, 0, ${started}
      )
      ON CONFLICT (jid) DO UPDATE SET
        job = EXCLUDED.job,
        status = 'active',
        reward_coin = 0,
        reward_exp = 0,
        started_at = EXCLUDED.started_at,
        ends_at = EXCLUDED.ends_at,
        claimed_at = 0,
        updated_at = EXCLUDED.updated_at
      WHERE work_sessions.status <> 'active'
      RETURNING *
    `;
    return rows[0] ?? null;
  }

  /**
   * Reward final ditulis saat claim dalam satu statement bersyarat: hanya
   * menang kalau status masih active DAN waktunya sudah lewat, sehingga
   * reward tidak bisa cair dua kali.
   */
  async claim(jid, { rewardCoin = 0, rewardExp = 0 } = {}, client = sql) {
    const now = nowSec();
    const rows = await client`
      UPDATE work_sessions
      SET status = 'claimed',
          reward_coin = ${rewardCoin},
          reward_exp = ${rewardExp},
          claimed_at = ${now},
          updated_at = ${now}
      WHERE jid = ${jid} AND status = 'active' AND ends_at <= ${now}
      RETURNING *
    `;
    return rows[0] ?? null;
  }
}

export const workModel = new WorkModel();
