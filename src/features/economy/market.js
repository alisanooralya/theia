import { sql } from '#storage/connection.js';
import { marketModel } from '#storage/models/market.js';
import { walletModel } from '#storage/models/index.js';
import {
  COMMODITIES,
  COMMODITY_IDS,
  COMMODITY_ALIASES,
  MAX_ORDER_QTY,
  MAX_TRADE_VALUE,
  HISTORY_DISPLAY,
  EVENT_MAP,
  TICK_MS,
} from './market-config.js';
import {
  stepCommodity,
  rollEvent,
  readIndicators,
  readTrend,
} from './market-engine.js';

const money = (value) => Number(value).toLocaleString('id-ID');

/**
 * Virtual Market — layanan jual beli komoditas.
 * Semua transaksi player melawan sistem, harga digerakkan scheduler.
 */
class MarketService {
  constructor() {
    // Seed tabel hanya perlu dipastikan sekali per proses.
    this._ready = null;
  }

  get commodities() {
    return COMMODITIES;
  }

  /** Normalisasi input user menjadi id komoditas. */
  resolveId(input) {
    if (!input) return null;
    const key = String(input).trim().toLowerCase();
    if (COMMODITIES[key]) return key;
    if (COMMODITY_ALIASES[key]) return COMMODITY_ALIASES[key];
    const match = COMMODITY_IDS.find((id) => id.startsWith(key));
    return match ?? null;
  }

  async ensureReady() {
    if (!this._ready) {
      this._ready = marketModel.ensure().catch((err) => {
        this._ready = null;
        throw err;
      });
    }
    return this._ready;
  }

  async overview() {
    await this.ensureReady();
    const states = await marketModel.all();
    return states.map((state) => this.decorate(state));
  }

  /** Sisa waktu menuju perubahan harga berikutnya (batas bucket jam). */
  nextUpdateIn(nowMs = Date.now()) {
    return TICK_MS - (nowMs % TICK_MS);
  }

  async detail(commodityId) {
    await this.ensureReady();
    const state = await marketModel.find(commodityId);
    if (!state) throw new Error('Komoditas tidak ditemukan.');
    const history = await marketModel.history(commodityId);
    return { ...this.decorate(state), history };
  }

  decorate(state) {
    const meta = COMMODITIES[state.id];
    const prev = Number(state.prev_price) || 0;
    const price = Number(state.price) || 0;
    const changePercent = prev > 0 ? ((price - prev) / prev) * 100 : 0;
    const event = state.event_ticks > 0 ? EVENT_MAP[state.event_id] : null;
    return {
      id: state.id,
      name: meta.name,
      emoji: meta.emoji,
      character: meta.character,
      price,
      prevPrice: prev,
      changePercent,
      trend: readTrend(changePercent),
      ...readIndicators(state),
      event: event ? { ...event } : null,
    };
  }

  /**
   * Satu langkah market untuk semua komoditas (dipakai scheduler via model).
   * Fungsi murni terhadap database — hanya menghitung state berikutnya.
   */
  computeNext(states, tickIndex) {
    const activeEventIds = states
      .filter((s) => Number(s.event_ticks) > 0)
      .map((s) => s.event_id);

    const rolled = rollEvent(activeEventIds);
    const newEvents = [];
    let targets = [];

    if (rolled) {
      targets = rolled.event.targets.filter((id) => {
        const state = states.find((s) => s.id === id);
        return state && Number(state.event_ticks) <= 0;
      });
      if (targets.length)
        newEvents.push({ ...rolled.event, ticks: rolled.ticks });
    }

    const next = states.map((state) => {
      const options = targets.includes(state.id)
        ? { newEventId: rolled.event.id, newEventTicks: rolled.ticks }
        : {};
      return stepCommodity(state, options);
    });

    return { states: next, events: newEvents, tick: tickIndex };
  }

  parseQuantity(raw) {
    const qty = Number.parseInt(raw, 10);
    if (!Number.isInteger(qty) || qty <= 0)
      throw new Error('Jumlah harus berupa angka bulat lebih dari 0.');
    if (qty > MAX_ORDER_QTY)
      throw new Error(`Maksimal ${money(MAX_ORDER_QTY)} unit per transaksi.`);
    return qty;
  }

  /**
   * Beli komoditas. Coin dipotong dan average cost diperbarui dalam satu
   * transaksi database, sehingga tidak ada celah duplikasi Coin.
   */
  async buy(jid, commodityId, qty) {
    await this.ensureReady();
    const meta = COMMODITIES[commodityId];
    if (!meta) throw new Error('Komoditas tidak ditemukan.');
    const quantity = this.parseQuantity(qty);

    return sql.begin(async (t) => {
      // Lock wallet dulu supaya urutan lock konsisten (wallet -> portfolio).
      const walletRows = await t`
        SELECT cash FROM wallets WHERE jid = ${jid} FOR UPDATE
      `;
      if (!walletRows[0]) throw new Error('Wallet belum ada. Coba `.balance`.');
      const cash = Number(walletRows[0].cash) || 0;

      const market = await marketModel.lockPrice(commodityId, t);
      if (!market) throw new Error('Komoditas tidak ditemukan.');

      const unitPrice = market.price;
      const total = unitPrice * quantity;
      if (cash < total)
        throw new Error(
          `Coin tidak cukup. Butuh 🪙${money(total)}, punya 🪙${money(cash)}.`
        );
      if (total > MAX_TRADE_VALUE)
        throw new Error('Nilai transaksi terlalu besar. Kurangi jumlahnya.');

      const holding = await marketModel.lockHolding(jid, commodityId, t);
      const prevQty = holding?.quantity ?? 0;
      const prevCost = holding?.total_cost ?? 0;
      const newQty = prevQty + quantity;
      const newCost = prevCost + total;

      // Guard tambahan: kalau row tidak terupdate berarti saldo tidak cukup.
      const debited = await t`
        UPDATE wallets
        SET cash = cash - ${total},
            updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
        WHERE jid = ${jid} AND cash >= ${total}
      `;
      if (debited.count !== 1) throw new Error('Coin tidak cukup.');

      await marketModel.upsertHolding(jid, commodityId, newQty, newCost, t);
      await marketModel.recordTrade(
        {
          jid,
          commodityId,
          side: 'buy',
          quantity,
          unitPrice,
          total,
          profit: 0,
        },
        t
      );
      const note = `buy ${quantity} ${commodityId} @${unitPrice}`;
      await t`
        INSERT INTO transactions (from_jid, to_jid, amount, type, note)
        VALUES (${jid}, 'market', ${total}, 'market_buy', ${note})
      `;

      return {
        commodity: meta,
        quantity,
        unitPrice,
        total,
        heldQty: newQty,
        avgCost: Math.round(newCost / newQty),
        cashLeft: cash - total,
      };
    });
  }

