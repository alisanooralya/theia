import { configureDatabase } from './connection.js';
import { createSchema } from './definitions.js';
import { logger } from '#helpers/logger.js';

export async function initializeDatabase() {
  configureDatabase();
  await createSchema();
  logger.info('Database initialized');
}
