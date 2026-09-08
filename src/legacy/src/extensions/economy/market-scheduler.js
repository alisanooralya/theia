import { marketModel } from '#storage/models/market.js';
import { marketService } from '#features/economy/market.js';
import { marketNewsService } from '#features/economy/market-news.js';
import { CHECK_INTERVAL_MS } from '#features/economy/market-config.js';
import { getSocket } from '#helpers/shutdown.js';
import { logger } from '#helpers/logger.js';

let timer = null;
let running = false;

async function runTick() {
  await marketService.ensureReady();
  const result = await marketModel.advance(
    (states, tickIndex, context) =>
      marketService.computeNext(states, tickIndex, context),
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

  for (const news of result.news ?? []) {
    logger.info(
      { id: news.id, type: news.type, targets: news.targets },
      `[Market] Berita baru: ${news.title}`
    );
  }
}

async function runAnnouncement() {
  const result = await marketNewsService.announcePending(getSocket());
  if (!result.announced) return;
  logger.info(
    { sent: result.sent, failed: result.failed, groups: result.groups },
    `[Market] ${result.announced} berita diumumkan`
  );
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
      }
      try {
        await runAnnouncement();
      } catch (err) {
        logger.warn({ err: err.message }, '[Market] Pengumuman berita gagal');
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
