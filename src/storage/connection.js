import postgres from 'postgres';
import SETTINGS from '#environment/settings.js';
import { logger } from '#helpers/logger.js';

// TEST_DATABASE_URL (local Postgres) overrides Supabase for fast local tests.
const DATABASE_URL = process.env.TEST_DATABASE_URL || SETTINGS.supabaseDbUrl;
const isLocalDb = /^postgres(?:ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1)[/:?]/.test(
  DATABASE_URL
);

if (!DATABASE_URL) {
  logger.fatal(
    'supabaseDbUrl belum dikonfigurasi di src/environment/config.js'
  );
  process.exit(1);
}

export const sql = postgres(DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  prepare: false,
  ssl: isLocalDb ? false : { rejectUnauthorized: false },
  onnotice: (notice) => {
    const severity = notice?.severity ?? '';
    if (severity === 'NOTICE' || severity === 'INFO') return;
    logger.warn({ err: notice }, 'Database notice');
  },
});

let keepAliveTimer = null;

export function configureDatabase() {
  logger.info('Database connected (Supabase/Postgres)');
  startKeepAlive();
}

function startKeepAlive() {
  if (keepAliveTimer) return;
  keepAliveTimer = setInterval(() => {
    sql`SELECT 1`.catch(() => {});
  }, 30_000);
  if (keepAliveTimer.unref) keepAliveTimer.unref();
}

export async function closeDatabase() {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer);
    keepAliveTimer = null;
  }
  try {
    await sql.end();
  } catch (err) {
    logger.warn({ err }, 'Database close failed');
  }
}