  /**
   * Jual komoditas pada harga market saat ini.
   * Profit dihitung dari average cost; sisa stok mempertahankan average cost.
   */
  async sell(jid, commodityId, qty) {
    await this.ensureReady();
    const meta = COMMODITIES[commodityId];
    if (!meta) throw new Error('Komoditas tidak ditemukan.');
    const quantity = this.parseQuantity(qty);

    return sql.begin(async (t) => {
      const walletRows = await t`
        SELECT cash FROM wallets WHERE jid = ${jid} FOR UPDATE
      `;
      if (!walletRows[0]) throw new Error('Wallet belum ada. Coba `.balance`.');
      const cash = Number(walletRows[0].cash) || 0;

      const market = await marketModel.lockPrice(commodityId, t);
      if (!market) throw new Error('Komoditas tidak ditemukan.');

      const holding = await marketModel.lockHolding(jid, commodityId, t);
      const prevQty = holding?.quantity ?? 0;
      if (prevQty < quantity)
        throw new Error(
          `Stok ${meta.name} tidak cukup. Punya ${money(prevQty)} unit.`
        );

      const prevCost = holding.total_cost;
      const unitPrice = market.price;
      const gross = unitPrice * quantity;
      if (cash + gross > MAX_TRADE_VALUE)
        throw new Error(
          'Nilai jual terlalu besar. Jual sebagian dulu atau tabung Coin.'
        );

      // Average cost dipertahankan untuk sisa stok.
      const avgCost = prevQty > 0 ? prevCost / prevQty : 0;
      const newQty = prevQty - quantity;
      const costOut = newQty === 0 ? prevCost : Math.round(avgCost * quantity);
      const newCost = Math.max(0, prevCost - costOut);
      const profit = gross - costOut;

      await marketModel.upsertHolding(jid, commodityId, newQty, newCost, t);
      await marketModel.addRealized(jid, commodityId, profit, t);
      await t`
        UPDATE wallets
        SET cash = cash + ${gross},
            updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
        WHERE jid = ${jid}
      `;
      await marketModel.recordTrade(
        {
          jid,
          commodityId,
          side: 'sell',
          quantity,
          unitPrice,
          total: gross,
          profit,
        },
        t
      );
      const note = `sell ${quantity} ${commodityId} @${unitPrice}`;
      await t`
        INSERT INTO transactions (from_jid, to_jid, amount, type, note)
        VALUES ('market', ${jid}, ${gross}, 'market_sell', ${note})
      `;

      return {
        commodity: meta,
        quantity,
        unitPrice,
        gross,
        profit,
        avgCost: Math.round(avgCost),
        remaining: newQty,
        cashLeft: cash + gross,
      };
    });
  }

  /** Ringkasan aset player: qty, average cost, harga sekarang, P/L. */
  async portfolio(jid) {
    await this.ensureReady();
    const holdings = await marketModel.getPortfolio(jid);
    const wallet = await walletModel.find(jid);
    const realized = await marketModel.realizedTotal(jid);

    const items = holdings.map((row) => {
      const avgCost = row.quantity > 0 ? row.total_cost / row.quantity : 0;
      const value = row.price * row.quantity;
      const profit = value - row.total_cost;
      const meta = COMMODITIES[row.commodity_id];
      return {
        id: row.commodity_id,
        name: meta?.name ?? row.commodity_id,
        emoji: meta?.emoji ?? '📦',
        quantity: row.quantity,
        avgCost: Math.round(avgCost),
        price: row.price,
        cost: row.total_cost,
        value,
        profit,
        profitPercent: row.total_cost > 0 ? (profit / row.total_cost) * 100 : 0,
        realized: row.realized_pl,
      };
    });

    const marketValue = items.reduce((sum, item) => sum + item.value, 0);
    const invested = items.reduce((sum, item) => sum + item.cost, 0);
    const unrealized = marketValue - invested;
    const cash = Number(wallet?.cash ?? 0);

    return {
      items,
      marketValue,
      invested,
      unrealized,
      realized,
      cash,
      totalAsset: marketValue + cash,
    };
  }

  historyTail(history, size = HISTORY_DISPLAY) {
    if (!Array.isArray(history) || !history.length) return [];
    return history.slice(-size);
  }
}

export const marketService = new MarketService();
