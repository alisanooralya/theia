import { pvpModel } from '#features/rpg/models/pvp.model.js';
import { PVP_CONFIG } from '#features/rpg/config/pvp-config.js';
import { logger } from '#helpers/logger.js';

const REAP_INTERVAL_MS = 60_000;

export default {
  name: 'pvp-reaper',

  async init() {
    await this._run();
    this._interval = setInterval(() => this._run(), REAP_INTERVAL_MS);
  },

  destroy() {
    clearInterval(this._interval);
  },

  async _run() {
    try {
      await pvpModel.expireStale(
        Math.floor(Date.now() / 1000),
        Math.floor(PVP_CONFIG.battleTtlMs / 1000)
      );
    } catch (err) {
      logger.warn({ err }, '[PvP] reap failed');
    }
  },
};
