import Database from 'better-sqlite3';
import { resolve, dirname } from 'path';
import { mkdirSync } from 'fs';
import { sql } from '#storage/connection.js';
import { logger } from '#helpers/logger.js';

const SOURCE = resolve('./data/database.db');
const TABLES = [
  'users',
  'wallets',
  'stats',
  'items',
  'inventories',
  'groups',
  'cooldowns',
  'transactions',
  'afk',
  'redeem_codes',
  'redeem_code_users',
  'warns',
  'group_activity',
  'divergent_runs',
  'divergent_usage',
  'relics',
  'relic_inventory',
  'artifacts',
  'artifact_inventory',
  'raids',
  'raid_participants',
];

function quoteIdent(name) {
  return `"${name}"`;
}

function inferCast(table, col) {
  return null;
}

async function migrate() {
  const src = new Database(SOURCE, { readonly: true });
  logger.info({ source: SOURCE }, 'Migrating SQLite -> Supabase');

  try {
    for (const table of TABLES) {
      const exists = src
        .prepare(
          "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?"
        )
        .get(table);
      if (!exists) {
        logger.warn({ table }, 'Table not found in source, skipping');
        continue;
      }

      const rows = src.prepare(`SELECT * FROM ${quoteIdent(table)}`).all();
      if (rows.length === 0) {
        logger.info({ table, rows: 0 }, 'No rows to migrate');
        continue;
      }

      const cols = Object.keys(rows[0]);
      const colList = cols.map(quoteIdent).join(', ');
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');

      const targetExists = await sql`
        SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ${table}
      `;
      if (!targetExists.length) {
        logger.warn({ table }, 'Target table missing in Supabase, skipping');
        continue;
      }

      await sql.begin(async (tx) => {
        for (const row of rows) {
          await tx.unsafe(
            `INSERT INTO ${quoteIdent(table)} (${colList}) VALUES (${placeholders})`,
            cols.map((c) => row[c])
          );
        }
      });

      logger.info({ table, rows: rows.length }, 'Migrated');
    }
  } finally {
    src.close();
    await sql.end();
  }

  logger.info('Migration to Supabase complete');
}

migrate().catch((err) => {
  logger.fatal({ err }, 'Migration failed');
  process.exit(1);
});
