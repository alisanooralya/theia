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
      setInterval(() => this._cleanupPremium().catch(() => {}), 60 * 60 * 1000)
    );
    this._timers.push(
      setInterval(() => this._dailyStats().catch(() => {}), 24 * 60 * 60 * 1000)
    );
    this._cleanupCooldowns().catch(() => {});
    this._cleanupPremium().catch(() => {});
    logger.info('[Scheduler] Initialized — 3 jobs');
  },

  destroy() {
    this._timers.forEach((t) => clearInterval(t));
    this._timers = [];
  },

  async _cleanupCooldowns() {
    try {
      const deleted = await cooldownModel.cleanup();
      if (deleted > 0) logger.debug(`[Scheduler] Cleaned ${deleted} cooldowns`);
    } catch (err) {
      logger.warn({ err: err.message }, '[Scheduler] Cooldown cleanup failed');
    }
  },

  async _cleanupPremium() {
    try {
      const result = await sql`
        UPDATE users SET premium = 0, premium_exp = 0, updated_at = (EXTRACT(EPOCH FROM NOW()))::BIGINT
        WHERE premium = 1 AND premium_exp > 0 AND premium_exp < (EXTRACT(EPOCH FROM NOW()))::BIGINT
      `;
      if (result.count > 0)
        logger.info(`[Scheduler] ${result.count} expired premium cleaned`);
    } catch (err) {
      logger.warn({ err: err.message }, '[Scheduler] Premium cleanup failed');
    }
  },

  async _dailyStats() {
    try {
      const userRows = await sql`SELECT COUNT(*)::int AS c FROM users`;
      const groupRows = await sql`SELECT COUNT(*)::int AS c FROM groups`;
      const premiumRows =
        await sql`SELECT COUNT(*)::int AS c FROM users WHERE premium = 1`;
      const txRows =
        await sql`SELECT COUNT(*)::int AS c FROM transactions WHERE created_at > (EXTRACT(EPOCH FROM NOW()))::BIGINT - 86400`;
      const users = userRows[0]?.c ?? 0;
      const groups = groupRows[0]?.c ?? 0;
      const premium = premiumRows[0]?.c ?? 0;
      const todayTx = txRows[0]?.c ?? 0;
      logger.info(
        { users, groups, premium, todayTransactions: todayTx },
        '[Scheduler] Daily stats'
      );
    } catch (err) {
      logger.warn({ err: err.message }, '[Scheduler] Daily stats failed');
    }
  },
};
