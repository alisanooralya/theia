import postgres from 'postgres';
import SETTINGS from '#environment/settings.js';
import { logger } from '#helpers/logger.js';

const DATABASE_URL = SETTINGS.supabaseDbUrl;

if (!DATABASE_URL) {
  logger.fatal('supabaseDbUrl belum dikonfigurasi di src/environment/config.js');
  process.exit(1);
}

export const sql = postgres(DATABASE_URL, {
  max: 10,
  idle_timeout: 20,
  connect_timeout: 10,
  ssl: { rejectUnauthorized: false },
  onnotice: (notice) => {
    const severity = notice?.severity ?? '';
    if (severity === 'NOTICE' || severity === 'INFO') return;
    logger.warn({ err: notice }, 'Database notice');
  },
});

export function configureDatabase() {
  logger.info('Database connected (Supabase/Postgres)');
}

export async function closeDatabase() {
  try {
    await sql.end();
  } catch {}
}
