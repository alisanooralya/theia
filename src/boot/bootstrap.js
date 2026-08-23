import { commandRegistry } from '#commands/registry.js'
import { orchestrator } from '#extensions/lifecycle/orchestrator.js'
import { initializeDatabase } from '#storage/initializer.js'
import { loadCommands, loadExtensions } from '#commands/loader.js'
import { createClient } from '#network/client.js'
import { setSocket } from '#helpers/shutdown.js'
import SETTINGS from '#environment/settings.js'
import { logger } from '#helpers/logger.js'
import { createRequire } from 'module'
const rf = createRequire(import.meta.url)
const APP_VERSION = rf('../../package.json').version

export async function bootstrap() {
  let cmdCount = 0, extCount = 0, dbOk = false, aiProvider = 'none'

  try {
    await initializeDatabase()
    dbOk = true
    logger.info('[Boot] Database ready')
  } catch (err) {
    logger.fatal({ err }, '[Boot] Database setup failed')
    process.exit(1)
  }

  try {
    await loadCommands()
    cmdCount = commandRegistry.count()
    await loadExtensions()
    extCount = orchestrator.count()
    logger.info('[Boot] Commands & extensions loaded')
  } catch (err) {
    logger.fatal({ err }, '[Boot] Failed to load commands/extensions')
    process.exit(1)
  }

  try {
    if (SETTINGS.openaiKey) aiProvider = 'OpenAI'
    else if (SETTINGS.anthropicKey) aiProvider = 'Anthropic'
    else if (SETTINGS.groqKey) aiProvider = 'Groq'
  } catch {}

  try {
    const sock = await createClient()
    setSocket(sock)
    logger.info('[Boot] Socket created & events bound')

    return sock
  } catch (err) {
    logger.fatal({ err }, '[Boot] Failed to create socket')
    process.exit(1)
  }
}
