import makeWASocket, {
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
} from 'baileys';
import NodeCache from 'node-cache';
import { useAuthState } from './authenticator.js';
import { registerEvents } from '#events/registry.js';
import { logger } from '#helpers/logger.js';
import SETTINGS from '#environment/settings.js';
import { GROUP_CACHE_TTL } from '#environment/limits.js';
import { createSendQueue } from '#network/send-queue.js';

const groupCache = new NodeCache({
  stdTTL: GROUP_CACHE_TTL / 1000,
  checkperiod: 120,
  useClones: false,
  maxKeys: 200,
});
const msgStore = new Map();

const MSG_STORE_MAX = 100;
export function storeMessage(msg) {
  if (!msg?.key?.id) return;
  msgStore.set(msg.key.id, msg.message);
  while (msgStore.size > MSG_STORE_MAX) {
    const first = msgStore.keys().next().value;
    if (!first) break;
    msgStore.delete(first);
  }
}

async function requestPairingCode(sock) {
  try {
    await sock.waitForConnectionUpdate(
      (update) => update.qr !== undefined,
      60_000
    );
  } catch (err) {
    logger.warn(
      { err },
      'Timed out waiting for pairing invitation, attempting anyway'
    );
  }

  const pairingCode = 'THEIABOT';
  const phoneNumber = SETTINGS.pairingNumber.replace(/[^0-9]/g, '');
  const raw = await sock.requestPairingCode(phoneNumber, pairingCode);
  const code = raw?.match(/.{1,4}/g)?.join('-') || raw || '';
  logger.info('Pairing code: %s', code);
}

export async function createClient() {
  const { state, saveCreds } = await useAuthState(SETTINGS.sessionPath);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(
        state.keys,
        logger.child({ name: 'signal', level: 'silent' })
      ),
    },
    logger: logger.child({ name: 'baileys', level: 'silent' }),
    browser: Browsers.ubuntu('Chrome'),
    markOnlineOnConnect: true,
    syncFullHistory: false,
    connectTimeoutMs: 60_000,
    defaultQueryTimeoutMs: 60_000,
    keepAliveIntervalMs: 10_000,
    generateHighQualityLinkPreview: true,
    getMessage: async (key) => msgStore.get(key.id),
    cachedGroupMetadata: async (jid) => groupCache.get(jid) ?? undefined,
  });

  sock._saveCreds = saveCreds;

  const originalSend = sock.sendMessage.bind(sock);
  const sendQueue = createSendQueue(originalSend, { rateLimitMs: 3_000 });
  sock.sendMessage = (jid, content, options) => sendQueue.enqueue(jid, content, options);
  sock.enqueueSend = sendQueue.enqueue;

  if (SETTINGS.pairingNumber && !sock.authState.creds.registered) {
    requestPairingCode(sock).catch((err) =>
      logger.error({ err }, 'Failed to request pairing code')
    );
  }

  registerEvents(sock, createClient);

  sock.ev.on('groups.update', (updates) => {
    for (const update of updates) {
      const cached = groupCache.get(update.id);
      if (cached) groupCache.set(update.id, { ...cached, ...update });
    }
  });

  const orig = sock.groupMetadata.bind(sock);
  sock.groupMetadata = async (jid) => {
    const meta = await orig(jid);

    groupCache.set(jid, meta);
    return meta;
  };

  return sock;
}
