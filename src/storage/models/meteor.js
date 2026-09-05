import { sql } from '#storage/connection.js';

const METEOR_NUMERIC_COLUMNS = [
  'id',
  'hp',
  'max_hp',
  'rewarded_at',
  'cleared_at',
  'created_at',
  'updated_at',
];

function mapMeteor(row) {
  if (!row) return null;
  const meteor = { ...row };
  for (const column of METEOR_NUMERIC_COLUMNS) {
    if (meteor[column] !== null && meteor[column] !== undefined) {
      meteor[column] = Number(meteor[column]);
    }
  }
  return meteor;
}

function mapContribution(row) {
  if (!row) return null;
  return {
    ...row,
    meteor_id: Number(row.meteor_id),
    damage: Number(row.damage),
    hits: Number(row.hits),
    reward_coin: Number(row.reward_coin),
    reward_exp: Number(row.reward_exp),
  };
}

class MeteorModel {
  async getActive(client = sql) {
    const rows = await client`
      SELECT * FROM meteors WHERE status = 'active' ORDER BY id DESC LIMIT 1
    `;
    return mapMeteor(rows[0] ?? null);
  }

  async getById(id, client = sql) {
    const rows = await client`SELECT * FROM meteors WHERE id = ${id}`;
    return mapMeteor(rows[0] ?? null);
  }

  async findByDayKey(dayKey, client = sql) {
    const rows = await client`SELECT * FROM meteors WHERE day_key = ${dayKey}`;
    return mapMeteor(rows[0] ?? null);
  }

  /**
   * Membuat Meteor untuk `dayKey`. Dua lapis pengaman ditegakkan oleh Postgres:
   * - UNIQUE(day_key) → maksimal satu Meteor dibuat per hari kalender.
   * - idx_meteors_single_active → maksimal satu Meteor aktif secara global,
   *   sehingga Meteor yang belum selesai memblokir pembuatan Meteor baru.
   * Mengembalikan null kalau salah satu pengaman menolak (request bersamaan).
   */
  async create(dayKey, hp, client = sql) {
    const rows = await client`
      INSERT INTO meteors (day_key, hp, max_hp, status)
      VALUES (${dayKey}, ${hp}, ${hp}, 'active')
      ON CONFLICT DO NOTHING
      RETURNING *
    `;
    return mapMeteor(rows[0] ?? null);
  }

  /**
   * Ambil Meteor aktif dengan row lock. Semua mining melewati lock ini supaya
   * damage, contribution, dan penutupan Meteor aman dari request bersamaan.
   */
  async lockActive(client = sql) {
    const rows = await client`
      SELECT * FROM meteors WHERE status = 'active' ORDER BY id DESC LIMIT 1
      FOR UPDATE
    `;
    return mapMeteor(rows[0] ?? null);
  }

  async setHp(meteorId, hp, client = sql) {
    const rows = await client`
      UPDATE meteors
      SET hp = ${hp}, updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
      WHERE id = ${meteorId} AND status = 'active'
      RETURNING *
    `;
    return mapMeteor(rows[0] ?? null);
  }

  /**
   * Menutup Meteor. Hanya menang kalau statusnya masih 'active' DAN HP sudah 0,
   * sehingga distribusi reward mustahil terjadi dua kali.
   */
  async markCleared(meteorId, client = sql) {
    const now = Math.floor(Date.now() / 1000);
    const rows = await client`
      UPDATE meteors
      SET status = 'cleared', cleared_at = ${now}, rewarded_at = ${now},
          updated_at = ${now}
      WHERE id = ${meteorId} AND status = 'active' AND hp <= 0
      RETURNING *
    `;
    return mapMeteor(rows[0] ?? null);
  }

  async addContribution(meteorId, jid, damage, client = sql) {
    const rows = await client`
      INSERT INTO meteor_contributions (meteor_id, jid, damage, hits)
      VALUES (${meteorId}, ${jid}, ${damage}, 1)
      ON CONFLICT (meteor_id, jid) DO UPDATE SET
        damage = meteor_contributions.damage + EXCLUDED.damage,
        hits = meteor_contributions.hits + 1,
        updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
      RETURNING *
    `;
    return mapContribution(rows[0] ?? null);
  }

  async getContribution(meteorId, jid, client = sql) {
    const rows = await client`
      SELECT * FROM meteor_contributions WHERE meteor_id = ${meteorId} AND jid = ${jid}
    `;
    return mapContribution(rows[0] ?? null);
  }

  async getContributions(meteorId, client = sql) {
    const rows = await client`
      SELECT * FROM meteor_contributions
      WHERE meteor_id = ${meteorId} AND damage > 0
      ORDER BY damage DESC, jid ASC
    `;
    return rows.map(mapContribution);
  }

  async countMiners(meteorId, client = sql) {
    const rows = await client`
      SELECT COUNT(*)::int AS count FROM meteor_contributions
      WHERE meteor_id = ${meteorId} AND damage > 0
    `;
    return rows[0]?.count ?? 0;
  }

  async setReward(meteorId, jid, coin, exp, client = sql) {
    await client`
      UPDATE meteor_contributions
      SET reward_coin = ${coin}, reward_exp = ${exp},
          updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
      WHERE meteor_id = ${meteorId} AND jid = ${jid}
    `;
  }

  /**
   * Ambil sisa Mining Point hari ini. Baris dengan `day_key` lama otomatis
   * dianggap 0 terpakai, jadi reset harian tidak butuh scheduler.
   */
  async getPoints(jid, dayKey, client = sql) {
    const rows = await client`
      SELECT day_key, used FROM mining_points WHERE jid = ${jid}
    `;
    const row = rows[0];
    if (!row || row.day_key !== dayKey) return 0;
    return Number(row.used);
  }

  /**
   * Konsumsi 1 Mining Point secara atomik. Klausa WHERE menolak update kalau
   * kuota hari ini sudah habis, jadi request bersamaan tidak bisa over-spend.
   * Mengembalikan jumlah point terpakai setelah update, atau null kalau gagal.
   */
  async consumePoint(jid, dayKey, maxPoints, client = sql) {
    const rows = await client`
      INSERT INTO mining_points (jid, day_key, used)
      VALUES (${jid}, ${dayKey}, 1)
      ON CONFLICT (jid) DO UPDATE SET
        day_key = ${dayKey},
        used = CASE
          WHEN mining_points.day_key <> ${dayKey} THEN 1
          ELSE mining_points.used + 1
        END,
        updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
      WHERE mining_points.day_key <> ${dayKey}
         OR mining_points.used < ${maxPoints}
      RETURNING used
    `;
    if (!rows[0]) return null;
    return Number(rows[0].used);
  }

  async refundPoint(jid, dayKey, client = sql) {
    await client`
      UPDATE mining_points
      SET used = GREATEST(0, used - 1),
          updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
      WHERE jid = ${jid} AND day_key = ${dayKey}
    `;
  }
}

export const meteorModel = new MeteorModel();
