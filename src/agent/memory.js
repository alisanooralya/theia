/**
 * Safe minimal in-memory conversation history for the AI Agent.
 *
 * Stores ONLY plain message text (user + assistant). Never stores API keys,
 * tokens, passwords, sessions, credentials, or raw message payloads.
 * Bounded per session (AGENT_MAX_HISTORY) and globally (evicts oldest first).
 *
 * Riwayat di-scope per user + per chat: konteks chat privat tidak bocor ke
 * grup, dan tiap grup punya riwayat terpisah.
 */
import SETTINGS from '#environment/settings.js';

const MAX_SESSIONS = 500;
const store = new Map(); // `${userId}:${chatJid}` -> [{ role, content }]

export function sessionKey(userId, chatJid) {
  return `${userId ?? 'unknown'}:${chatJid ?? userId ?? 'unknown'}`;
}

export function getHistory(key) {
  return store.get(key) ?? [];
}

export function pushHistory(key, role, content) {
  if (typeof content !== 'string' || !content.trim()) return;
  if (!store.has(key) && store.size >= MAX_SESSIONS) {
    store.delete(store.keys().next().value); // evict oldest session
  }
  const history = store.get(key) ?? [];
  history.push({ role, content: content.slice(0, 2000) });
  store.set(key, history.slice(-Math.max(SETTINGS.agentMaxHistory, 2)));
}

export function clearHistory(key) {
  store.delete(key);
}
