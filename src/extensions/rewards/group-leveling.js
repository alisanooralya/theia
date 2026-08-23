import { groupActivityModel } from '#storage/models/index.js'
import { userModel } from '#storage/models/index.js'
import { logger } from '#helpers/logger.js'

const XP_MIN = 15
const XP_MAX = 25
const COOLDOWN_MS = 120_000
const cooldown = new Map()

export default {
  name: 'group-leveling',

  async processMessage(parsed, sock) {
    if (!parsed.isGroup) return true
    if (!parsed.sender) return true
    try { const { groupModel } = await import('#storage/models/index.js'); groupModel.ensure(parsed.jid) } catch {}
    const userJid = parsed.sender
    try { userModel.ensure(userJid, { pushName: parsed.pushName || '' }) } catch {}
    const key = `${parsed.jid}:${userJid}`
    const now = Date.now()
    if (cooldown.has(key) && now - cooldown.get(key) < COOLDOWN_MS) return true
    cooldown.set(key, now)
    if (cooldown.size > 5000) {
      for (const [k, v] of cooldown) if (now - v > COOLDOWN_MS) cooldown.delete(k)
    }
    try {
      const xp = Math.floor(Math.random() * (XP_MAX - XP_MIN + 1)) + XP_MIN
      try { groupActivityModel.addXp(parsed.jid, userJid, xp) } catch {}
      const result = userModel.addExp(userJid, xp)
      if (result.leveledUp) {
        await sock.sendMessage(parsed.jid, {
          text: `🎉 Selamat @${userJid.split('@')[0]} naik ke *Level ${result.newLevel}* ! (${xp} XP)`,
          mentions: [userJid],
        }).catch(() => {})
      }
    } catch (err) {
      logger.warn({ err: err.message }, '[GroupLeveling] XP failed')
    }
    return true
  },
}
