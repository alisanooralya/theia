import { sql } from '#storage/connection.js';
import { cooldownModel } from '#storage/models/index.js';
import { logger } from '#helpers/logger.js';

export default {
  name: 'scheduler',
  _timers: [],

  init() {
    this._timers.push(
      setInterval(
        () => this._cleanupCooldowns().catch(() => {}),
        10 * 60 * 1000
      )
    );
    this._timers.push(
      setInterval(() => this._dailyStats().catch(() => {}), 24 * 60 * 60 * 1000)
    );
    this._cleanupCooldowns().catch(() => {});
    logger.info('[Scheduler] Initialized — 2 jobs');
  },

  destroy() {
    this._timers.forEach((t) => clearInterval(t));
    this._timers = [];
  },

  async _cleanupCooldowns() {
    try {
      await cooldownModel.cleanup();
    } catch (err) {
      logger.warn({ err: err.message }, '[Scheduler] Cooldown cleanup failed');
    }
  },

  async _dailyStats() {
    try {
      const userRows = await sql`SELECT COUNT(*)::int AS c FROM users`;
      const groupRows = await sql`SELECT COUNT(*)::int AS c FROM groups`;
      const txRows =
        await sql`SELECT COUNT(*)::int AS c FROM transactions WHERE created_at > (EXTRACT(EPOCH FROM NOW()))::BIGINT - 86400`;
      const users = userRows[0]?.c ?? 0;
      const groups = groupRows[0]?.c ?? 0;
      const todayTx = txRows[0]?.c ?? 0;
      logger.info(
        { users, groups, todayTransactions: todayTx },
        '[Scheduler] Daily stats'
      );
    } catch (err) {
      logger.warn({ err: err.message }, '[Scheduler] Daily stats failed');
    }
  },
};
