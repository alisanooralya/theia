import { jidNormalizedUser } from 'baileys'
import { parseMessage } from '#messages/parser.js'
import { dispatch } from '#messages/dispatcher.js'
import { logger } from '#helpers/logger.js'
import { isStatus } from '#helpers/identifier.js'
import { orchestrator } from '#extensions/lifecycle/orchestrator.js'
import { aiService } from '#features/ai.js'
import { agentService } from '#agent/index.js'
import SETTINGS from '#environment/settings.js'

export async function onMessagesUpsert({ messages, type }, sock) {
  if (type !== 'notify') return

  for (const msg of messages) {
    try {
      if (!msg.message) continue
      if (isStatus(msg.key?.remoteJid)) continue

      const parsed = await parseMessage(msg, sock)
      if (!parsed) continue
      if (parsed.fromMe && !SETTINGS.respondToSelf) continue

      if (SETTINGS.autoread) {
        await sock.readMessages([msg.key]).catch(() => {})
      }

      logger.trace({ jid: parsed.jid, type: parsed.type }, 'Message received')

      const proceed = await orchestrator.runProcessors(parsed, sock)
      if (!proceed) continue

      const botId = jidNormalizedUser(sock.user?.id)
      const isMentioned = botId && parsed.mentions?.includes(botId)
      const isRepliedToBot = botId && parsed.quoted?.sender === botId
      const isTriggered = isMentioned || isRepliedToBot
      const isCommand = parsed.text?.startsWith(SETTINGS.prefix) ?? false

      const hasMediaTrigger = parsed.isMedia || parsed.quoted?.isMedia
      if (agentService.isEnabled() && (parsed.text || hasMediaTrigger) && !isCommand && (parsed.isGroup ? isTriggered : true)) {
        await agentService.handleMessage(parsed, msg, sock)
        continue
      }

      // Legacy mention-AI chat — only when the agent is disabled.
      if (isMentioned && parsed.text && !isCommand) {
        if (aiService.isAvailable()) {
          const prompt = parsed.text.replace(new RegExp(`@${botId?.split('@')[0]}`, 'g'), '').trim()
          if (prompt) {
            try {
              const response = await aiService.chat(prompt)
              await sock.sendMessage(parsed.jid, { text: response }, { quoted: msg })
            } catch (err) {
              logger.warn({ err }, 'AI response failed')
            }
          }
        } else {
          await sock.sendMessage(parsed.jid, {
            text: `Halo! Ketik ${SETTINGS.prefix}help untuk lihat command.`,
          }, { quoted: msg })
        }
        continue
      }

      await dispatch(parsed, sock)
    } catch (err) {
      logger.error({ err, msgId: msg.key?.id }, 'Message handler error')
    }
  }
}
