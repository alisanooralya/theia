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
      bank_limit  INTEGER NOT NULL DEFAULT 10000,
      updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS stats (
      jid         TEXT    PRIMARY KEY REFERENCES users(jid) ON DELETE CASCADE,
      hp          INTEGER NOT NULL DEFAULT 100,
      max_hp      INTEGER NOT NULL DEFAULT 100,
      atk         INTEGER NOT NULL DEFAULT 10,
      def         INTEGER NOT NULL DEFAULT 5,
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

    CREATE TABLE IF NOT EXISTS quests (
      id          TEXT    PRIMARY KEY,
      name        TEXT    NOT NULL,
      description TEXT    NOT NULL DEFAULT '',
      type        TEXT    NOT NULL DEFAULT 'daily',
      goal        INTEGER NOT NULL DEFAULT 1,
      reward_cash INTEGER NOT NULL DEFAULT 0,
      reward_exp  INTEGER NOT NULL DEFAULT 0,
      reward_item TEXT
    );

    CREATE TABLE IF NOT EXISTS user_quests (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      jid         TEXT    NOT NULL REFERENCES users(jid) ON DELETE CASCADE,
      quest_id    TEXT    NOT NULL REFERENCES quests(id),
      progress    INTEGER NOT NULL DEFAULT 0,
      completed   INTEGER NOT NULL DEFAULT 0,
      claimed     INTEGER NOT NULL DEFAULT 0,
      reset_at    INTEGER NOT NULL DEFAULT 0,
      updated_at  INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(jid, quest_id)
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
      expires_at  INTEGER NOT NULL,
      used_by     TEXT,
      used_at     INTEGER
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

    CREATE TABLE IF NOT EXISTS dungeon_runs (
      jid           TEXT    PRIMARY KEY,
      status        TEXT    NOT NULL DEFAULT 'active',
      current_node  INTEGER NOT NULL DEFAULT 1,
      total_nodes   INTEGER NOT NULL DEFAULT 12,
      node_types    TEXT    NOT NULL,
      blessings     TEXT    NOT NULL DEFAULT '[]',
      curios        TEXT    NOT NULL DEFAULT '[]',
      pending_choice TEXT,
      total_cash    INTEGER NOT NULL DEFAULT 0,
      total_exp     INTEGER NOT NULL DEFAULT 0,
      created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at    INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_inventories_jid      ON inventories(jid);
    CREATE INDEX IF NOT EXISTS idx_transactions_from    ON transactions(from_jid);
    CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at);
    CREATE INDEX IF NOT EXISTS idx_cooldowns_expires    ON cooldowns(expires_at);
    CREATE INDEX IF NOT EXISTS idx_user_quests_jid      ON user_quests(jid);
    CREATE INDEX IF NOT EXISTS idx_users_level          ON users(level DESC);
    CREATE INDEX IF NOT EXISTS idx_redeem_codes_expiry  ON redeem_codes(expires_at);

    CREATE INDEX IF NOT EXISTS idx_warns_jid            ON warns(jid, group_jid);
    CREATE INDEX IF NOT EXISTS idx_group_activity_jid  ON group_activity(jid, xp DESC);
    CREATE INDEX IF NOT EXISTS idx_group_activity_user ON group_activity(user_jid);
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
    db.exec('CREATE TABLE IF NOT EXISTS afk (jid TEXT PRIMARY KEY, reason TEXT NOT NULL DEFAULT \'\', started_at INTEGER NOT NULL DEFAULT (unixepoch()))');
  } catch {}

  logger.info('Schema ready');
}
