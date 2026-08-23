import { useMultiFileAuthState } from 'baileys'
import { mkdir } from 'fs/promises'
import SETTINGS from '#environment/settings.js'
import { logger } from '#helpers/logger.js'

export async function useAuthState(sessionPath) {
  if (SETTINGS.authBackend === 'sqlite') {
    const { useSQLiteAuthState } = await import('./sqlite-store.js')
    return useSQLiteAuthState(SETTINGS.sessionId)
  }

  await mkdir(sessionPath, { recursive: true })
  logger.debug({ sessionPath }, 'Auth: file-based (dev)')
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath)
  return { state, saveCreds }
}
