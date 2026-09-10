export default {
  botName: 'TheiaBot',
  prefix: '.',

  ownerNumber: ['6287760363490', '6283175202307', '6289514701687'],

  pairingNumber: '6283872712735', // '6283879462232',

  sessionPath: './sessions',
  dbPath: './data/database.db',

  supabaseDbUrl:
    'postgresql://postgres.ozqtfzftjronghtseosg:zP2hP7w21zlw7U1O@aws-0-us-east-2.pooler.supabase.com:6543/postgres',

  authBackend: 'sqlite',
  sessionId: 'default',

  // 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'
  logLevel: 'warn',

  timezone: 'Asia/Jakarta',
  respondToSelf: false,
  ignoreBots: false,
  autoread: true,

  tiktokApiKey: 'Btz-ZEaRQ',
};
