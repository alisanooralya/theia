/**
 * Economy 2.0 — Market service (migrated from legacy, same mechanics).
 *
 * Business logic for the virtual commodity market; commands stay thin.
 *
 * Changes vs legacy (`features/economy/market.js`):
 * - Wallet: legacy `wallets.cash` -> current `rpg_wallets.coin`, with the
 *   standard users -> rpg_players -> rpg_wallets ensure chain. No new
 *   currency; the `cash` result/UI key now carries coin.
 * - News pressure rewired: `computeNext` accepts the active-news context
 *   and feeds it through `newsPressure` (same as legacy); the news rows
 *   themselves are maintained by the news service in its own transaction.
 * - No `transactions` ledger rows (no ledger system in 2.0).
 * Everything else — price math, avg-cost accounting, partial/full sell,
 * MAX_ORDER_QTY / MAX_TRADE_VALUE guards, history display — is identical.
 */
import { sql } from '#storage/connection.js';
import { marketModel } from '../models/market.model.js';
import { userModel } from '#storage/models/user.js';
import { rpgPlayerModel } from '../../rpg/models/rpg-player.model.js';
import { rpgCoinModel } from '../../rpg/models/rpg-coin.model.js';
import {
  COMMODITIES,
  COMMODITY_IDS,
  COMMODITY_ALIASES,
  MAX_ORDER_QTY,
  MAX_TRADE_VALUE,
  HISTORY_DISPLAY,
  EVENT_MAP,
  TICK_MS,
} from '../config/market-config.js';
import {
  stepCommodity,
  rollEvent,
  readIndicators,
  readTrend,
} from '../market-engine.js';
import { newsPressure } from '../market-news-engine.js';

const money = (value) => Number(value).toLocaleString('id-ID');

