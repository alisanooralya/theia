import { sql } from '#storage/connection.js';
import {
  COMMODITY_IDS,
  HISTORY_LIMIT,
  TICK_MS,
  MAX_CATCHUP_TICKS,
} from '#features/economy/market-config.js';
import { initialCommodityState } from '#features/economy/market-engine.js';
import { marketNewsModel } from '#storage/models/market-news.js';

const COMMODITY_NUMERIC = [
  'price',
  'prev_price',
  'phase_ticks',
  'momentum',
  'event_ticks',
  'updated_at',
];

const HOLDING_NUMERIC = ['quantity', 'total_cost', 'realized_pl', 'updated_at'];

function mapCommodity(row) {
  if (!row) return null;
  const state = { ...row };
  for (const key of COMMODITY_NUMERIC) {
    if (state[key] !== null && state[key] !== undefined)
      state[key] = Number(state[key]);
  }
  return state;
}

function mapHolding(row) {
  if (!row) return null;
  const holding = { ...row };
  for (const key of HOLDING_NUMERIC) {
    if (holding[key] !== null && holding[key] !== undefined)
      holding[key] = Number(holding[key]);
  }
  return holding;
}

function mapState(row) {
  if (!row) return null;
  return {
    tick: Number(row.tick) || 0,
    bucket: Number(row.bucket) || 0,
    last_tick_at: Number(row.last_tick_at) || 0,
  };
}

/** Bucket jam — penanda tick supaya tidak dobel setelah restart. */
export function currentBucket(nowMs = Date.now()) {
  return Math.floor(nowMs / TICK_MS);
}

class MarketModel {
  /**
   * Membuat baris state & komoditas yang belum ada. Idempoten, aman dipanggil
   * berulang kali (startup, command pertama, dsb). Harga existing tidak diubah.
   */
  async ensure(client = sql) {
    await client`
      INSERT INTO market_state (id, tick, bucket, last_tick_at)
      VALUES (1, 0, ${currentBucket()}, ${Math.floor(Date.now() / 1000)})
      ON CONFLICT (id) DO NOTHING
    `;

    for (const id of COMMODITY_IDS) {
      const seed = initialCommodityState(id);
      const inserted = await client`
        INSERT INTO market_commodities (
          id, price, prev_price, phase,
          phase_ticks, momentum, event_id, event_ticks
        )
        VALUES (
          ${id}, ${seed.price}, ${seed.prev_price}, ${seed.phase},
          ${seed.phase_ticks}, ${seed.momentum}, ${seed.event_id},
          ${seed.event_ticks}
        )
        ON CONFLICT (id) DO NOTHING
        RETURNING id
      `;
      if (inserted.length) {
        await client`
          INSERT INTO market_history (commodity_id, price, tick)
          VALUES (${id}, ${seed.price}, 0)
        `;
      }
    }
  }

  async getState(client = sql) {
    const rows = await client`SELECT * FROM market_state WHERE id = 1`;
    return mapState(rows[0] ?? null);
  }

  async all(client = sql) {
    const rows = await client`
      SELECT * FROM market_commodities
      WHERE id IN ${client(COMMODITY_IDS)}
    `;
    const byId = new Map(rows.map((row) => [row.id, mapCommodity(row)]));
    return COMMODITY_IDS.map((id) => byId.get(id)).filter(Boolean);
  }

  async find(id, client = sql) {
    const rows = await client`
      SELECT * FROM market_commodities WHERE id = ${id}
    `;
    return mapCommodity(rows[0] ?? null);
  }

  async history(id, limit = HISTORY_LIMIT, client = sql) {
    const rows = await client`
      SELECT price FROM market_history
      WHERE commodity_id = ${id}
      ORDER BY id DESC LIMIT ${limit}
    `;
    return rows.map((row) => Number(row.price)).reverse();
  }

