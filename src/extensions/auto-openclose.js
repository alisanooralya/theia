import { db } from '#storage/connection.js'
import { getSocket } from '#helpers/shutdown.js'
import { logger } from '#helpers/logger.js'

const WIB_OFFSET = 7
const TICK_MS = 30_000
const CLOSE_MIN = 23 * 60
const OPEN_MIN = 5 * 60
let timer = null
let lastCloseKey = null
let lastOpenKey = null

function wibMinutes() {
  const now = new Date()
  const wib = new Date(now.getTime() + WIB_OFFSET * 3_600_000)
  const dayKey = wib.toISOString().slice(0, 10)
  const minutes = wib.getUTCHours() * 60 + wib.getUTCMinutes()
  return { minutes, dayKey }
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

async function runForGroups(wantClosed) {
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
        const { minutes, dayKey } = wibMinutes()
        if (minutes >= CLOSE_MIN) {
          if (lastCloseKey !== dayKey) {
            lastCloseKey = dayKey
            runForGroups(true).catch(err => logger.warn({ err: err.message }, '[AutoOpenClose] close failed'))
          }
        } else if (minutes >= OPEN_MIN) {
          if (lastOpenKey !== dayKey) {
            lastOpenKey = dayKey
            runForGroups(false).catch(err => logger.warn({ err: err.message }, '[AutoOpenClose] open failed'))
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
    lastCloseKey = null
    lastOpenKey = null
  },
}
