import { db } from '#storage/connection.js'
import { getSocket } from '#helpers/shutdown.js'
import { logger } from '#helpers/logger.js'

const WIB_OFFSET = 7
const TICK_MS = 30_000
const CLOSE_TIME = '23:00'
const OPEN_TIME = '05:00'
let timer = null
let lastKey = null

function wibParts() {
  const now = new Date()
  const hour = (now.getUTCHours() + WIB_OFFSET) % 24
  const hhmm = `${String(hour).padStart(2, '0')}:${String(now.getUTCMinutes()).padStart(2, '0')}`
  const dayKey = new Date(now.getTime() + WIB_OFFSET * 3_600_000)
    .toISOString()
    .slice(0, 10)
  return { hhmm, dayKey }
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
        const { hhmm, dayKey } = wibParts()
        if (hhmm === CLOSE_TIME) {
          const key = `${dayKey}:close`
          if (lastKey !== key) {
            lastKey = key
            runForHour(true).catch(err => logger.warn({ err: err.message }, '[AutoOpenClose] close failed'))
          }
        } else if (hhmm === OPEN_TIME) {
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
    logger.info('[AutoOpenClose] Initialized — close 18:30, open 20:00 WIB')
  },

  destroy() {
    if (timer) clearInterval(timer)
    timer = null
  },
}
