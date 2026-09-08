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

  `CREATE INDEX IF NOT EXISTS idx_cooldowns_expires    ON cooldowns(expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_warns_jid            ON warns(jid, group_jid)`,
];

const MIGRATIONS = [
  `ALTER TABLE groups ADD COLUMN IF NOT EXISTS antitoxic INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE groups ADD COLUMN IF NOT EXISTS greeting INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE groups ADD COLUMN IF NOT EXISTS openclose INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE warns ADD COLUMN IF NOT EXISTS damage INTEGER NOT NULL DEFAULT 0`,
  `SELECT setval(pg_get_serial_sequence('warns', 'id'), COALESCE(MAX(id), 1)) FROM warns`,
];

export async function createSchema() {
  for (const stmt of STATIC_SCHEMA) {
    await sql.unsafe(stmt);
  }
  for (const stmt of MIGRATIONS) {
    try {
      await sql.unsafe(stmt);
    } catch {
      void 0;
    }
  }
  logger.info('Schema ready');
}
