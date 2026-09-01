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
  supabaseDbUrl: 'postgresql://postgres.epaydshzbasgkbwmgkij:AfbT7hHFafYXXIrJ@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres',
    /*'postgresql://postgres.awsqisxfvenzvbmimqow:theia123%23%24%40@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres', */

  // ─── Auth Backend ───
  authBackend: 'sqlite',
  sessionId: 'default',

  // ─── AI Provider (isi salah satu) ───
  openaiKey: '',
  openaiModel: 'gpt-4o-mini',
  anthropicKey: '',
  anthropicModel: 'claude-haiku-4-5',
  groqKey: '',
  groqModel: 'llama-3.1-8b-instant',

  // ─── AI Agent ───
  // Key Gemini: https://aistudio.google.com/apikey
  aiAgentEnabled: false,
  geminiKey: '',
  geminiModel: 'gemini-3.6-flash',
  agentMaxToolCalls: 5,
  agentRateLimitMax: 10,
  agentRateLimitWindow: 60,
  agentCooldownMs: 5000,
  agentTimeoutMs: 30000,
  agentMaxHistory: 6,

  // ─── Logging ───
  // 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'
  logLevel: 'info',

  // ─── Misc ───
  timezone: 'Asia/Jakarta',
  respondToSelf: false,
  ignoreBots: false,
  autoread: false,
};
