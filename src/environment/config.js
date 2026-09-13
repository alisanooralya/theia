export default {
  botName: 'TheiaBot',
  prefix: '.',

  ownerNumber: ['6287760363490', '6283175202307', '6289514701687'],

  pairingNumber: '6283872712735', // '6283879462232',

  sessionPath: './sessions',
  dbPath: './data/database.db',

  // Diisi via environment variable SUPABASE_DB_URL.
  // Contoh: SUPABASE_DB_URL=postgresql://postgres.xxx:password@host:6543/postgres
  supabaseDbUrl: process.env.SUPABASE_DB_URL || '',

  authBackend: 'sqlite',
  sessionId: 'default',

  // 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'
  logLevel: 'warn',

  timezone: 'Asia/Jakarta',
  respondToSelf: false,
  ignoreBots: false,
  autoread: true,

  // Diisi via environment variable TIKTOK_API_KEY.
  // Contoh: TIKTOK_API_KEY=Btz-ZEaRQ
  tiktokApiKey: process.env.TIKTOK_API_KEY || '',

  // Diisi via environment variable OPENROUTER_API_KEY (lihat settings.js).
  // Jangan hardcode API key di sini.
  openrouterApiKey: '',
};
