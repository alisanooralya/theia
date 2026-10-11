import { imperiumModel } from '#features/rpg/models/imperium.model.js';
import { weekIndexFor } from '#features/rpg/config/imperium-config.js';
import { logger } from '#helpers/logger.js';

const CHECK_INTERVAL_MS = 30 * 60 * 1000;
const RETAIN_WEEKS = 4;

export default {
  name: 'imperium-reset',

  async init() {
    await this._run();
    this._interval = setInterval(() => this._run(), CHECK_INTERVAL_MS);
  },

  destroy() {
    clearInterval(this._interval);
  },

  /**
   * Reset mingguan Imperium tidak butuh job clock: identitas minggu dihitung
   * dari timestamp, jadi restart aman. Job ini hanya membersihkan run basi
   * dan progress minggu lama supaya tabel tidak tumbuh tanpa batas.
   */
  async _run(nowMs = Date.now()) {
    try {
      const expired = await imperiumModel.expireStaleRuns(
        Math.floor(nowMs / 1000)
      );
      const weekIndex = weekIndexFor(nowMs);
      const purged = await imperiumModel.purgeOlderWeeks(
        weekIndex - RETAIN_WEEKS
      );
      if (expired || purged) {
        logger.info(
          { weekIndex, expired, purged },
          '[Imperium] Mingguan: run basi dibersihkan dan progres lama dipangkas'
        );
      }
    } catch (err) {
      logger.warn({ err }, '[Imperium] Reset mingguan gagal dijalankan');
    }
  },
};