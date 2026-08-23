import pino from 'pino'
import pretty from 'pino-pretty'
import SETTINGS from '#environment/settings.js'

const pinoOptions = {
  level: SETTINGS.logLevel,
  base: { name: 'theia' },
  redact: {
    paths: [
      'key', '*.key', 'apiKey', '*.apiKey',
      'secret', '*.secret', 'password', '*.password',
      'token', '*.token', 'authorization', '*.authorization',
    ],
    censor: '***REDACTED***',
  },
}

function plainLogger() {
  if (process.stdout.isTTY) {
    const stream = pretty({
      colorize: true,
      translateTime: 'SYS:HH:MM:ss',
      ignore: 'pid,hostname',
      messageFormat: '[{name}] {msg}',
    })
    return pino(pinoOptions, stream)
  }

  return pino(pinoOptions, pino.destination({ dest: 1, sync: true }))
}

export const logger = plainLogger()
