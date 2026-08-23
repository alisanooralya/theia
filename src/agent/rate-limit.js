/**
 * Per-user throttling for the AI Agent (in-memory, mirrors guards/throttles style).
 * Two independent gates:
 *  - cooldown: min interval between agent calls per user
 *  - window:   max agent calls per user per sliding-ish window
 * Owners bypass both (consistent with the command rate-limiter).
 */
import NodeCache from 'node-cache'
import SETTINGS from '#environment/settings.js'

const windowCache = new NodeCache({
  stdTTL: Math.max(SETTINGS.agentRateLimitWindow, 1),
  checkperiod: 30, useClones: false, maxKeys: 5000,
})
const cooldownCache = new NodeCache({
  stdTTL: Math.max(Math.ceil(SETTINGS.agentCooldownMs / 1000), 1),
  checkperiod: 30, useClones: false, maxKeys: 5000,
})

export function allowAgentCall(userId, isOwner = false) {
  if (isOwner) return { allowed: true }

  if (cooldownCache.get(userId)) {
    return { allowed: false, message: 'Sabarlah, AI butuh jeda sebentar sebelum merespons lagi.' }
  }
  cooldownCache.set(userId, Date.now())

  const count = (windowCache.get(userId) ?? 0) + 1
  windowCache.set(userId, count)
  if (count > SETTINGS.agentRateLimitMax) {
    return { allowed: false, message: 'Kamu terlalu banyak memanggil AI. Tunggu beberapa saat.' }
  }
  return { allowed: true }
}