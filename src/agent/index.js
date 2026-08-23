/**
 * Public entry point for the AI Agent feature.
 *
 * Enabled only when BOTH AI_AGENT_ENABLED=true and GEMINI_API_KEY are set.
 * When disabled, the bot behaves exactly as before (legacy mention-AI path,
 * commands only) — the agent is purely additive.
 */
import SETTINGS from '#environment/settings.js'
import { agent } from './agent.js'
import { buildAgentContext } from './context.js'
import { downloadMedia, buildMultimodalContent } from './media.js'
import { logger } from '#helpers/logger.js'

export const agentService = {
  isEnabled() {
    return SETTINGS.aiAgentEnabled && !!SETTINGS.geminiKey
  },

  /**
   * Handle one natural-language message through the agent.
   * @param {object} parsed from messages/parser.js
   * @param {object} msg raw Baileys message (for quoting)
   * @param {object} sock WhatsApp socket
   */
  async handleMessage(parsed, msg, sock) {
    const text = (parsed.text ?? '').replace(/@\d+/g, '').trim()
    let media = null
    try {
      media = await downloadMedia(parsed, msg)
    } catch (err) {
      await sock.sendMessage(parsed.jid, { text: err.message }, { quoted: msg }).catch(() => {})
      return
    }
    if (!text && !media) return

    const userContent = media ? buildMultimodalContent(text, media) : text

    const agentCtx = buildAgentContext(parsed, sock)
    await agentCtx.typing().catch(() => {})

    const result = await agent.run(agentCtx, userContent)
    await agentCtx.stopTyping().catch(() => {})

    if (result.text) {
      await sock.sendMessage(parsed.jid, { text: result.text }, { quoted: msg }).catch(err => {
        logger.warn({ err: err.message }, 'Agent reply send failed')
      })
    } else if (result.error) {
      await sock.sendMessage(parsed.jid, { text: result.error }, { quoted: msg }).catch(() => {})
    }
  },
}