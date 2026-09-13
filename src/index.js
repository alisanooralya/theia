import 'dotenv/config';

import dns from 'dns';
import { fileURLToPath } from 'url';
import { resolve } from 'path';
import { bootstrap } from '#boot/bootstrap.js';
import { logger } from '#helpers/logger.js';
import { setupShutdown } from '#helpers/shutdown.js';

// Prefer IPv4 untuk menghindari connection reset di environment tertentu.
try {
  dns.setDefaultResultOrder('ipv4first');
} catch {
  // Node < 20 tidak punya method ini; abaikan.
}

const isMain =
  !!process.env.pm_id ||
  resolve(process.argv[1] || '') === fileURLToPath(import.meta.url);

if (isMain) {
  process.on('uncaughtException', (err) => {
    try {
      logger.fatal({ err }, 'Uncaught');
    } catch {
      process.stderr.write(`FATAL: ${err.stack}\n`);
    }
    process.exit(1);
  });
  process.on('unhandledRejection', (err) => {
    try {
      logger.fatal({ err }, 'Unhandled rejection');
    } catch {
      process.stderr.write(`REJECTION: ${err}\n`);
    }
    process.exit(1);
  });

  setupShutdown();

  bootstrap().catch((err) => {
    try {
      logger.fatal({ err }, 'FATAL');
    } catch {
      process.stderr.write(`FATAL: ${err.stack}\n`);
    }
    process.exit(1);
  });
}

export { bootstrap } from '#boot/bootstrap.js';