  /**
   * Menjalankan perubahan harga dalam satu transaksi ber-lock.
   *
   * `computeNext(states, tickIndex)` adalah fungsi murni dari engine yang
   * mengembalikan state komoditas berikutnya. Lock pada market_state membuat
   * tick tidak mungkin dijalankan dua kali walau ada beberapa scheduler.
   */
  async advance(computeNext, nowMs = Date.now()) {
    const bucket = currentBucket(nowMs);

    return sql.begin(async (t) => {
      const stateRows = await t`
        SELECT * FROM market_state WHERE id = 1 FOR UPDATE
      `;
      const state = mapState(stateRows[0] ?? null);
      if (!state) return { applied: 0, skipped: true };

      // Bucket pertama kali (DB baru): jadikan baseline, jangan gerakkan harga.
      if (state.bucket <= 0) {
        await t`
          UPDATE market_state
          SET bucket = ${bucket}, last_tick_at = ${Math.floor(nowMs / 1000)}
          WHERE id = 1
        `;
        return { applied: 0, baseline: true };
      }

      const missed = bucket - state.bucket;
      if (missed <= 0) return { applied: 0, skipped: true };

      const ticks = Math.min(missed, MAX_CATCHUP_TICKS);
      const rows = await t`
        SELECT * FROM market_commodities
        WHERE id IN ${t(COMMODITY_IDS)}
        FOR UPDATE
      `;
      let states = rows.map(mapCommodity);
      const events = [];
      const historyRows = [];

      // Berita ikut dikunci di transaksi yang sama supaya lifecycle-nya
      // tidak pernah dijalankan dua kali untuk tick yang sama.
      let news = await marketNewsModel.activeForUpdate(t);
      const cooldown = await marketNewsModel.lastTicks(t);
      const createdNews = [];

      for (let i = 0; i < ticks; i++) {
        const tickIndex = state.tick + i + 1;
        const result = computeNext(states, tickIndex, {
          news,
          lastNewsTick: cooldown.any,
          lastNewsTickByType: cooldown.byType,
        });
        states = result.states;
        events.push(...(result.events ?? []));

        if (result.news) {
          createdNews.push(result.news);
          news = [...news, result.news];
          cooldown.any = tickIndex;
          cooldown.byType = {
            ...cooldown.byType,
            [result.news.type]: tickIndex,
          };
        }
        news = news.filter((item) => Number(item.expire_tick) > tickIndex);

        for (const next of states) {
          historyRows.push({
            commodity_id: next.id,
            price: next.price,
            tick: tickIndex,
          });
        }
      }

      const tick = state.tick + ticks;

      if (historyRows.length) {
        const columns = ['commodity_id', 'price', 'tick'];
        await t`INSERT INTO market_history ${t(historyRows, ...columns)}`;
      }

      for (const next of states) {
        await t`
          UPDATE market_commodities
          SET price = ${next.price}, prev_price = ${next.prev_price},
              phase = ${next.phase}, phase_ticks = ${next.phase_ticks},
              momentum = ${next.momentum}, event_id = ${next.event_id},
              event_ticks = ${next.event_ticks},
              updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
          WHERE id = ${next.id}
        `;
        await t`
          DELETE FROM market_history
          WHERE commodity_id = ${next.id}
            AND id NOT IN (
              SELECT id FROM market_history
              WHERE commodity_id = ${next.id}
              ORDER BY id DESC LIMIT ${HISTORY_LIMIT}
            )
        `;
      }

      const nowSec = Math.floor(nowMs / 1000);
      await t`
        UPDATE market_state
        SET tick = ${tick}, bucket = ${bucket}, last_tick_at = ${nowSec}
        WHERE id = 1
      `;

      // Berita disimpan lebih dulu, lalu yang masa berlakunya sudah lewat
      // langsung ditandai EXPIRED — termasuk berita hasil catch-up yang
      // sebenarnya sudah berakhir sebelum bot kembali online.
      const savedNews = [];
      for (const item of createdNews) {
        const saved = await marketNewsModel.insert(item, t);
        if (saved) savedNews.push(saved);
      }
      await marketNewsModel.expireDue(tick, t);
      await marketNewsModel.skipStale(t);

      return { applied: ticks, missed, tick, states, events, news: savedNews };
    });
  }

  async getPortfolio(jid, client = sql) {
    const rows = await client`
      SELECT p.*, c.price
      FROM market_portfolio p
      JOIN market_commodities c ON c.id = p.commodity_id
      WHERE p.jid = ${jid} AND p.quantity > 0
    `;
    const order = new Map(COMMODITY_IDS.map((id, index) => [id, index]));
    return rows
      .map((row) => ({ ...mapHolding(row), price: Number(row.price) }))
      .sort(
        (a, b) =>
          (order.get(a.commodity_id) ?? 99) - (order.get(b.commodity_id) ?? 99)
      );
  }

  async getHolding(jid, commodityId, client = sql) {
    const rows = await client`
      SELECT * FROM market_portfolio
      WHERE jid = ${jid} AND commodity_id = ${commodityId}
    `;
    return mapHolding(rows[0] ?? null);
  }

  /** Total P/L yang sudah direalisasikan, termasuk posisi yang habis. */
  async realizedTotal(jid, client = sql) {
    const rows = await client`
      SELECT COALESCE(SUM(realized_pl), 0)::BIGINT AS total
      FROM market_portfolio WHERE jid = ${jid}
    `;
    return Number(rows[0]?.total ?? 0);
  }

  /** Harga dibaca di dalam transaksi pemanggil (anti stale price). */
  async lockPrice(commodityId, client) {
    const rows = await client`
      SELECT id, price FROM market_commodities WHERE id = ${commodityId}
    `;
    if (!rows[0]) return null;
    return { id: rows[0].id, price: Number(rows[0].price) };
  }

  async lockHolding(jid, commodityId, client) {
    const rows = await client`
      SELECT * FROM market_portfolio
      WHERE jid = ${jid} AND commodity_id = ${commodityId}
      FOR UPDATE
    `;
    return mapHolding(rows[0] ?? null);
  }

  async upsertHolding(jid, commodityId, quantity, totalCost, client) {
    await client`
      INSERT INTO market_portfolio (jid, commodity_id, quantity, total_cost)
      VALUES (${jid}, ${commodityId}, ${quantity}, ${totalCost})
      ON CONFLICT (jid, commodity_id) DO UPDATE SET
        quantity = ${quantity},
        total_cost = ${totalCost},
        updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
    `;
  }

  async addRealized(jid, commodityId, profit, client) {
    await client`
      UPDATE market_portfolio
      SET realized_pl = realized_pl + ${profit},
          updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
      WHERE jid = ${jid} AND commodity_id = ${commodityId}
    `;
  }

  async recordTrade(trade, client) {
    await client`
      INSERT INTO market_trades
        (jid, commodity_id, side, quantity, unit_price, total, profit)
      VALUES (${trade.jid}, ${trade.commodityId}, ${trade.side},
              ${trade.quantity}, ${trade.unitPrice}, ${trade.total},
              ${trade.profit ?? 0})
    `;
  }

  /** Total nilai komoditas milik satu player pada harga sekarang. */
  async totalAssetValue(jid, client = sql) {
    const rows = await client`
      SELECT COALESCE(SUM(p.quantity * c.price), 0)::BIGINT AS value
      FROM market_portfolio p
      JOIN market_commodities c ON c.id = p.commodity_id
      WHERE p.jid = ${jid}
    `;
    return Number(rows[0]?.value ?? 0);
  }
}

export const marketModel = new MarketModel();
