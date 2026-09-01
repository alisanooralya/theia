import postgres from 'postgres';
import { logger } from '#helpers/logger.js';

// Script migrasi data antar project Supabase.
// Gunakan ketika pindah region / membuat project baru.
//
// Cara pakai:
//   SOURCE_URL="postgresql://postgres.OLD_REF:pass@...pooler.supabase.com:6543/postgres" \
//   TARGET_URL="postgresql://postgres.NEW_REF:pass@...pooler.supabase.com:6543/postgres" \
//   node src/storage/migrate-supabase-project.js
//
// Catatan:
// - SKEMA harus sudah dibuat di project baru (jalankan `npm run db:migrate` dulu dengan TARGET).
// - Skrip hanya menyalin DATA (tabel), tidak membuat schema.
// - Baris yang sudah ada di target dilewati (ON CONFLICT DO NOTHING) — aman dijalankan ulang.

const SOURCE_URL = process.env.SOURCE_URL;
const TARGET_URL = process.env.TARGET_URL;

if (!SOURCE_URL || !TARGET_URL) {
  logger.fatal(
    'SOURCE_URL dan TARGET_URL wajib diisi. Lihat komentar di atas file ini.'
  );
  process.exit(1);
}

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

const SERIAL_TABLES = [
  'inventories',
  'transactions',
  'warns',
  'relics',
  'artifacts',
  'raids',
  'raid_participants',
];

function quoteIdent(name) {
  return `"${name}"`;
}

async function migrate() {
  const src = postgres(SOURCE_URL, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
    ssl: { rejectUnauthorized: false },
    onnotice: () => {},
  });
  const dst = postgres(TARGET_URL, {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    prepare: false,
    ssl: { rejectUnauthorized: false },
    onnotice: () => {},
  });

  logger.info('Migrating data Supabase -> Supabase');

  try {
    for (const table of TABLES) {
      const rows = await src.unsafe(`SELECT * FROM ${quoteIdent(table)}`);
      if (rows.length === 0) {
        logger.info({ table, rows: 0 }, 'No rows to migrate');
        continue;
      }

      const cols = Object.keys(rows[0]);
      const colList = cols.map(quoteIdent).join(', ');
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');

      await dst.begin(async (tx) => {
        for (const row of rows) {
          await tx.unsafe(
            `INSERT INTO ${quoteIdent(table)} (${colList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`,
            cols.map((c) => row[c])
          );
        }
      });

      logger.info({ table, rows: rows.length }, 'Migrated');
    }

    for (const table of SERIAL_TABLES) {
      await dst.unsafe(
        `SELECT setval(pg_get_serial_sequence(${`'${table}'`}, 'id'), COALESCE(MAX(id), 1)) FROM ${quoteIdent(table)}`
      );
    }
    logger.info('Sequences synced');
  } finally {
    await src.end();
    await dst.end();
  }

  logger.info('Migration to new Supabase project complete');
}

migrate().catch((err) => {
  logger.fatal({ err }, 'Migration failed');
  process.exit(1);
});
