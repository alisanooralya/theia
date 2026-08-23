import { logger } from '#helpers/logger.js'

const MAX_PER_GROUP = 100
const buffers = new Map()

export function getRecentMessages(jid, limit = 50) {
  const buf = buffers.get(jid) ?? []
  return buf.slice(-limit)
}

export default {
  name: 'group-logger',
  async init() {
    logger.info('[GroupLogger] Initialized — 100 msg/grup')
  },
  async processMessage(parsed) {
    if (!parsed.isGroup) return true
    if (!parsed.text) return true
    const text = parsed.text.trim().slice(0, 200)
    if (!text) return true
    let buf = buffers.get(parsed.jid)
    if (!buf) {
      buf = []
      buffers.set(parsed.jid, buf)
    }
    buf.push({ sender: parsed.pushName || parsed.sender.split('@')[0], text, ts: Date.now() })
    if (buf.length > MAX_PER_GROUP) buf.shift()
    if (buffers.size > 500) {
      const first = buffers.keys().next().value
      buffers.delete(first)
    }
    return true
  },
}
