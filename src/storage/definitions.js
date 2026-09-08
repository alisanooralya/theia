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
    banned      INTEGER NOT NULL DEFAULT 0,
    daily_streak INTEGER NOT NULL DEFAULT 0,
    last_daily  INTEGER NOT NULL DEFAULT 0,
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
    bank_limit  INTEGER NOT NULL DEFAULT 5000000,
    last_interest_at BIGINT NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT),
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
    win         INTEGER NOT NULL DEFAULT 0,
    loss        INTEGER NOT NULL DEFAULT 0,
    win_streak  INTEGER NOT NULL DEFAULT 0,
    buff_atk    INTEGER NOT NULL DEFAULT 0,
    buff_def    INTEGER NOT NULL DEFAULT 0,
    buff_expire INTEGER NOT NULL DEFAULT 0,
    buff_exp_mult INTEGER NOT NULL DEFAULT 1,
    crit_rate    INTEGER NOT NULL DEFAULT 10,
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
  INSERT INTO items (id, name, description, category, price, sellable, stackable, rarity, data)
  VALUES ('card_core', 'Card Core', 'Material khusus untuk meningkatkan level Main Card',
          'material', 0, 0, 1, 'rare', '{}')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, description = EXCLUDED.description,
    category = EXCLUDED.category, sellable = EXCLUDED.sellable,
    stackable = EXCLUDED.stackable, rarity = EXCLUDED.rarity
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
  CREATE TABLE IF NOT EXISTS expeditions (
    jid         TEXT    PRIMARY KEY REFERENCES users(jid) ON DELETE CASCADE,
    type        TEXT    NOT NULL,
    duration    TEXT    NOT NULL,
    status      TEXT    NOT NULL DEFAULT 'active',
    reward_coin INTEGER NOT NULL DEFAULT 0,
    reward_exp  INTEGER NOT NULL DEFAULT 0,
    started_at  INTEGER NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT),
    ends_at     INTEGER NOT NULL DEFAULT 0,
    claimed_at  INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT),
    updated_at  INTEGER NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT)
  )
  `,

  `
  CREATE TABLE IF NOT EXISTS work_sessions (
    jid         TEXT    PRIMARY KEY REFERENCES users(jid) ON DELETE CASCADE,
    job         TEXT    NOT NULL,
    status      TEXT    NOT NULL DEFAULT 'active',
    reward_coin INTEGER NOT NULL DEFAULT 0,
    reward_exp  INTEGER NOT NULL DEFAULT 0,
    started_at  INTEGER NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT),
    ends_at     INTEGER NOT NULL DEFAULT 0,
    claimed_at  INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT),
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
  CREATE TABLE IF NOT EXISTS cards (
    id          TEXT    PRIMARY KEY,
    name        TEXT    NOT NULL,
    type        TEXT    NOT NULL CHECK(type IN ('main', 'support')),
    role        TEXT    NOT NULL DEFAULT '',
    max_level   INTEGER NOT NULL CHECK(max_level IN (1, 100)),
    max_hp      INTEGER NOT NULL DEFAULT 0 CHECK(max_hp >= 0),
    max_atk     INTEGER NOT NULL DEFAULT 0 CHECK(max_atk >= 0),
    max_def     INTEGER NOT NULL DEFAULT 0 CHECK(max_def >= 0),
    passive     TEXT    NOT NULL DEFAULT ''
  )
  `,

  `
  INSERT INTO cards (id, name, type, role, max_level, max_hp, max_atk, max_def, passive)
  VALUES
    ('girgas', 'Girgas', 'main', 'Attacker', 100, 910, 195, 32, 'Melee Drive'),
    ('lena', 'Lena', 'main', 'Archer', 100, 760, 200, 38, 'Star Stacks'),
    ('ameris', 'Ameris', 'main', 'Supporter', 100, 920, 260, 40, 'Choco Support'),
    ('daisy', 'Daisy', 'main', 'Defender', 100, 960, 175, 22, 'Last Stand'),
    ('raid_emblem', 'Raid Emblem', 'support', 'Utility', 1, 0, 0, 0, 'Raid Focus'),
    ('treasure_hunter', 'Treasure Hunter', 'support', 'Utility', 1, 0, 0, 0, 'Treasure Hunter'),
    ('iron_will', 'Iron Will', 'support', 'Utility', 1, 0, 0, 0, 'Iron Will'),
    ('critical_eye', 'Critical Eye', 'support', 'Utility', 1, 0, 0, 0, 'Critical Eye')
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name, type = EXCLUDED.type, role = EXCLUDED.role,
    max_level = EXCLUDED.max_level, max_hp = EXCLUDED.max_hp,
    max_atk = EXCLUDED.max_atk, max_def = EXCLUDED.max_def,
    passive = EXCLUDED.passive
  `,

  `
  CREATE TABLE IF NOT EXISTS user_cards (
    id          BIGSERIAL PRIMARY KEY,
    owner_jid   TEXT    NOT NULL REFERENCES users(jid) ON DELETE CASCADE,
    card_id     TEXT    NOT NULL REFERENCES cards(id),
    type        TEXT    NOT NULL CHECK(type IN ('main', 'support')),
    level       INTEGER NOT NULL CHECK(level BETWEEN 1 AND 100),
    reward_key  TEXT,
    created_at  BIGINT  NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT),
    updated_at  BIGINT  NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT),
    UNIQUE(owner_jid, id),
    UNIQUE(owner_jid, id, type),
    CHECK((type = 'main' AND level BETWEEN 5 AND 100) OR (type = 'support' AND level = 1)),
    UNIQUE(owner_jid, reward_key),
    UNIQUE(owner_jid, card_id)
  )
  `,

  `
  CREATE TABLE IF NOT EXISTS equipped_cards (
    jid           TEXT   NOT NULL REFERENCES users(jid) ON DELETE CASCADE,
    slot          TEXT   NOT NULL CHECK(slot IN ('main', 'support')),
    user_card_id  BIGINT NOT NULL,
    updated_at    BIGINT NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT),
    PRIMARY KEY(jid, slot),
    UNIQUE(jid, user_card_id),
    FOREIGN KEY(jid, user_card_id, slot)
      REFERENCES user_cards(owner_jid, id, type) ON DELETE CASCADE
  )
  `,

  `
  CREATE TABLE IF NOT EXISTS gacha_requests (
    request_key TEXT   PRIMARY KEY,
    jid         TEXT   NOT NULL REFERENCES users(jid) ON DELETE CASCADE,
    results     TEXT   NOT NULL DEFAULT '[]',
    created_at  BIGINT NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT)
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

  `
  CREATE TABLE IF NOT EXISTS raid_periods (
    period_id    TEXT    PRIMARY KEY,
    name         TEXT    NOT NULL DEFAULT '',
    start_at     BIGINT  NOT NULL,
    end_at       BIGINT  NOT NULL,
    boss_count   INTEGER NOT NULL,
    current_boss INTEGER NOT NULL DEFAULT 0,
    status       TEXT    NOT NULL DEFAULT 'active',
    completed_at BIGINT  NOT NULL DEFAULT 0,
    created_at   BIGINT  NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT),
    updated_at   BIGINT  NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT)
  )
  `,

  `
  CREATE TABLE IF NOT EXISTS raid_bosses (
    period_id    TEXT    NOT NULL REFERENCES raid_periods(period_id) ON DELETE CASCADE,
    boss_index   INTEGER NOT NULL,
    boss_id      TEXT    NOT NULL,
    max_hp       BIGINT  NOT NULL,
    remaining_hp BIGINT  NOT NULL,
    defeated_at  BIGINT  NOT NULL DEFAULT 0,
    created_at   BIGINT  NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT),
    updated_at   BIGINT  NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT),
    PRIMARY KEY (period_id, boss_index)
  )
  `,

  `
  CREATE TABLE IF NOT EXISTS raid_contributions (
    period_id      TEXT    NOT NULL,
    boss_index     INTEGER NOT NULL,
    jid            TEXT    NOT NULL REFERENCES users(jid) ON DELETE CASCADE,
    damage         BIGINT  NOT NULL DEFAULT 0,
    hits           INTEGER NOT NULL DEFAULT 0,
    reward_claimed INTEGER NOT NULL DEFAULT 0,
    created_at     BIGINT  NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT),
    updated_at     BIGINT  NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT),
    PRIMARY KEY (period_id, boss_index, jid)
  )
  `,

  `
  CREATE TABLE IF NOT EXISTS raid_entries (
    jid        TEXT    PRIMARY KEY REFERENCES users(jid) ON DELETE CASCADE,
    day_key    TEXT    NOT NULL DEFAULT '',
    used       INTEGER NOT NULL DEFAULT 0,
    updated_at BIGINT  NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT)
  )
  `,

  `
  CREATE TABLE IF NOT EXISTS market_commodities (
    id            TEXT    PRIMARY KEY,
    price         BIGINT  NOT NULL DEFAULT 0,
    prev_price    BIGINT  NOT NULL DEFAULT 0,
    phase         TEXT    NOT NULL DEFAULT 'normal',
    phase_ticks   INTEGER NOT NULL DEFAULT 0,
    momentum      REAL    NOT NULL DEFAULT 0,
    event_id      TEXT    NOT NULL DEFAULT '',
    event_ticks   INTEGER NOT NULL DEFAULT 0,
    updated_at    BIGINT  NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT)
  )
  `,

  `
  CREATE TABLE IF NOT EXISTS market_state (
    id            SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    tick          BIGINT  NOT NULL DEFAULT 0,
    bucket        BIGINT  NOT NULL DEFAULT 0,
    last_tick_at  BIGINT  NOT NULL DEFAULT 0
  )
  `,

  `
  CREATE TABLE IF NOT EXISTS market_history (
    id            BIGSERIAL PRIMARY KEY,
    commodity_id  TEXT    NOT NULL REFERENCES market_commodities(id) ON DELETE CASCADE,
    price         BIGINT  NOT NULL,
    tick          BIGINT  NOT NULL DEFAULT 0,
    created_at    BIGINT  NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT)
  )
  `,

  `
  CREATE TABLE IF NOT EXISTS market_portfolio (
    jid           TEXT    NOT NULL REFERENCES users(jid) ON DELETE CASCADE,
    commodity_id  TEXT    NOT NULL REFERENCES market_commodities(id) ON DELETE CASCADE,
    quantity      BIGINT  NOT NULL DEFAULT 0,
    total_cost    BIGINT  NOT NULL DEFAULT 0,
    realized_pl   BIGINT  NOT NULL DEFAULT 0,
    updated_at    BIGINT  NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT),
    PRIMARY KEY (jid, commodity_id),
    CONSTRAINT market_portfolio_qty_positive CHECK (quantity >= 0),
    CONSTRAINT market_portfolio_cost_positive CHECK (total_cost >= 0)
  )
  `,

  `
  CREATE TABLE IF NOT EXISTS market_trades (
    id            BIGSERIAL PRIMARY KEY,
    jid           TEXT    NOT NULL,
    commodity_id  TEXT    NOT NULL,
    side          TEXT    NOT NULL,
    quantity      BIGINT  NOT NULL,
    unit_price    BIGINT  NOT NULL,
    total         BIGINT  NOT NULL,
    profit        BIGINT  NOT NULL DEFAULT 0,
    created_at    BIGINT  NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT)
  )
  `,

  `
  CREATE TABLE IF NOT EXISTS market_news (
    id            BIGSERIAL PRIMARY KEY,
    news_key      TEXT    NOT NULL UNIQUE,
    type          TEXT    NOT NULL,
    template_id   TEXT    NOT NULL DEFAULT '',
    title         TEXT    NOT NULL DEFAULT '',
    message       TEXT    NOT NULL,
    affected_commodities TEXT NOT NULL DEFAULT '',
    hidden_outcome TEXT   NOT NULL,
    hidden_impact TEXT    NOT NULL DEFAULT '{}',
    status        TEXT    NOT NULL DEFAULT 'ACTIVE',
    announce_status TEXT  NOT NULL DEFAULT 'PENDING',
    start_tick    BIGINT  NOT NULL DEFAULT 0,
    expire_tick   BIGINT  NOT NULL DEFAULT 0,
    announced_at  BIGINT  NOT NULL DEFAULT 0,
    created_at    BIGINT  NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT),
    expires_at    BIGINT  NOT NULL DEFAULT 0
  )
  `,

  `
  CREATE TABLE IF NOT EXISTS meteors (
    id          BIGSERIAL PRIMARY KEY,
    day_key     TEXT    NOT NULL UNIQUE,
    hp          BIGINT  NOT NULL,
    max_hp      BIGINT  NOT NULL,
    status      TEXT    NOT NULL DEFAULT 'active',
    rewarded_at BIGINT  NOT NULL DEFAULT 0,
    cleared_at  BIGINT  NOT NULL DEFAULT 0,
    created_at  BIGINT  NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT),
    updated_at  BIGINT  NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT)
  )
  `,

  `
  CREATE TABLE IF NOT EXISTS meteor_contributions (
    meteor_id   BIGINT  NOT NULL REFERENCES meteors(id) ON DELETE CASCADE,
    jid         TEXT    NOT NULL REFERENCES users(jid) ON DELETE CASCADE,
    damage      BIGINT  NOT NULL DEFAULT 0,
    hits        INTEGER NOT NULL DEFAULT 0,
    reward_coin BIGINT  NOT NULL DEFAULT 0,
    reward_exp  BIGINT  NOT NULL DEFAULT 0,
    created_at  BIGINT  NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT),
    updated_at  BIGINT  NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT),
    PRIMARY KEY (meteor_id, jid)
  )
  `,

  `
  CREATE TABLE IF NOT EXISTS mining_points (
    jid         TEXT    PRIMARY KEY REFERENCES users(jid) ON DELETE CASCADE,
    day_key     TEXT    NOT NULL DEFAULT '',
    used        INTEGER NOT NULL DEFAULT 0,
    updated_at  BIGINT  NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT)
  )
  `,

  `CREATE INDEX IF NOT EXISTS idx_market_history_commodity ON market_history(commodity_id, id DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_market_portfolio_jid ON market_portfolio(jid)`,
  `CREATE INDEX IF NOT EXISTS idx_market_trades_jid ON market_trades(jid, id DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_market_news_status ON market_news(status, id DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_market_news_announce ON market_news(announce_status, id)`,
  `CREATE INDEX IF NOT EXISTS idx_market_news_type_tick ON market_news(type, start_tick DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_artifacts_owner      ON artifacts(owner_jid)`,
  `CREATE INDEX IF NOT EXISTS idx_artifacts_slot       ON artifacts(owner_jid, slot)`,
  `CREATE INDEX IF NOT EXISTS idx_user_cards_owner     ON user_cards(owner_jid, id)`,
  `CREATE INDEX IF NOT EXISTS idx_user_cards_definition ON user_cards(owner_jid, card_id)`,
  `CREATE INDEX IF NOT EXISTS idx_equipped_cards_instance ON equipped_cards(user_card_id)`,
  `CREATE INDEX IF NOT EXISTS idx_gacha_requests_jid   ON gacha_requests(jid, created_at DESC)`,
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
  `CREATE INDEX IF NOT EXISTS idx_meteor_contrib_meteor ON meteor_contributions(meteor_id, damage DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_raid_contrib_period ON raid_contributions(period_id, damage DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_raid_contrib_jid ON raid_contributions(jid)`,
];

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
  `ALTER TABLE groups ADD COLUMN IF NOT EXISTS news INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_streak INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_daily INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_upgrade_count INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE warns ADD COLUMN IF NOT EXISTS damage INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE stats ADD COLUMN IF NOT EXISTS crit_rate INTEGER NOT NULL DEFAULT 5`,
  `ALTER TABLE divergent_runs ADD COLUMN IF NOT EXISTS chat_jid TEXT`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS raid_coin INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS prison_until INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_bounty INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE wallets ADD COLUMN IF NOT EXISTS last_interest_at BIGINT NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT)`,
  `ALTER TABLE wallets ALTER COLUMN last_interest_at SET DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT)`,
  `ALTER TABLE wallets ALTER COLUMN bank_limit SET DEFAULT 5000000`,
  `UPDATE wallets SET bank_limit = 5000000 WHERE bank_limit < 5000000`,
  `ALTER TABLE raids ALTER COLUMN start_at TYPE BIGINT`,
  `ALTER TABLE raids ALTER COLUMN end_at TYPE BIGINT`,
  `ALTER TABLE raid_participants ALTER COLUMN breaktime_until TYPE BIGINT`,
  `ALTER TABLE redeem_codes ALTER COLUMN expires_at TYPE BIGINT`,
  `SELECT setval(pg_get_serial_sequence('warns', 'id'), COALESCE(MAX(id), 1)) FROM warns`,
  `SELECT setval(pg_get_serial_sequence('inventories', 'id'), COALESCE(MAX(id), 1)) FROM inventories`,
  `SELECT setval(pg_get_serial_sequence('transactions', 'id'), COALESCE(MAX(id), 1)) FROM transactions`,
  `SELECT setval(pg_get_serial_sequence('artifacts', 'id'), COALESCE(MAX(id), 1)) FROM artifacts`,
  `SELECT setval(pg_get_serial_sequence('user_cards', 'id'), COALESCE(MAX(id), 1)) FROM user_cards`,
  `SELECT setval(pg_get_serial_sequence('raids', 'id'), COALESCE(MAX(id), 1)) FROM raids`,
  `SELECT setval(pg_get_serial_sequence('raid_participants', 'id'), COALESCE(MAX(id), 1)) FROM raid_participants`,
  `SELECT setval(pg_get_serial_sequence('market_history', 'id'), COALESCE(MAX(id), 1)) FROM market_history`,
  `SELECT setval(pg_get_serial_sequence('market_trades', 'id'), COALESCE(MAX(id), 1)) FROM market_trades`,
  `SELECT setval(pg_get_serial_sequence('market_news', 'id'), COALESCE(MAX(id), 1)) FROM market_news`,
  `UPDATE stats SET hp = 1200, max_hp = 1200, atk = 30, def = 20 WHERE max_hp = 200 AND atk = 30 AND def = 10`,
  `UPDATE equipped_cards ec SET user_card_id = keep.id
   FROM (SELECT owner_jid, card_id, MIN(id) AS id FROM user_cards GROUP BY owner_jid, card_id HAVING COUNT(*) > 1) keep
   WHERE ec.user_card_id IN (SELECT uc.id FROM user_cards uc WHERE uc.owner_jid = keep.owner_jid AND uc.card_id = keep.card_id AND uc.id <> keep.id)`,
  `DELETE FROM user_cards uc USING (SELECT owner_jid, card_id, MIN(id) AS keep_id FROM user_cards GROUP BY owner_jid, card_id HAVING COUNT(*) > 1) d
   WHERE uc.owner_jid = d.owner_jid AND uc.card_id = d.card_id AND uc.id <> d.keep_id`,
  `ALTER TABLE user_cards ADD CONSTRAINT uq_user_cards_owner_card UNIQUE (owner_jid, card_id)`,
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
  await sql.unsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_divergent_runs_active_chat
     ON divergent_runs(chat_jid)
     WHERE status = 'active' AND chat_jid IS NOT NULL`
  );
  await sql.unsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_meteors_single_active
     ON meteors((status))
     WHERE status = 'active'`
  );
  logger.info('Schema ready');
}
