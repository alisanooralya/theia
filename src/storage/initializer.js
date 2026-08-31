import { configureDatabase } from './connection.js';
import { createSchema } from './definitions.js';
import { logger } from '#helpers/logger.js';

export async function initializeDatabase() {
  try {
    configureDatabase();
    await createSchema();
    logger.info('Database initialized');
  } catch (err) {
    throw err;
  }
}
