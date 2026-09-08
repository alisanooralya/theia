import { commandRegistry } from '#commands/registry.js';
import { orchestrator } from '#extensions/lifecycle/orchestrator.js';
import { initializeDatabase } from '#storage/initializer.js';
import { loadCommands, loadExtensions } from '#commands/loader.js';
import { createClient } from '#network/client.js';
import { setSocket } from '#helpers/shutdown.js';
import { logger } from '#helpers/logger.js';

export async function bootstrap() {
  try {
    await initializeDatabase();
    logger.info('[Boot] Database ready');
  } catch (err) {
    logger.fatal({ err }, '[Boot] Database setup failed');
    process.exit(1);
  }

  try {
    await loadCommands();
    const cmdCount = commandRegistry.count();
    await loadExtensions();
    const extCount = orchestrator.count();
    logger.info(
      '[Boot] Commands & extensions loaded (%d commands, %d extensions)',
      cmdCount,
      extCount
    );
  } catch (err) {
    logger.fatal({ err }, '[Boot] Failed to load commands/extensions');
    process.exit(1);
  }

  try {
    const sock = await createClient();
    setSocket(sock);
    logger.info('[Boot] Socket created & events bound');

    return sock;
  } catch (err) {
    logger.fatal({ err }, '[Boot] Failed to create socket');
    process.exit(1);
  }
}
