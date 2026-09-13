import { resolve } from 'path';
import config from './config.js';

const root = process.cwd();

const SETTINGS = Object.freeze({
  botName: config.botName,
  prefix: config.prefix,
  sessionPath: resolve(root, config.sessionPath),
  dbPath: resolve(root, config.dbPath),
  supabaseDbUrl: process.env.SUPABASE_DB_URL || '',
  logLevel: config.logLevel,
  timezone: config.timezone,
  respondToSelf: !!config.respondToSelf,
  ignoreBots: config.ignoreBots !== false,
  autoread: !!config.autoread,

  pairingNumber: String(config.pairingNumber || '').replace(/\D/g, '') || null,

  ownerNumber: (Array.isArray(config.ownerNumber)
    ? config.ownerNumber
    : String(config.ownerNumber || '').split(',')
  )
    .map((n) => String(n).trim())
    .filter(Boolean)
    .map((n) => `${n.replace(/\D/g, '')}@s.whatsapp.net`),

  authBackend: config.authBackend === 'sqlite' ? 'sqlite' : 'file',
  sessionId: config.sessionId ?? 'default',

  tiktokApiKey: process.env.TIKTOK_API_KEY || '',

  fregatewayApiKey: process.env.FREGATEWAY_API_KEY || '',
});

export default SETTINGS;
