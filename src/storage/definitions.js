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
];

export async function createSchema() {
  for (const stmt of STATIC_SCHEMA) {
    await sql.unsafe(stmt);
  }
  logger.info('Schema ready');
}
