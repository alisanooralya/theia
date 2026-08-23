/**
 * Core AI Agent loop.
 *
 * Flow: user message → intent understanding (Gemini) → tool selection →
 * permission check (server-side) → tool execution → real result back to model →
 * final natural-language response.
 *
 * The model has NO direct access to filesystem/DB — every action goes through
 * registered tools in src/agent/tools/. Loop is bounded by MAX_TOOL_CALLS.
 */
import { logger } from '#helpers/logger.js'
import SETTINGS from '#environment/settings.js'
import { geminiClient } from './gemini.js'
import { toolRegistry } from './tools/index.js'
import { canUseTool } from './permissions.js'
import { buildSystemPrompt } from './prompts.js'
import { allowAgentCall } from './rate-limit.js'
import { getHistory, pushHistory } from './memory.js'

const TOOL_RESULT_MAX = 4000 // chars of a tool result sent back to the model

export class Agent {
  /**
   * @param {object} agentCtx from buildAgentContext()
   * @param {string} userText cleaned user message
   * @returns {Promise<{ replied: boolean, text?: string, error?: string }>}
   */
  async run(agentCtx, userContent) {
    const gate = allowAgentCall(agentCtx.userId, agentCtx.isOwner)
    if (!gate.allowed) {
      return { replied: true, text: gate.message }
    }

    const userTextForHistory = Array.isArray(userContent)
      ? userContent.filter(p => p.type === 'text').map(p => p.text).join(' ') || '[media]'
      : String(userContent ?? '')

    const messages = [
      { role: 'system', content: buildSystemPrompt(agentCtx) },
      ...getHistory(agentCtx.userId),
      { role: 'user', content: userContent },
    ]

    let toolCallsUsed = 0

    try {
      let res = await geminiClient.chat({ messages, tools: toolRegistry.schemas() })

      while ((res.toolCalls?.length ?? 0) > 0) {
        const remaining = SETTINGS.agentMaxToolCalls - toolCallsUsed
        const batch = res.toolCalls.slice(0, Math.max(remaining, 0))

        if (batch.length === 0) {
          // Budget exhausted — force a wrap-up without further tools.
          messages.push({ role: 'assistant', content: res.content || null, tool_calls: res.toolCalls })
          messages.push({
            role: 'tool',
            tool_call_id: res.toolCalls[0].id ?? 'limit',
            content: JSON.stringify({ success: false, error: 'Batas tool calls tercapai. Rangkum hasil yang sudah ada.' }),
          })
          res = await geminiClient.chat({ messages, tools: [] })
          break
        }

        toolCallsUsed += batch.length
        messages.push({ role: 'assistant', content: res.content || null, tool_calls: batch })

        for (const tc of batch) {
          const result = await this._executeToolCall(agentCtx, tc)
          messages.push({ role: 'tool', tool_call_id: tc.id ?? 'unknown', content: JSON.stringify(result) })
        }

        res = await geminiClient.chat({ messages, tools: toolRegistry.schemas() })
      }

      const finalText = (res.content ?? '').trim()
      if (!finalText) throw new Error('Gemini: respons kosong.')

      pushHistory(agentCtx.userId, 'user', userTextForHistory)
      pushHistory(agentCtx.userId, 'assistant', finalText)
      return { replied: true, text: finalText }
    } catch (err) {
      logger.warn({ err: err.message, userId: agentCtx.userId }, 'Agent run failed')
      return { replied: true, text: this._friendlyError(err) }
    }
  }

  async _executeToolCall(agentCtx, toolCall) {
    const name = toolCall?.function?.name
    let args
    try {
      args = JSON.parse(toolCall?.function?.arguments ?? '{}')
    } catch {
      return { success: false, error: 'Argumen tool tidak valid (bukan JSON).' }
    }
    if (typeof args !== 'object' || args === null) {
      return { success: false, error: 'Argumen tool tidak valid.' }
    }

    const tool = toolRegistry.get(name)
    if (!tool) {
      return { success: false, error: `Tool tidak dikenal: ${name}` }
    }

    // Server-side permission enforcement — never prompt-only.
    if (!canUseTool(agentCtx.level, tool)) {
      return { success: false, error: 'Akses ditolak: tool ini memerlukan permission lebih tinggi.' }
    }

    try {
      const out = await tool.execute(args, agentCtx)
      return this._normalizeResult(out)
    } catch (err) {
      logger.warn({ err: err.message, tool: name }, 'Agent tool failed')
      return { success: false, error: err.message || 'Tool gagal dieksekusi.' }
    }
  }

  _normalizeResult(out) {
    const result = out && typeof out === 'object'
      ? out
      : { success: Boolean(out), message: String(out ?? '') }

    const json = JSON.stringify(result)
    if (json.length > TOOL_RESULT_MAX) {
      return {
        success: result.success ?? false,
        message: `${result.message ?? ''} [hasil dipotong]`.slice(0, TOOL_RESULT_MAX),
      }
    }
    return result
  }

  _friendlyError(err) {
    const msg = err?.message ?? ''
    if (/AI tidak tersedia|API key|konfigurasi/i.test(msg)) {
      return 'AI agent belum dikonfigurasi. Minta owner mengisi GEMINI_API_KEY di .env.'
    }
    if (msg.includes('tool calls')) return 'Permintaan terlalu kompleks. Coba pecah menjadi langkah yang lebih sederhana.'
    return `Maaf, ada kendala: ${msg}`
  }
}

export const agent = new Agent()