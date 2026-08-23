/**
 * Gemini client — Google's official OpenAI-compatible endpoint.
 * Endpoint: POST https://generativelanguage.googleapis.com/v1beta/openai/chat/completions
 * The API key is read from SETTINGS (env) and is NEVER logged or embedded in prompts.
 */
import axios from 'axios'
import { logger } from '#helpers/logger.js'
import SETTINGS from '#environment/settings.js'

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'

export class GeminiClient {
  isConfigured() {
    return !!SETTINGS.geminiKey
  }

  /**
   * @param {object} opts
   * @param {Array<{role:string, content:string}>} opts.messages OpenAI-style messages
   * @param {Array<object>} [opts.tools] OpenAI-style tool schemas
   * @returns {Promise<{ content: string, toolCalls: Array, raw: object }>}
   */
  async chat({ messages, tools = [] }) {
    const body = {
      model: SETTINGS.geminiModel,
      messages,
      reasoning_effort: 'low',
      temperature: 0.7,
      max_tokens: 1024,
    }
    if (tools.length) body.tools = tools

    let data
    try {
      const res = await axios.post(GEMINI_URL, body, {
        headers: {
          Authorization: `Bearer ${SETTINGS.geminiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: SETTINGS.agentTimeoutMs,
      })
      data = res.data
    } catch (err) {
      throw this._mapError(err)
    }

    const choice = data?.choices?.[0]
    if (!choice?.message) {
      logger.error({ snippet: String(data).slice(0, 200) }, 'Gemini: unexpected response shape')
      throw new Error('Gemini: respons tidak sesuai format.')
    }

    return {
      content: choice.message.content ?? '',
      toolCalls: Array.isArray(choice.message.tool_calls) ? choice.message.tool_calls : [],
      raw: data,
    }
  }

  _mapError(err) {
    const status = err?.response?.status
    if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
      return new Error('Waktu permintaan AI habis (timeout). Coba lagi.')
    }
    if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED' || err.code === 'ENETUNREACH') {
      return new Error('Gagal terhubung ke layanan AI. Cek koneksi internet.')
    }
    switch (status) {
      case 400: return new Error('Permintaan AI ditolak (400). Cek konfigurasi model/tools di .env.')
      case 401: return new Error('API key Gemini tidak valid.')
      case 403: return new Error('Akses ke API Gemini ditolak (403). Cek izin API key.')
      case 429: return new Error('Rate limit API tercapai. Coba lagi nanti.')
      default: break
    }
    logger.warn({ status, snippet: String(err?.response?.data ?? err.message).slice(0, 200) }, 'Gemini request failed')
    return new Error('Layanan AI sedang bermasalah. Coba lagi.')
  }
}

export const geminiClient = new GeminiClient()
