import { db } from '#storage/connection.js'
import { logger } from '#helpers/logger.js'

let interval = null

export default {
  name: 'bank-interest',
  async init() {
    interval = setInterval(() => {
      try {
        const res = db.prepare(`
          UPDATE wallets SET bank = MIN(bank + CAST(bank * 0.01 AS INTEGER), bank_limit),
          updated_at = unixepoch() WHERE bank > 0
        `).run()
        if (res.changes > 0) logger.info(`[BankInterest] Applied 1% to ${res.changes} wallets`)
      } catch (err) {
        logger.warn({ err: err.message }, '[BankInterest] failed')
      }
    }, 24 * 60 * 60 * 1000)
    logger.info('[BankInterest] Initialized — 1% daily')
  },
  async destroy() {
    if (interval) clearInterval(interval)
    interval = null
  },
}
