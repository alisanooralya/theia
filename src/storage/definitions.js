import { sql } from './connection.js';
import { logger } from '#helpers/logger.js';

const STATIC_SCHEMA = [
  `
  CREATE TABLE IF NOT EXISTS users (
    jid         TEXT    PRIMARY KEY,
    pn          TEXT    UNIQUE,
    push_name   TEXT    NOT NULL DEFAULT '',
    level       INTEGER NOT NULL DEFAULT 1,
    exp         INTEGER NOT NULL DEFAULT 0,
    premium     INTEGER NOT NULL DEFAULT 0,
    premium_exp INTEGER NOT NULL DEFAULT 0,
    banned      INTEGER NOT NULL DEFAULT 0,
    daily_streak INTEGER NOT NULL DEFAULT 0,
    last_daily  INTEGER NOT NULL DEFAULT 0,
    bank_upgrade_count INTEGER NOT NULL DEFAULT 0,
    prison_until    INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT),
    updated_at  INTEGER NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT)
  )
  `,

  `
  CREATE TABLE IF NOT EXISTS wallets (
    jid         TEXT    PRIMARY KEY REFERENCES users(jid) ON DELETE CASCADE,
    cash        INTEGER NOT NULL DEFAULT 0,
    bank        INTEGER NOT NULL DEFAULT 0,
    bank_limit  INTEGER NOT NULL DEFAULT 1000000,
    updated_at  INTEGER NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT)
  )
  `,

  `
  CREATE TABLE IF NOT EXISTS stats (
    jid         TEXT    PRIMARY KEY REFERENCES users(jid) ON DELETE CASCADE,
    hp          INTEGER NOT NULL DEFAULT 1200,
    max_hp      INTEGER NOT NULL DEFAULT 1200,
    atk         INTEGER NOT NULL DEFAULT 30,
    def         INTEGER NOT NULL DEFAULT 20,
    spd         INTEGER NOT NULL DEFAULT 10,
    weapon_id   TEXT,
    armor_id    TEXT,
    win         INTEGER NOT NULL DEFAULT 0,
    loss        INTEGER NOT NULL DEFAULT 0,
    win_streak  INTEGER NOT NULL DEFAULT 0,
    buff_atk    INTEGER NOT NULL DEFAULT 0,
    buff_def    INTEGER NOT NULL DEFAULT 0,
    buff_expire INTEGER NOT NULL DEFAULT 0,
    buff_exp_mult INTEGER NOT NULL DEFAULT 1,
    crit_rate    INTEGER NOT NULL DEFAULT 5,
    updated_at  INTEGER NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT)
  )
  `,

  `
  CREATE TABLE IF NOT EXISTS items (
    id          TEXT    PRIMARY KEY,
    name        TEXT    NOT NULL,
    description TEXT    NOT NULL DEFAULT '',
    category    TEXT    NOT NULL DEFAULT 'misc',
    price       INTEGER NOT NULL DEFAULT 0,
    sellable    INTEGER NOT NULL DEFAULT 1,
    stackable   INTEGER NOT NULL DEFAULT 1,
    rarity      TEXT    NOT NULL DEFAULT 'common',
    data        TEXT    NOT NULL DEFAULT '{}'
  )
  `,

  `
  CREATE TABLE IF NOT EXISTS inventories (
    id          BIGSERIAL PRIMARY KEY,
    jid         TEXT    NOT NULL REFERENCES users(jid) ON DELETE CASCADE,
    item_id     TEXT    NOT NULL REFERENCES items(id),
    quantity    INTEGER NOT NULL DEFAULT 1,
    data        TEXT    NOT NULL DEFAULT '{}',
    created_at  INTEGER NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT),
    UNIQUE(jid, item_id)
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
    raid        INTEGER NOT NULL DEFAULT 0,
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
  CREATE TABLE IF NOT EXISTS transactions (
    id          BIGSERIAL PRIMARY KEY,
    from_jid    TEXT    NOT NULL,
    to_jid      TEXT,
    amount      INTEGER NOT NULL,
    type        TEXT    NOT NULL,
    note        TEXT    NOT NULL DEFAULT '',
    created_at  INTEGER NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT)
  )
  `,

  `
  CREATE TABLE IF NOT EXISTS afk (
    jid         TEXT    PRIMARY KEY,
    reason      TEXT    NOT NULL DEFAULT '',
    started_at  INTEGER NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT)
  )
  `,

  `
  CREATE TABLE IF NOT EXISTS redeem_codes (
    code        TEXT    PRIMARY KEY,
    amount      INTEGER NOT NULL,
    expires_at  BIGINT  NOT NULL
  )
  `,

  `
  CREATE TABLE IF NOT EXISTS redeem_code_users (
    code        TEXT    NOT NULL REFERENCES redeem_codes(code) ON DELETE CASCADE,
    jid         TEXT    NOT NULL,
    used_at     INTEGER NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT),
    PRIMARY KEY (code, jid)
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

  `
  CREATE TABLE IF NOT EXISTS group_activity (
    jid           TEXT    NOT NULL,
    user_jid      TEXT    NOT NULL,
    xp            INTEGER NOT NULL DEFAULT 0,
    level         INTEGER NOT NULL DEFAULT 1,
    message_count INTEGER NOT NULL DEFAULT 0,
    updated_at    INTEGER NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT),
    PRIMARY KEY (jid, user_jid)
  )
  `,

  `
  CREATE TABLE IF NOT EXISTS divergent_runs (
    jid         TEXT    PRIMARY KEY REFERENCES users(jid) ON DELETE CASCADE,
    chat_jid    TEXT,
    status      TEXT    NOT NULL DEFAULT 'active',
    state       TEXT    NOT NULL DEFAULT '{}',
    revision    INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT),
    updated_at  INTEGER NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT)
  )
  `,

  `
  CREATE TABLE IF NOT EXISTS divergent_usage (
    jid          TEXT    PRIMARY KEY REFERENCES users(jid) ON DELETE CASCADE,
    daily_key    TEXT    NOT NULL DEFAULT '',
    daily_count  INTEGER NOT NULL DEFAULT 0,
    weekly_key   TEXT    NOT NULL DEFAULT '',
    weekly_count INTEGER NOT NULL DEFAULT 0,
    updated_at   INTEGER NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT)
  )
  `,

  `
  CREATE TABLE IF NOT EXISTS relics (
    id          BIGSERIAL PRIMARY KEY,
    owner_jid   TEXT    NOT NULL REFERENCES users(jid) ON DELETE CASCADE,
    slot        TEXT    NOT NULL CHECK(slot IN ('head', 'hands', 'body', 'feet')),
    main_stat   TEXT    NOT NULL,
    main_value  INTEGER NOT NULL DEFAULT 0,
    substats    TEXT    NOT NULL DEFAULT '[]',
    level       INTEGER NOT NULL DEFAULT 1,
    created_at  INTEGER NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT),
    updated_at  INTEGER NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT)
  )
  `,

  `
  CREATE TABLE IF NOT EXISTS relic_inventory (
    jid         TEXT    PRIMARY KEY REFERENCES users(jid) ON DELETE CASCADE,
    head_id     INTEGER REFERENCES relics(id) ON DELETE SET NULL,
    hands_id    INTEGER REFERENCES relics(id) ON DELETE SET NULL,
    body_id     INTEGER REFERENCES relics(id) ON DELETE SET NULL,
    feet_id     INTEGER REFERENCES relics(id) ON DELETE SET NULL,
    updated_at  INTEGER NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT)
  )
  `,

  `
  CREATE TABLE IF NOT EXISTS artifacts (
    id          BIGSERIAL PRIMARY KEY,
    owner_jid   TEXT    NOT NULL REFERENCES users(jid) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL DEFAULT 1,
    name        TEXT    NOT NULL DEFAULT '',
    slot        TEXT    NOT NULL CHECK(slot IN ('flower', 'feather', 'sands', 'goblet', 'circlet')),
    level       INTEGER NOT NULL DEFAULT 1,
    main_stat   TEXT    NOT NULL,
    main_value  INTEGER NOT NULL DEFAULT 0,
    substats    TEXT    NOT NULL DEFAULT '{}',
    created_at  INTEGER NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT),
    updated_at  INTEGER NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT),
    UNIQUE(owner_jid, user_id)
  )
  `,

  `
  CREATE TABLE IF NOT EXISTS artifact_inventory (
    jid         TEXT    PRIMARY KEY REFERENCES users(jid) ON DELETE CASCADE,
    flower_id   INTEGER REFERENCES artifacts(id) ON DELETE SET NULL,
    feather_id  INTEGER REFERENCES artifacts(id) ON DELETE SET NULL,
    sands_id    INTEGER REFERENCES artifacts(id) ON DELETE SET NULL,
    goblet_id   INTEGER REFERENCES artifacts(id) ON DELETE SET NULL,
    circlet_id  INTEGER REFERENCES artifacts(id) ON DELETE SET NULL,
    updated_at  INTEGER NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT)
  )
  `,

  `
  CREATE TABLE IF NOT EXISTS raids (
    id          BIGSERIAL PRIMARY KEY,
    boss_name   TEXT    NOT NULL DEFAULT 'Raid Boss',
    boss_hp     INTEGER NOT NULL DEFAULT 500000,
    boss_max_hp INTEGER NOT NULL DEFAULT 500000,
    status      TEXT    NOT NULL DEFAULT 'pending',
    start_at    BIGINT NOT NULL DEFAULT 0,
    end_at      BIGINT NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT),
    updated_at  INTEGER NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT)
  )
  `,

  `
  CREATE TABLE IF NOT EXISTS raid_participants (
    id          BIGSERIAL PRIMARY KEY,
    raid_id     INTEGER NOT NULL REFERENCES raids(id) ON DELETE CASCADE,
    jid         TEXT    NOT NULL REFERENCES users(jid) ON DELETE CASCADE,
    hp          INTEGER NOT NULL DEFAULT 2400,
    max_hp      INTEGER NOT NULL DEFAULT 2400,
    damage      INTEGER NOT NULL DEFAULT 0,
    status      TEXT    NOT NULL DEFAULT 'active',
    breaktime_until BIGINT NOT NULL DEFAULT 0,
    reward_claimed INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT),
    updated_at  INTEGER NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT),
    UNIQUE(raid_id, jid)
  )
  `,

  `CREATE INDEX IF NOT EXISTS idx_artifacts_owner      ON artifacts(owner_jid)`,
  `CREATE INDEX IF NOT EXISTS idx_artifacts_slot       ON artifacts(owner_jid, slot)`,
  `CREATE INDEX IF NOT EXISTS idx_relics_owner      ON relics(owner_jid)`,
  `CREATE INDEX IF NOT EXISTS idx_relics_slot       ON relics(owner_jid, slot)`,
  `CREATE INDEX IF NOT EXISTS idx_inventories_jid      ON inventories(jid)`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_from    ON transactions(from_jid)`,
  `CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at)`,
  `CREATE INDEX IF NOT EXISTS idx_cooldowns_expires    ON cooldowns(expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_users_level          ON users(level DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_redeem_codes_expiry  ON redeem_codes(expires_at)`,
  `CREATE INDEX IF NOT EXISTS idx_warns_jid            ON warns(jid, group_jid)`,
  `CREATE INDEX IF NOT EXISTS idx_group_activity_jid  ON group_activity(jid, xp DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_group_activity_user ON group_activity(user_jid)`,
  `CREATE INDEX IF NOT EXISTS idx_divergent_runs_status ON divergent_runs(status)`,
];

