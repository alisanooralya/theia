/**
 * Safe minimal in-memory conversation history for the AI Agent.
 *
 * Stores ONLY plain message text (user + assistant). Never stores API keys,
 * tokens, passwords, sessions, credentials, or raw message payloads.
 * Bounded per user (AGENT_MAX_HISTORY) and globally (evicts oldest user first).
 */
import SETTINGS from '#environment/settings.js'

const MAX_USERS = 500
const store = new Map() // userId -> [{ role: 'user'|'assistant', content: string }]

export function getHistory(userId) {
  return store.get(userId) ?? []
}

export function pushHistory(userId, role, content) {
  if (typeof content !== 'string' || !content.trim()) return
  if (!store.has(userId) && store.size >= MAX_USERS) {
    store.delete(store.keys().next().value) // evict oldest user
  }
  const history = store.get(userId) ?? []
  history.push({ role, content: content.slice(0, 2000) })
  store.set(userId, history.slice(-Math.max(SETTINGS.agentMaxHistory, 2)))
}

export function clearHistory(userId) {
  store.delete(userId)
}