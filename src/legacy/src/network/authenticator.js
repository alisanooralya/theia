import { useMultiFileAuthState } from 'baileys';
import { mkdir } from 'fs/promises';
import SETTINGS from '#environment/settings.js';

export async function useAuthState(sessionPath) {
  if (SETTINGS.authBackend === 'sqlite') {
    const { useSQLiteAuthState } = await import('./sqlite-store.js');
    return useSQLiteAuthState(SETTINGS.sessionId);
  }

  await mkdir(sessionPath, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
  return { state, saveCreds };
}
