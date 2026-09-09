/**
 * Economy 2.0 — Market scheduler extension (migrated from legacy).
 *
 * Hourly price ticks: checks every CHECK_INTERVAL_MS whether the hour
 * bucket rolled over and applies the tick (with catch-up after downtime).
 * Restart-safe: the `market_state` row lock means concurrent ticks
 * serialize and only one tick applies per bucket; the `running` guard
 * prevents overlapping runs inside this process.
 *
 * Changes vs legacy: news announcement stripped (no news system in 2.0).
 */
import { marketModel } from '#features/economy/models/market.model.js';
import { marketService } from '#features/economy/services/market-service.js';
import { CHECK_INTERVAL_MS } from '#features/economy/config/market-config.js';
import { logger } from '#helpers/logger.js';

let timer = null;
let running = false;

async function runTick(nowMs = Date.now()) {
  await marketService.ensureReady();
  const result = await marketModel.advance(
    (states, tickIndex) => marketService.computeNext(states, tickIndex),
    nowMs
  );

  if (result.baseline) {
    logger.info('[Market] Baseline tick tersimpan');
    return result;
  }
  if (!result.applied) return result;

  const summary = (result.states ?? [])
    .map((state) => {
      const prev = Number(state.prev_price) || 0;
      const pct = prev > 0 ? ((state.price - prev) / prev) * 100 : 0;
      const sign = pct >= 0 ? '+' : '';
      return `${state.id}:${state.price}(${sign}${pct.toFixed(1)}%)`;
    })
    .join(' ');

  logger.info(
    { tick: result.tick, applied: result.applied, missed: result.missed },
    `[Market] Harga diperbarui — ${summary}`
  );

  for (const event of result.events ?? []) {
    logger.info(
      { event: event.id, targets: event.targets },
      `[Market] Event ekonomi: ${event.title}`
    );
  }

  return result;
}

export { runTick };

export default {
  name: 'market-scheduler',

  async init() {
    timer = setInterval(async () => {
      if (running) return;
      running = true;
      try {
        await runTick();
      } catch (err) {
        logger.warn({ err: err.message }, '[Market] Tick gagal');
      } finally {
        running = false;
      }
    }, CHECK_INTERVAL_MS);

    runTick().catch((err) =>
      logger.warn({ err: err.message }, '[Market] Tick awal gagal')
    );

    logger.info('[Market] Initialized — harga bergerak setiap 1 jam');
  },

  destroy() {
    if (timer) clearInterval(timer);
    timer = null;
    running = false;
  },
};
