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

  // Economy Daily state on users (same fields as legacy). Idempotent.
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS daily_streak INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_daily INTEGER NOT NULL DEFAULT 0`,

  // Economy Crime jail state (same field as legacy). Idempotent.
  // Epoch seconds; 0 = free. Restriction-only: no income math reads it.
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS prison_until INTEGER NOT NULL DEFAULT 0`,

  // Economy Bounty daily state (same field as legacy). Idempotent.
  // Epoch seconds of the last successful bounty attempt.
  `ALTER TABLE users ADD COLUMN IF NOT EXISTS last_bounty INTEGER NOT NULL DEFAULT 0`,

  // RPG 2.0 Shop + Inventory foundation. No coin system existed outside
  // legacy reference, so this is the minimal RPG-scoped coin store
  // (same currency: coin). Generic item rows: one per (user, item).
  // `bank` is the Economy 2.0 Bank balance (same row as coin, so every
  // deposit/withdraw is a single conditional UPDATE: coin+bank total is
  // conserved by construction and can never go negative). Storage only:
  // no interest, fee, limit, or ledger columns.
  `
  CREATE TABLE IF NOT EXISTS rpg_wallets (
    user_id     TEXT    PRIMARY KEY REFERENCES rpg_players(user_id) ON DELETE CASCADE,
    coin        INTEGER NOT NULL DEFAULT 0 CHECK (coin >= 0),
    bank        INTEGER NOT NULL DEFAULT 0 CHECK (bank >= 0),
    created_at  INTEGER NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT),
    updated_at  INTEGER NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT)
  )
  `,
  `ALTER TABLE rpg_wallets ADD COLUMN IF NOT EXISTS bank INTEGER NOT NULL DEFAULT 0`,

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
  // Economy 2.0 Market tables (migrated from legacy, same schema).
  // Price engine state, hourly-tick bookkeeping, bounded price history,
  // per-user holdings (quantity + average-cost basis), and trade ledger.
  // market_portfolio.jid references users(jid): holdings die with the user.
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

  `CREATE INDEX IF NOT EXISTS idx_market_history_commodity ON market_history(commodity_id, id DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_market_portfolio_jid ON market_portfolio(jid)`,
  `CREATE INDEX IF NOT EXISTS idx_market_trades_jid ON market_trades(jid, id DESC)`,

  // Economy 2.0 Market News table (migrated from legacy, same schema).
  // Optional layer over Market: spawned per tick, announced once to
  // news-enabled groups, pressure applied through the price engine.
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

  `CREATE INDEX IF NOT EXISTS idx_market_news_status ON market_news(status, id DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_market_news_announce ON market_news(announce_status, id)`,
  `CREATE INDEX IF NOT EXISTS idx_market_news_type_tick ON market_news(type, start_tick DESC)`,

  // Group opt-in flag for automatic Market News delivery (default off).
  `ALTER TABLE groups ADD COLUMN IF NOT EXISTS news INTEGER NOT NULL DEFAULT 0`,

  // Economy 2.0 Farming plots. One row per user (single land, no
  // upgrades): empty land is crop_id = '' with quantity = 0. Maturity is
  // timestamp-based (planted_at/mature_at in ms), so restarts are safe.
  `
  CREATE TABLE IF NOT EXISTS farm_plots (
    user_id     TEXT    PRIMARY KEY REFERENCES rpg_players(user_id) ON DELETE CASCADE,
    crop_id     TEXT    NOT NULL DEFAULT '',
    quantity    INTEGER NOT NULL DEFAULT 0,
    planted_at  BIGINT  NOT NULL DEFAULT 0,
    mature_at   BIGINT  NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT),
    updated_at  INTEGER NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT)
  )
  `,

  // RPG 2.0 Orbital Lift progress. One row per user: next floor to attempt,
  // Signal balance + last regen timestamp (timestamp-based, restart-safe).
  // Owned Records live in the existing inventory (orbital_record_*).
  `
  CREATE TABLE IF NOT EXISTS orbital_progress (
    user_id           TEXT    PRIMARY KEY REFERENCES rpg_players(user_id) ON DELETE CASCADE,
    floor             INTEGER NOT NULL DEFAULT 1,
    signal            INTEGER NOT NULL DEFAULT 100,
    signal_updated_at BIGINT  NOT NULL DEFAULT 0,
    created_at        INTEGER NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT),
    updated_at        INTEGER NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT)
  )
  `,

  // Economy 2.0 Work sessions + RPG 2.0 Expeditions (migrated from legacy,
  // same schemas). One row per user; claiming flips active -> claimed only
  // after the duration elapsed, so retries grant once.
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

  // RPG 2.0 PvP sessions + streaks on players. One row per challenge;
  // the partial unique indexes enforce "a player has at most one active
  // battle as challenger or target" at the database level.
  `
  CREATE TABLE IF NOT EXISTS rpg_pvp_sessions (
    id            TEXT    PRIMARY KEY,
    challenger    TEXT    NOT NULL REFERENCES rpg_players(user_id) ON DELETE CASCADE,
    target        TEXT    NOT NULL REFERENCES rpg_players(user_id) ON DELETE CASCADE,
    status        TEXT    NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','accepted','running','finished','cancelled','expired')),
    confirm_msg_id TEXT   UNIQUE,
    result        TEXT    NOT NULL DEFAULT '{}',
    expires_at    INTEGER NOT NULL DEFAULT 0,
    started_at    INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT),
    updated_at    INTEGER NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT)
  )
  `,

  `CREATE UNIQUE INDEX IF NOT EXISTS uq_pvp_pending_challenger ON rpg_pvp_sessions(challenger) WHERE status IN ('pending','accepted','running')`,
  `CREATE UNIQUE INDEX IF NOT EXISTS uq_pvp_pending_target ON rpg_pvp_sessions(target) WHERE status IN ('pending','accepted','running')`,

  // Idempotent fix for tables created with the older NOT NULL DEFAULT ''
  // confirm_msg_id (UNIQUE '' collided when two challenges had no message yet).
  `ALTER TABLE rpg_pvp_sessions ALTER COLUMN confirm_msg_id DROP DEFAULT`,
  `ALTER TABLE rpg_pvp_sessions ALTER COLUMN confirm_msg_id DROP NOT NULL`,

  // PvP streak state on players (legacy kept win/loss/win_streak on stats).
  `ALTER TABLE rpg_players ADD COLUMN IF NOT EXISTS pvp_wins INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE rpg_players ADD COLUMN IF NOT EXISTS pvp_losses INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE rpg_players ADD COLUMN IF NOT EXISTS pvp_win_streak INTEGER NOT NULL DEFAULT 0`,

  // Economy 2.0 Redeem codes (migrated from legacy, same schema).
  `
  CREATE TABLE IF NOT EXISTS redeem_codes (
    code        TEXT    PRIMARY KEY,
    amount      INTEGER NOT NULL CHECK (amount > 0),
    expires_at  BIGINT  NOT NULL,
    created_at  INTEGER NOT NULL DEFAULT (EXTRACT(epoch FROM NOW())::BIGINT)
  )
  `,

  `
  CREATE TABLE IF NOT EXISTS redeem_code_users (
    id        BIGSERIAL PRIMARY KEY,
    code      TEXT    NOT NULL REFERENCES redeem_codes(code) ON DELETE CASCADE,
    jid       TEXT    NOT NULL,
    used_at   INTEGER NOT NULL,
    UNIQUE(code, jid)
  )
  `,

  `CREATE INDEX IF NOT EXISTS idx_redeem_code_users_code ON redeem_code_users(code)`,
  `CREATE INDEX IF NOT EXISTS idx_redeem_code_users_jid ON redeem_code_users(jid)`,
];

export async function createSchema() {
  for (const stmt of STATIC_SCHEMA) {
    await sql.unsafe(stmt);
  }
  logger.info('Schema ready');
}

export { STATIC_SCHEMA };
