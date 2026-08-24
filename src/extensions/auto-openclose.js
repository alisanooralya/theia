import { db } from '#storage/connection.js'
import { getSocket } from '#helpers/shutdown.js'
import { logger } from '#helpers/logger.js'

const WIB_OFFSET = 7
const TICK_MS = 30_000
const CLOSE_HOUR = 23
const OPEN_HOUR = 5
let timer = null
let lastKey = null

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

async function applyState(jid, wantClosed) {
  const sock = getSocket()
  if (!sock) return
  try {
    const meta = await sock.groupMetadata(jid)
    const isClosed = !!meta.announce
    if (wantClosed === isClosed) return
    await sock.groupSettingUpdate(jid, wantClosed ? 'announcement' : 'not_announcement')
    logger.info({ jid, wantClosed }, '[AutoOpenClose] group updated')
  } catch (err) {
    logger.warn({ err: err.message, jid }, '[AutoOpenClose] update failed')
  }
}

async function runForHour(wantClosed) {
  const groups = db.prepare('SELECT jid FROM groups WHERE openclose = 1').all()
  for (const { jid } of groups) {
    await applyState(jid, wantClosed)
  }
}

export default {
  name: 'auto-openclose',

  init() {
    timer = setInterval(() => {
      try {
        const { hour, minute, dayKey } = wibParts()
        if (minute !== 0) return
        if (hour === CLOSE_HOUR) {
          const key = `${dayKey}:close`
          if (lastKey !== key) {
            lastKey = key
            runForHour(true).catch(err => logger.warn({ err: err.message }, '[AutoOpenClose] close failed'))
          }
        } else if (hour === OPEN_HOUR) {
          const key = `${dayKey}:open`
          if (lastKey !== key) {
            lastKey = key
            runForHour(false).catch(err => logger.warn({ err: err.message }, '[AutoOpenClose] open failed'))
          }
        }
      } catch (err) {
        logger.warn({ err: err.message }, '[AutoOpenClose] tick failed')
      }
    }, TICK_MS)
    logger.info('[AutoOpenClose] Initialized — close 23:00, open 05:00 WIB')
  },

  destroy() {
    if (timer) clearInterval(timer)
    timer = null
  },
}
