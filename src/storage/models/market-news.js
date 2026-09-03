import { sql } from '#storage/connection.js';
import { TICK_MS } from '#features/economy/market-config.js';
import { NEWS_FEED_LIMIT } from '#features/economy/market-news-config.js';

const NUMERIC = [
  'start_tick',
  'expire_tick',
  'announced_at',
  'created_at',
  'expires_at',
];

function safeParse(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function mapNews(row) {
  if (!row) return null;
  const news = { ...row };
  for (const key of NUMERIC) {
    if (news[key] !== null && news[key] !== undefined)
      news[key] = Number(news[key]);
  }
  news.targets = news.affected_commodities
    ? String(news.affected_commodities).split(',').filter(Boolean)
    : [];
  news.impact = safeParse(news.hidden_impact);
  return news;
}

/**
 * Penyimpanan Market News.
 *
 * Semua berita bersifat global (satu berita untuk seluruh bot). Pengiriman ke
 * grup dijaga kolom announce_status supaya tidak pernah terkirim dua kali,
 * termasuk saat ada dua timer atau bot baru direstart.
 */
class MarketNewsModel {
  /** Berita yang masih berlaku, dibaca di dalam transaksi tick. */
  async activeForUpdate(client) {
    const rows = await client`
      SELECT * FROM market_news WHERE status = 'ACTIVE' ORDER BY id
      FOR UPDATE
    `;
    return rows.map(mapNews);
  }

  async active(client = sql) {
    const rows = await client`
      SELECT * FROM market_news WHERE status = 'ACTIVE' ORDER BY id
    `;
    return rows.map(mapNews);
  }

  /** Tick berita terakhir per tipe — dipakai engine untuk cooldown. */
  async lastTicks(client = sql) {
    const rows = await client`
      SELECT type, MAX(start_tick)::BIGINT AS tick
      FROM market_news GROUP BY type
    `;
    const byType = {};
    let any = 0;
    for (const row of rows) {
      const tick = Number(row.tick) || 0;
      byType[row.type] = tick;
      if (tick > any) any = tick;
    }
    return { any, byType };
  }

  /**
   * Simpan berita baru. news_key unik, jadi proses ganda tidak bisa
   * menghasilkan berita kembar walau dipanggil bersamaan.
   */
  async insert(news, client = sql) {
    const nowSec = Math.floor(Date.now() / 1000);
    const lifetimeSec = Math.round(
      ((news.impact?.total ?? 0) * TICK_MS) / 1000
    );
    const rows = await client`
      INSERT INTO market_news (
        news_key, type, template_id, title, message,
        affected_commodities, hidden_outcome, hidden_impact,
        status, announce_status, start_tick, expire_tick,
        created_at, expires_at
      )
      VALUES (
        ${news.news_key}, ${news.type}, ${news.template_id ?? ''},
        ${news.title ?? ''}, ${news.message},
        ${(news.targets ?? []).join(',')}, ${news.hidden_outcome},
        ${JSON.stringify(news.impact ?? {})},
        'ACTIVE', 'PENDING', ${news.start_tick}, ${news.expire_tick},
        ${nowSec}, ${nowSec + lifetimeSec}
      )
      ON CONFLICT (news_key) DO NOTHING
      RETURNING *
    `;
    return mapNews(rows[0] ?? null);
  }

  /** Berita yang masa berlakunya habis berhenti memengaruhi market. */
  async expireDue(tick, client = sql) {
    const result = await client`
      UPDATE market_news SET status = 'EXPIRED'
      WHERE status = 'ACTIVE' AND expire_tick <= ${tick}
    `;
    return result.count ?? 0;
  }

  /** Berita yang belum sempat diumumkan tapi sudah kedaluwarsa dilewati. */
  async skipStale(client = sql) {
    const result = await client`
      UPDATE market_news SET announce_status = 'SKIPPED'
      WHERE announce_status = 'PENDING' AND status <> 'ACTIVE'
    `;
    return result.count ?? 0;
  }

  async pendingAnnouncements(limit = 1, client = sql) {
    const rows = await client`
      SELECT * FROM market_news
      WHERE status = 'ACTIVE' AND announce_status = 'PENDING'
      ORDER BY id LIMIT ${limit}
    `;
    return rows.map(mapNews);
  }

  /**
   * Klaim hak kirim satu berita. Hanya satu pemanggil yang bisa berhasil,
   * sehingga pengumuman tidak pernah dobel.
   */
  async claimAnnouncement(id, client = sql) {
    const rows = await client`
      UPDATE market_news
      SET announce_status = 'SENT',
          announced_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
      WHERE id = ${id} AND announce_status = 'PENDING'
      RETURNING id
    `;
    return rows.length === 1;
  }

  async markSkipped(id, client = sql) {
    await client`
      UPDATE market_news SET announce_status = 'SKIPPED'
      WHERE id = ${id} AND announce_status = 'PENDING'
    `;
  }

  /** Berita terbaru untuk `.market news` (aktif maupun yang baru berakhir). */
  async recent(limit = NEWS_FEED_LIMIT, client = sql) {
    const rows = await client`
      SELECT * FROM market_news
      WHERE announce_status <> 'SKIPPED'
      ORDER BY id DESC LIMIT ${limit}
    `;
    return rows.map(mapNews);
  }

  async find(id, client = sql) {
    const rows = await client`SELECT * FROM market_news WHERE id = ${id}`;
    return mapNews(rows[0] ?? null);
  }
}

export const marketNewsModel = new MarketNewsModel();
