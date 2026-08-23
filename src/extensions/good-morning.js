import { db } from '#storage/connection.js'
import { getSocket } from '#helpers/shutdown.js'
import { logger } from '#helpers/logger.js'

const WIB_OFFSET = 7
const TICK_MS = 30_000
let timer = null
let lastSentKey = null

function wibParts() {
  const now = new Date()
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000
  const wib = new Date(utcMs + WIB_OFFSET * 3_600_000)
  return {
    hour: wib.getHours(),
    minute: wib.getMinutes(),
    dayKey: wib.toISOString().slice(0, 10),
  }
}

async function sendGoodMorning() {
  const sock = getSocket()
  if (!sock) return
  const groups = db.prepare('SELECT jid FROM groups').all()
  for (const { jid } of groups) {
    try {
      const meta = await sock.groupMetadata(jid)
      const mentions = meta.participants.map(p => p.id)
      if (!mentions.length) continue
      const text = '🌅 *Selamat pagi semua!* Semoga harinya menyenangkan. ☀️'
      const chunked = []
      for (let i = 0; i < mentions.length; i += 30) {
        chunked.push(mentions.slice(i, i + 30))
      }
      for (const chunk of chunked) {
        await sock.sendMessage(jid, { text, mentions: chunk }).catch(() => {})
      }
    } catch (err) {
      logger.warn({ err: err.message, jid }, '[GoodMorning] group failed')
    }
  }
}

export default {
  name: 'good-morning',

  init() {
    timer = setInterval(() => {
      try {
        const { hour, minute, dayKey } = wibParts()
        if (hour === 7 && minute === 0 && lastSentKey !== dayKey) {
          lastSentKey = dayKey
          sendGoodMorning().catch(err => logger.warn({ err: err.message }, '[GoodMorning] failed'))
        }
      } catch (err) {
        logger.warn({ err: err.message }, '[GoodMorning] tick failed')
      }
    }, TICK_MS)
    logger.info('[GoodMorning] Initialized — 07:00 WIB greeting')
  },

  destroy() {
    if (timer) clearInterval(timer)
    timer = null
  },
}
