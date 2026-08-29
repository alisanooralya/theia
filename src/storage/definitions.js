import { db } from './connection.js';
import { logger } from '#helpers/logger.js';

export function createSchema() {
  db.exec(`
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
      created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS wallets (
      jid         TEXT    PRIMARY KEY REFERENCES users(jid) ON DELETE CASCADE,
      cash        INTEGER NOT NULL DEFAULT 0,
      bank        INTEGER NOT NULL DEFAULT 0,
      bank_limit  INTEGER NOT NULL DEFAULT 1000000,
      updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );

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
      updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );

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
    );

    CREATE TABLE IF NOT EXISTS inventories (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      jid         TEXT    NOT NULL REFERENCES users(jid) ON DELETE CASCADE,
      item_id     TEXT    NOT NULL REFERENCES items(id),
      quantity    INTEGER NOT NULL DEFAULT 1,
      data        TEXT    NOT NULL DEFAULT '{}',
      created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(jid, item_id)
    );

    CREATE TABLE IF NOT EXISTS groups (
      jid         TEXT    PRIMARY KEY,
      name        TEXT    NOT NULL DEFAULT '',
      prefix      TEXT,
      welcome     INTEGER NOT NULL DEFAULT 0,
      welcome_msg TEXT    NOT NULL DEFAULT '',
      antilink    INTEGER NOT NULL DEFAULT 0,
      nsfw        INTEGER NOT NULL DEFAULT 0,
      mute        INTEGER NOT NULL DEFAULT 0,
      antitoxic   INTEGER NOT NULL DEFAULT 0,
      greeting    INTEGER NOT NULL DEFAULT 1,
      openclose   INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS cooldowns (
      key         TEXT    PRIMARY KEY,
      expires_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      from_jid    TEXT    NOT NULL,
      to_jid      TEXT,
      amount      INTEGER NOT NULL,
      type        TEXT    NOT NULL,
      note        TEXT    NOT NULL DEFAULT '',
      created_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS bot_settings (
      key         TEXT    PRIMARY KEY,
      value       TEXT    NOT NULL DEFAULT '',
      updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS afk (
      jid         TEXT    PRIMARY KEY,
      reason      TEXT    NOT NULL DEFAULT '',
      started_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS redeem_codes (
      code        TEXT    PRIMARY KEY,
      amount      INTEGER NOT NULL,
      expires_at  INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS redeem_code_users (
      code        TEXT    NOT NULL REFERENCES redeem_codes(code) ON DELETE CASCADE,
      jid         TEXT    NOT NULL,
      used_at     INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY (code, jid)
    );

    CREATE TABLE IF NOT EXISTS warns (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      jid         TEXT    NOT NULL,
      group_jid   TEXT    NOT NULL,
      reason      TEXT    NOT NULL DEFAULT '',
      damage      INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS group_activity (
      jid           TEXT    NOT NULL,
      user_jid      TEXT    NOT NULL,
      xp            INTEGER NOT NULL DEFAULT 0,
      level         INTEGER NOT NULL DEFAULT 1,
      message_count INTEGER NOT NULL DEFAULT 0,
      updated_at    INTEGER NOT NULL DEFAULT (unixepoch()),
      PRIMARY KEY (jid, user_jid)
    );

    CREATE TABLE IF NOT EXISTS divergent_runs (
      jid         TEXT    PRIMARY KEY REFERENCES users(jid) ON DELETE CASCADE,
      chat_jid    TEXT,
      status      TEXT    NOT NULL DEFAULT 'active',
      state       TEXT    NOT NULL DEFAULT '{}',
      revision    INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS divergent_usage (
      jid          TEXT    PRIMARY KEY REFERENCES users(jid) ON DELETE CASCADE,
      daily_key    TEXT    NOT NULL DEFAULT '',
      daily_count  INTEGER NOT NULL DEFAULT 0,
      weekly_key   TEXT    NOT NULL DEFAULT '',
      weekly_count INTEGER NOT NULL DEFAULT 0,
      updated_at   INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS relics (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_jid   TEXT    NOT NULL REFERENCES users(jid) ON DELETE CASCADE,
      slot        TEXT    NOT NULL CHECK(slot IN ('head', 'hands', 'body', 'feet')),
      main_stat   TEXT    NOT NULL,
      main_value  INTEGER NOT NULL DEFAULT 0,
      substats    TEXT    NOT NULL DEFAULT '[]',
      level       INTEGER NOT NULL DEFAULT 1,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS relic_inventory (
      jid         TEXT    PRIMARY KEY REFERENCES users(jid) ON DELETE CASCADE,
      head_id     INTEGER REFERENCES relics(id) ON DELETE SET NULL,
      hands_id    INTEGER REFERENCES relics(id) ON DELETE SET NULL,
      body_id     INTEGER REFERENCES relics(id) ON DELETE SET NULL,
      feet_id     INTEGER REFERENCES relics(id) ON DELETE SET NULL,
      updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS artifacts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_jid   TEXT    NOT NULL REFERENCES users(jid) ON DELETE CASCADE,
      user_id     INTEGER NOT NULL DEFAULT 1,
      name        TEXT    NOT NULL DEFAULT '',
      slot        TEXT    NOT NULL CHECK(slot IN ('flower', 'feather', 'sands', 'goblet', 'circlet')),
      level       INTEGER NOT NULL DEFAULT 1,
      main_stat   TEXT    NOT NULL,
      main_value  INTEGER NOT NULL DEFAULT 0,
      substats    TEXT    NOT NULL DEFAULT '{}',
      created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at  INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(owner_jid, user_id)
    );

    CREATE TABLE IF NOT EXISTS artifact_inventory (
      jid         TEXT    PRIMARY KEY REFERENCES users(jid) ON DELETE CASCADE,
      flower_id   INTEGER REFERENCES artifacts(id) ON DELETE SET NULL,
      feather_id  INTEGER REFERENCES artifacts(id) ON DELETE SET NULL,
      sands_id    INTEGER REFERENCES artifacts(id) ON DELETE SET NULL,
      goblet_id   INTEGER REFERENCES artifacts(id) ON DELETE SET NULL,
      circlet_id  INTEGER REFERENCES artifacts(id) ON DELETE SET NULL,
      updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS raids (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      boss_name   TEXT    NOT NULL DEFAULT 'Raid Boss',
      boss_hp     INTEGER NOT NULL DEFAULT 500000,
      boss_max_hp INTEGER NOT NULL DEFAULT 500000,
      status      TEXT    NOT NULL DEFAULT 'pending',
      start_at    INTEGER NOT NULL DEFAULT 0,
      end_at      INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS raid_participants (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      raid_id     INTEGER NOT NULL REFERENCES raids(id) ON DELETE CASCADE,
      jid         TEXT    NOT NULL REFERENCES users(jid) ON DELETE CASCADE,
      hp          INTEGER NOT NULL DEFAULT 2400,
      max_hp      INTEGER NOT NULL DEFAULT 2400,
      damage      INTEGER NOT NULL DEFAULT 0,
      status      TEXT    NOT NULL DEFAULT 'active',
      breaktime_until INTEGER NOT NULL DEFAULT 0,
      reward_claimed INTEGER NOT NULL DEFAULT 0,
      created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at  INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(raid_id, jid)
    );

    CREATE INDEX IF NOT EXISTS idx_artifacts_owner      ON artifacts(owner_jid);
    CREATE INDEX IF NOT EXISTS idx_artifacts_slot       ON artifacts(owner_jid, slot);

    CREATE INDEX IF NOT EXISTS idx_relics_owner      ON relics(owner_jid);
    CREATE INDEX IF NOT EXISTS idx_relics_slot       ON relics(owner_jid, slot);
    CREATE INDEX IF NOT EXISTS idx_inventories_jid      ON inventories(jid);
    CREATE INDEX IF NOT EXISTS idx_transactions_from    ON transactions(from_jid);
    CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at);
    CREATE INDEX IF NOT EXISTS idx_cooldowns_expires    ON cooldowns(expires_at);
    CREATE INDEX IF NOT EXISTS idx_users_level          ON users(level DESC);
    CREATE INDEX IF NOT EXISTS idx_redeem_codes_expiry  ON redeem_codes(expires_at);

    CREATE INDEX IF NOT EXISTS idx_warns_jid            ON warns(jid, group_jid);
    CREATE INDEX IF NOT EXISTS idx_group_activity_jid  ON group_activity(jid, xp DESC);
    CREATE INDEX IF NOT EXISTS idx_group_activity_user ON group_activity(user_jid);
    CREATE INDEX IF NOT EXISTS idx_divergent_runs_status ON divergent_runs(status);
  `);

  try {
    db.exec(
      'ALTER TABLE stats ADD COLUMN win_streak INTEGER NOT NULL DEFAULT 0'
    );
  } catch {}
  try {
    db.exec('ALTER TABLE stats ADD COLUMN buff_atk INTEGER NOT NULL DEFAULT 0');
  } catch {}
  try {
    db.exec('ALTER TABLE stats ADD COLUMN buff_def INTEGER NOT NULL DEFAULT 0');
  } catch {}
  try {
    db.exec(
      'ALTER TABLE stats ADD COLUMN buff_expire INTEGER NOT NULL DEFAULT 0'
    );
  } catch {}
  try {
    db.exec(
      'ALTER TABLE stats ADD COLUMN buff_exp_mult INTEGER NOT NULL DEFAULT 1'
    );
  } catch {}
  try {
    db.exec(
      'ALTER TABLE groups ADD COLUMN antitoxic INTEGER NOT NULL DEFAULT 0'
    );
  } catch {}
  try {
    db.exec(
      'ALTER TABLE groups ADD COLUMN greeting INTEGER NOT NULL DEFAULT 1'
    );
  } catch {}
  try {
    db.exec(
      'ALTER TABLE groups ADD COLUMN openclose INTEGER NOT NULL DEFAULT 0'
    );
  } catch {}
  try {
    db.exec('ALTER TABLE users ADD COLUMN daily_streak INTEGER NOT NULL DEFAULT 0');
  } catch {}
  try {
    db.exec('ALTER TABLE users ADD COLUMN last_daily INTEGER NOT NULL DEFAULT 0');
  } catch {}
  try {
    db.exec('ALTER TABLE users ADD COLUMN bank_upgrade_count INTEGER NOT NULL DEFAULT 0');
  } catch {}
  try {
    db.exec('ALTER TABLE warns ADD COLUMN damage INTEGER NOT NULL DEFAULT 0');
  } catch {}
  try {
    db.exec('ALTER TABLE stats ADD COLUMN crit_rate INTEGER NOT NULL DEFAULT 5');
  } catch {}
  try {
    db.exec(
      "UPDATE stats SET hp = 1200, max_hp = 1200, atk = 30, def = 20 WHERE max_hp = 200 AND atk = 30 AND def = 10"
    );
  } catch {}
  try {
    db.exec('CREATE TABLE IF NOT EXISTS afk (jid TEXT PRIMARY KEY, reason TEXT NOT NULL DEFAULT \'\', started_at INTEGER NOT NULL DEFAULT (unixepoch()))');
  } catch {}
  try {
    db.exec('ALTER TABLE divergent_runs ADD COLUMN chat_jid TEXT');
  } catch {}
  try {
    db.exec('ALTER TABLE users ADD COLUMN raid_coin INTEGER NOT NULL DEFAULT 0');
  } catch {}
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_divergent_runs_active_chat
    ON divergent_runs(chat_jid)
    WHERE status = 'active' AND chat_jid IS NOT NULL
  `);

  logger.info('Schema ready');
}
