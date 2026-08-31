import { resolve } from 'path';
import config from './config.js';

const root = process.cwd();

const SETTINGS = Object.freeze({
  botName: config.botName,
  prefix: config.prefix,
  sessionPath: resolve(root, config.sessionPath),
  dbPath: resolve(root, config.dbPath),
  supabaseDbUrl: config.supabaseDbUrl || '',
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

  openaiKey: config.openaiKey || '',
  openaiModel: config.openaiModel || 'gpt-4o-mini',
  anthropicKey: config.anthropicKey || '',
  anthropicModel: config.anthropicModel || 'claude-haiku-4-5',
  groqKey: config.groqKey || '',
  groqModel: config.groqModel || 'llama-3.1-8b-instant',

  geminiKey: config.geminiKey || '',
  geminiModel: config.geminiModel || 'gemini-3.6-flash',
  aiAgentEnabled: !!config.aiAgentEnabled,

  agentMaxToolCalls: parseInt(config.agentMaxToolCalls, 10),
  agentRateLimitMax: parseInt(config.agentRateLimitMax, 10),
  agentRateLimitWindow: parseInt(config.agentRateLimitWindow, 10),
  agentCooldownMs: parseInt(config.agentCooldownMs, 10),
  agentTimeoutMs: parseInt(config.agentTimeoutMs, 10),
  agentMaxHistory: parseInt(config.agentMaxHistory, 10),
});

export default SETTINGS;
