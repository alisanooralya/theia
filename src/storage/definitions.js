import { sql } from './connection.js';
import { logger } from '#helpers/logger.js';

const STATIC_SCHEMA = [
  `
  CREATE TABLE IF NOT EXISTS users (
    jid         TEXT    PRIMARY KEY,
    pn          TEXT    UNIQUE,
    push_name   TEXT    NOT NULL DEFAULT '',
    banned      INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT),
    updated_at  INTEGER NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT)
  )
  `,

  `
  CREATE TABLE IF NOT EXISTS groups (
    jid         TEXT    PRIMARY KEY,
    name        TEXT    NOT NULL DEFAULT '',
    welcome     INTEGER NOT NULL DEFAULT 0,
    mute        INTEGER NOT NULL DEFAULT 0,
    antitoxic   INTEGER NOT NULL DEFAULT 0,
    greeting    INTEGER NOT NULL DEFAULT 1,
    openclose   INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT),
    updated_at  INTEGER NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT)
  )
  `,

  `
  CREATE TABLE IF NOT EXISTS cooldowns (
    key         TEXT    PRIMARY KEY,
    expires_at  INTEGER NOT NULL
  )
  `,

  `
  CREATE TABLE IF NOT EXISTS bot_state (
    key         TEXT    PRIMARY KEY,
    value       TEXT    NOT NULL DEFAULT '',
    updated_at  INTEGER NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT)
  )
  `,

  `
  CREATE TABLE IF NOT EXISTS warns (
    id          BIGSERIAL PRIMARY KEY,
    jid         TEXT    NOT NULL,
    group_jid   TEXT    NOT NULL,
    reason      TEXT    NOT NULL DEFAULT '',
    damage      INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT)
  )
  `,

  // RPG 2.0 player/base-stat state. Balance defaults mirror
  // src/features/rpg/config/stats-config.js (the source of truth);
  // the model always inserts explicit values, these are a safety net.
  // current_hp is independent persistent state: no CHECK ties it to max_hp.
  `
  CREATE TABLE IF NOT EXISTS rpg_players (
    user_id     TEXT    PRIMARY KEY REFERENCES users(jid) ON DELETE CASCADE,
    level       INTEGER NOT NULL DEFAULT 1 CHECK (level >= 1),
    exp         INTEGER NOT NULL DEFAULT 0 CHECK (exp >= 0),
    max_hp      INTEGER NOT NULL DEFAULT 100 CHECK (max_hp > 0),
    current_hp  INTEGER NOT NULL DEFAULT 100 CHECK (current_hp >= 0),
    atk         INTEGER NOT NULL DEFAULT 10 CHECK (atk >= 0),
    def         INTEGER NOT NULL DEFAULT 5 CHECK (def >= 0),
    crit_rate   DOUBLE PRECISION NOT NULL DEFAULT 0.05 CHECK (crit_rate >= 0),
    crit_dmg    DOUBLE PRECISION NOT NULL DEFAULT 2.0 CHECK (crit_dmg >= 0),
    created_at  INTEGER NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT),
    updated_at  INTEGER NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT)
  )
  `,

  `CREATE INDEX IF NOT EXISTS idx_cooldowns_expires    ON cooldowns(expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_warns_jid            ON warns(jid, group_jid)`,

  // RPG 2.0 Card ownership/state. Definitions live in
  // src/features/rpg/config/card-config.js (config-first); these tables
  // store per-user state only. One copy per card id per user.
  // equipped = 1 marks the single active card of that slot per user.
  `
  CREATE TABLE IF NOT EXISTS rpg_main_cards (
    user_id     TEXT    NOT NULL REFERENCES rpg_players(user_id) ON DELETE CASCADE,
    card_id     TEXT    NOT NULL,
    level       INTEGER NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 100),
    equipped    INTEGER NOT NULL DEFAULT 0 CHECK (equipped IN (0, 1)),
    created_at  INTEGER NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT),
    updated_at  INTEGER NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT),
    UNIQUE(user_id, card_id)
  )
  `,

  `
  CREATE TABLE IF NOT EXISTS rpg_sign_cards (
    user_id     TEXT    NOT NULL REFERENCES rpg_players(user_id) ON DELETE CASCADE,
    card_id     TEXT    NOT NULL,
    level       INTEGER NOT NULL DEFAULT 1 CHECK (level BETWEEN 1 AND 50),
    equipped    INTEGER NOT NULL DEFAULT 0 CHECK (equipped IN (0, 1)),
    created_at  INTEGER NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT),
    updated_at  INTEGER NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT),
    UNIQUE(user_id, card_id)
  )
  `,

  `CREATE UNIQUE INDEX IF NOT EXISTS uq_rpg_main_cards_equipped ON rpg_main_cards(user_id) WHERE equipped = 1`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_rpg_sign_cards_equipped ON rpg_sign_cards(user_id) WHERE equipped = 1`,

  // RPG 2.0 Shop + Inventory foundation. No coin system existed outside
  // legacy reference, so this is the minimal RPG-scoped coin store
  // (same currency: coin). Generic item rows: one per (user, item).
  `
  CREATE TABLE IF NOT EXISTS rpg_wallets (
    user_id     TEXT    PRIMARY KEY REFERENCES rpg_players(user_id) ON DELETE CASCADE,
    coin        INTEGER NOT NULL DEFAULT 0 CHECK (coin >= 0),
    created_at  INTEGER NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT),
    updated_at  INTEGER NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT)
  )
  `,

  `
  CREATE TABLE IF NOT EXISTS rpg_inventory (
    user_id     TEXT    NOT NULL REFERENCES rpg_players(user_id) ON DELETE CASCADE,
    item_id     TEXT    NOT NULL CHECK (item_id <> ''),
    quantity    INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    created_at  INTEGER NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT),
    updated_at  INTEGER NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT),
    UNIQUE(user_id, item_id)
  )
  `,

  // RPG 2.0 Gacha idempotency keys. First claim wins; retries read back
  // the stored results instead of granting rewards twice.
  `
  CREATE TABLE IF NOT EXISTS rpg_gacha_requests (
    request_key TEXT    PRIMARY KEY,
    user_id     TEXT    NOT NULL REFERENCES rpg_players(user_id) ON DELETE CASCADE,
    results     TEXT    NOT NULL DEFAULT '[]',
    created_at  INTEGER NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT)
  )
  `,

  // RPG 2.0 Domain run ledger. One row per execution key: retries read
  // back the stored outcome instead of granting rewards twice.
  `
  CREATE TABLE IF NOT EXISTS rpg_domain_runs (
    request_key TEXT    PRIMARY KEY,
    user_id     TEXT    NOT NULL REFERENCES rpg_players(user_id) ON DELETE CASCADE,
    difficulty  TEXT    NOT NULL,
    status      TEXT    NOT NULL DEFAULT 'RUNNING',
    rewards     TEXT    NOT NULL DEFAULT '{}',
    created_at  INTEGER NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT)
  )
  `,
];

export async function createSchema() {
  for (const stmt of STATIC_SCHEMA) {
    await sql.unsafe(stmt);
  }
  logger.info('Schema ready');
}
