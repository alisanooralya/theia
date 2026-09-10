/**
 * RPG 2.0 — Heal service (rebuilt simple per spec).
 *
 * Full heal at `coinPerHp` coin per missing HP. One transaction:
 * lock player row -> re-read current HP -> spend coin conditionally ->
 * set currentHp. Final Stats are snapshotted before the transaction
 * (internal ensures would deadlock against the row lock). Any failure
 * rolls everything back, so coin and HP can never drift apart.
 * Concurrent heals serialize on the player row lock; the second sees
 * full HP and pays nothing. No cooldown.
 */
import { sql } from '#storage/connection.js';
import { rpgPlayerModel } from '../models/rpg-player.model.js';
import { rpgCoinModel } from '../models/rpg-coin.model.js';
import { finalStatService } from './final-stat-service.js';
import { HEAL_CONFIG } from '../config/heal-config.js';

export function createHealService({
  players = rpgPlayerModel,
  coins = rpgCoinModel,
  finals = finalStatService,
  db = sql,
  config = HEAL_CONFIG,
} = {}) {
  const playerRepo = players;
  const coinRepo = coins;
  const finalsSvc = finals;
  const coinPerHp = config.coinPerHp;

  return {
    /**
     * Full heal. Returns { healed, cost, currentHp, maxHp }.
     * Throws RangeError 'full' (HP already full), 'Coin tidak cukup'
     * (insufficient funds), or 'player missing'.
     */ async heal(userId) {
      await playerRepo.ensure(userId);
      await coinRepo.ensure(userId);

      // Final Stats snapshot BEFORE the transaction: getFinalStats runs
      // ensures internally, and a nested ensure after the row lock below
      // would self-deadlock. Max HP is stable during a heal (card bonuses
      // only); current HP is re-read under the lock.
      const final = await finalsSvc.getFinalStats(userId);

      return db.begin(async (t) => {
        // Lock the player row: concurrent heals serialize here.
        await t`SELECT user_id FROM rpg_players WHERE user_id = ${userId} FOR UPDATE`;
        const rows = await t`
          SELECT current_hp FROM rpg_players WHERE user_id = ${userId}
        `;
        const currentHp = Number(rows[0]?.current_hp ?? 0);

        const missing = Math.max(0, final.maxHp - currentHp);
        if (missing <= 0) {
          const err = new RangeError('❤️ HP kamu sudah penuh.');
          err.code = 'FULL';
          throw err;
        }

        const cost = missing * coinPerHp;
        await coinRepo.spendCoin(userId, cost, t);
        await playerRepo.setCurrentHp(userId, final.maxHp, t);

        return {
          healed: missing,
          cost,
          currentHp: final.maxHp,
          maxHp: final.maxHp,
        };
      });
    },
  };
}

export const healService = createHealService();
