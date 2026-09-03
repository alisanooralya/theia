import { marketModel } from '#storage/models/market.js';
import { marketService } from '#features/economy/market.js';
import { CHECK_INTERVAL_MS } from '#features/economy/market-config.js';
import { logger } from '#helpers/logger.js';

/**
 * Scheduler harga Virtual Market.
 *
 * Timer hanya berperan sebagai pemicu; sumber kebenaran ada di tabel
 * market_state (bucket jam + row lock). Jadi:
 * - restart bot tidak mereset harga / history / siklus
 * - tick yang terlewat saat bot mati akan dikejar (dibatasi konfigurasi)
 * - dua timer atau dua proses tidak bisa menjalankan tick jam yang sama
 */
let timer = null;
let running = false;

async function runTick() {
  await marketService.ensureReady();
  const result = await marketModel.advance(
    (states, tickIndex) => marketService.computeNext(states, tickIndex),
    Date.now()
  );

  if (result.baseline) {
    logger.info('[Market] Baseline tick tersimpan');
    return;
  }
  if (!result.applied) return;

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
}

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

    // Sekali di awal: menutup tick yang terlewat selagi bot mati.
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