// Migration statements, applied on every startup (idempotent).
const MIGRATIONS = [
  `ALTER TABLE stats ADD COLUMN IF NOT EXISTS win_streak INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE stats ADD COLUMN IF NOT EXISTS buff_atk INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE stats ADD COLUMN IF NOT EXISTS buff_def INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE stats ADD COLUMN IF NOT EXISTS buff_expire INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE stats ADD COLUMN IF NOT EXISTS buff_exp_mult INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE groups ADD COLUMN IF NOT EXISTS antitoxic INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE groups ADD COLUMN IF NOT EXISTS greeting INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE groups ADD COLUMN IF NOT EXISTS openclose INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE groups ADD COLUMN IF NOT EXISTS raid INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_streak INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_daily INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_upgrade_count INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE warns ADD COLUMN IF NOT EXISTS damage INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE stats ADD COLUMN IF NOT EXISTS crit_rate INTEGER NOT NULL DEFAULT 5`,
  `ALTER TABLE divergent_runs ADD COLUMN IF NOT EXISTS chat_jid TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS raid_coin INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS prison_until INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE raids ALTER COLUMN start_at TYPE BIGINT`,
  `ALTER TABLE raids ALTER COLUMN end_at TYPE BIGINT`,
  `ALTER TABLE raid_participants ALTER COLUMN breaktime_until TYPE BIGINT`,
  `ALTER TABLE redeem_codes ALTER COLUMN expires_at TYPE BIGINT`,
  `SELECT setval(pg_get_serial_sequence('warns', 'id'), COALESCE(MAX(id), 1)) FROM warns`,
  `SELECT setval(pg_get_serial_sequence('inventories', 'id'), COALESCE(MAX(id), 1)) FROM inventories`,
  `SELECT setval(pg_get_serial_sequence('transactions', 'id'), COALESCE(MAX(id), 1)) FROM transactions`,
  `SELECT setval(pg_get_serial_sequence('relics', 'id'), COALESCE(MAX(id), 1)) FROM relics`,
  `SELECT setval(pg_get_serial_sequence('artifacts', 'id'), COALESCE(MAX(id), 1)) FROM artifacts`,
  `SELECT setval(pg_get_serial_sequence('raids', 'id'), COALESCE(MAX(id), 1)) FROM raids`,
  `SELECT setval(pg_get_serial_sequence('raid_participants', 'id'), COALESCE(MAX(id), 1)) FROM raid_participants`,
  `UPDATE stats SET hp = 1200, max_hp = 1200, atk = 30, def = 20 WHERE max_hp = 200 AND atk = 30 AND def = 10`,
];

export async function createSchema() {
  for (const stmt of STATIC_SCHEMA) {
    await sql.unsafe(stmt);
  }
  for (const stmt of MIGRATIONS) {
    try {
      await sql.unsafe(stmt);
    } catch {
      // ignore
    }
  }
  await sql.unsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_divergent_runs_active_chat
     ON divergent_runs(chat_jid)
     WHERE status = 'active' AND chat_jid IS NOT NULL`
  );
  logger.info('Schema ready');
}
