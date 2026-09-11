import { marketModel } from '#features/economy/models/market.model.js';
import { marketNewsModel } from '#features/economy/models/market-news.model.js';
import { marketService } from '#features/economy/services/market-service.js';
import { marketNewsService } from '#features/economy/services/market-news-service.js';
import { CHECK_INTERVAL_MS } from '#features/economy/config/market-config.js';
import { getSocket } from '#helpers/shutdown.js';
import { logger } from '#helpers/logger.js';

let timer = null;
let running = false;

async function runTick(nowMs = Date.now()) {
  await marketService.ensureReady();

  const newsContext = { news: await marketNewsModel.active() };
  const result = await marketModel.advance(
    (states, tickIndex) =>
      marketService.computeNext(states, tickIndex, newsContext),
    nowMs
  );

  if (result.baseline) {
    logger.info('[Market] Baseline tick tersimpan');
    return result;
  }
  if (!result.applied) return result;

  let newsReport = null;
  try {
    newsReport = await marketNewsService.maintain(result.tick);
    if (newsReport.created) {
      logger.info(
        { id: newsReport.created.id, type: newsReport.created.type },
        '[Market] Berita baru dibuat'
      );
    }
  } catch (err) {
    logger.warn({ err: err.message }, '[Market] News maintenance gagal');
  }

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

  try {
    const announced = await marketNewsService.announcePending(getSocket());
    if (announced.announced) {
      logger.info(
        { sent: announced.sent, failed: announced.failed },
        `[Market] ${announced.announced} berita diumumkan`
      );
    }
  } catch (err) {
    logger.warn({ err: err.message }, '[Market] Pengumuman berita gagal');
  }

  return { ...result, news: newsReport };
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