export function createMarketService({
  market = marketModel,
  users = userModel,
  players = rpgPlayerModel,
  coins = rpgCoinModel,
  db = sql,
} = {}) {
  const marketRepo = market;
  const userRepo = users;
  const playerRepo = players;
  const coinRepo = coins;

  let _ready = null;

  async function ensureReady() {
    if (!_ready) {
      _ready = marketRepo.ensure().catch((err) => {
        _ready = null;
        throw err;
      });
    }
    return _ready;
  }

  async function ensureWallet(jid, pushName = '') {
    await userRepo.ensure(jid, { pushName });
    await playerRepo.ensure(jid);
    await coinRepo.ensure(jid);
  }

  function decorate(state) {
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

  function parseQuantity(raw) {
    const qty = Number.parseInt(raw, 10);
    if (!Number.isInteger(qty) || qty <= 0)
      throw new Error('Jumlah harus berupa angka bulat lebih dari 0.');
    if (qty > MAX_ORDER_QTY)
      throw new Error(`Maksimal ${money(MAX_ORDER_QTY)} unit per transaksi.`);
    return qty;
  }

  return {
    get commodities() {
      return COMMODITIES;
    },

    resolveId(input) {
      if (!input) return null;
      const key = String(input).trim().toLowerCase();
      if (COMMODITIES[key]) return key;
      if (COMMODITY_ALIASES[key]) return COMMODITY_ALIASES[key];
      const match = COMMODITY_IDS.find((id) => id.startsWith(key));
      return match ?? null;
    },

    ensureReady,

    async overview() {
      await ensureReady();
      const states = await marketRepo.all();
      return states.map((state) => decorate(state));
    },

    nextUpdateIn(nowMs = Date.now()) {
      return TICK_MS - (nowMs % TICK_MS);
    },

    async detail(commodityId) {
      await ensureReady();
      const state = await marketRepo.find(commodityId);
      if (!state) throw new Error('Komoditas tidak ditemukan.');
      const history = await marketRepo.history(commodityId);
      return { ...decorate(state), history };
    },

    computeNext(states, tickIndex, context = {}) {
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

      const activeNews = context.news ?? [];
      const next = states.map((state) => {
        const pressure = newsPressure(activeNews, state.id, tickIndex);
        const options = {
          newsBias: pressure.bias,
          newsSwing: pressure.swing,
        };
        if (targets.includes(state.id)) {
          options.newEventId = rolled.event.id;
          options.newEventTicks = rolled.ticks;
        }
        return stepCommodity(state, options);
      });

      return {
        states: next,
        events: newEvents,
        tick: tickIndex,
      };
    },

    parseQuantity,

    historyTail(history, size = HISTORY_DISPLAY) {
      if (!Array.isArray(history) || !history.length) return [];
      return history.slice(-size);
    },

    async buy(jid, commodityId, qty, { pushName = '' } = {}) {
      await ensureReady();
      const meta = COMMODITIES[commodityId];
      if (!meta) throw new Error('Komoditas tidak ditemukan.');
      const quantity = parseQuantity(qty);
      await ensureWallet(jid, pushName);

      return db.begin(async (t) => {
        const walletRows = await t`
          SELECT coin FROM rpg_wallets WHERE user_id = ${jid} FOR UPDATE
        `;
        if (!walletRows[0])
          throw new Error('Wallet belum ada. Coba `.balance`.');
        const cash = Number(walletRows[0].coin) || 0;

        const market = await marketRepo.lockPrice(commodityId, t);
        if (!market) throw new Error('Komoditas tidak ditemukan.');

        const unitPrice = market.price;
        const total = unitPrice * quantity;
        if (cash < total)
          throw new Error(
            `Coin tidak cukup. Butuh 🪙${money(total)}, punya 🪙${money(cash)}.`
          );
        if (total > MAX_TRADE_VALUE)
          throw new Error('Nilai transaksi terlalu besar. Kurangi jumlahnya.');

        const holding = await marketRepo.lockHolding(jid, commodityId, t);
        const prevQty = holding?.quantity ?? 0;
        const prevCost = holding?.total_cost ?? 0;
        const newQty = prevQty + quantity;
        const newCost = prevCost + total;

        const debited = await t`
          UPDATE rpg_wallets
          SET coin = coin - ${total},
              updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
          WHERE user_id = ${jid} AND coin >= ${total}
        `;
        if (debited.count !== 1) throw new Error('Coin tidak cukup.');

        await marketRepo.upsertHolding(jid, commodityId, newQty, newCost, t);
        await marketRepo.recordTrade(
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
    },

    async sell(jid, commodityId, qty, { pushName = '' } = {}) {
      await ensureReady();
      const meta = COMMODITIES[commodityId];
      if (!meta) throw new Error('Komoditas tidak ditemukan.');
      const quantity = parseQuantity(qty);
      await ensureWallet(jid, pushName);

      return db.begin(async (t) => {
        const walletRows = await t`
          SELECT coin FROM rpg_wallets WHERE user_id = ${jid} FOR UPDATE
        `;
        if (!walletRows[0])
          throw new Error('Wallet belum ada. Coba `.balance`.');
        const cash = Number(walletRows[0].coin) || 0;

        const market = await marketRepo.lockPrice(commodityId, t);
        if (!market) throw new Error('Komoditas tidak ditemukan.');

        const holding = await marketRepo.lockHolding(jid, commodityId, t);
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

        const avgCost = prevQty > 0 ? prevCost / prevQty : 0;
        const newQty = prevQty - quantity;
        const costOut =
          newQty === 0 ? prevCost : Math.round(avgCost * quantity);
        const newCost = Math.max(0, prevCost - costOut);
        const profit = gross - costOut;

        await marketRepo.upsertHolding(jid, commodityId, newQty, newCost, t);
        await marketRepo.addRealized(jid, commodityId, profit, t);
        await t`
          UPDATE rpg_wallets
          SET coin = coin + ${gross},
              updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
          WHERE user_id = ${jid}
        `;
        await marketRepo.recordTrade(
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
    },

    async portfolio(jid, { pushName = '' } = {}) {
      await ensureReady();
      await ensureWallet(jid, pushName);
      const holdings = await marketRepo.getPortfolio(jid);
      const wallet = await coinRepo.getWallet(jid);
      const realized = await marketRepo.realizedTotal(jid);

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
          profitPercent:
            row.total_cost > 0 ? (profit / row.total_cost) * 100 : 0,
          realized: row.realized_pl,
        };
      });

      const marketValue = items.reduce((sum, item) => sum + item.value, 0);
      const invested = items.reduce((sum, item) => sum + item.cost, 0);
      const unrealized = marketValue - invested;
      const cash = Number(wallet?.coin ?? 0);

      return {
        items,
        marketValue,
        invested,
        unrealized,
        realized,
        cash,
        totalAsset: marketValue + cash,
      };
    },
  };
}

export const marketService = createMarketService();
