export default {
  // ─── Bot Identity ───
  botName: 'TheiaBot',
  prefix: '.',

  // ─── Owner ───
  ownerNumber: ['6287760363490', '6283175202307', '6289514701687'],

  // ─── Login Mode ───
  pairingNumber: /*'6283872712735',*/ '6283879462232',

  // ─── Paths ───
  sessionPath: './sessions',
  dbPath: './data/database.db',

  // ─── Supabase (Postgres) ───
  supabaseDbUrl:
    'postgresql://postgres.ozqtfzftjronghtseosg:zP2hP7w21zlw7U1O@aws-0-us-east-2.pooler.supabase.com:6543/postgres',

  // ─── Auth Backend ───
  authBackend: 'sqlite',
  sessionId: 'default',

  // ─── Logging ───
  // 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'
  logLevel: 'info',

  // ─── Misc ───
  timezone: 'Asia/Jakarta',
  respondToSelf: false,
  ignoreBots: false,
  autoread: true,

  // ─── API Keys ───
  tiktokApiKey: 'Btz-ZEaRQ',
};
