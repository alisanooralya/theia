import { getRecentMessages } from '#extensions/logging/group-logger.js'
import { geminiClient } from '#agent/gemini.js'
import SETTINGS from '#environment/settings.js'

const COOLDOWN_MS = 5 * 60 * 1000
const lastRun = new Map()

export default {
  name: 'ringkas',
  aliases: ['summarize', 'rangkum'],
  category: 'group',
  description: 'Rangkum 50 pesan terakhir dengan AI',
  groupOnly: true,
  cooldown: 5000,
  async execute(ctx) {
    if (!geminiClient.isConfigured()) return ctx.reply('AI belum dikonfigurasi. Hubungi owner.')
    const now = Date.now()
    const cdKey = ctx.jid
    if (lastRun.has(cdKey) && now - lastRun.get(cdKey) < COOLDOWN_MS) {
      const sisa = Math.ceil((COOLDOWN_MS - (now - lastRun.get(cdKey))) / 60000)
      return ctx.reply(`Tunggu ${sisa} menit lagi sebelum ringkas lagi.`)
    }
    const lim = Math.min(Math.max(parseInt(ctx.args[0]) || 50, 10), 100)
    const msgs = getRecentMessages(ctx.jid, lim)
    if (msgs.length < 10) return ctx.reply(`Belum cukup pesan untuk diringkas. Perlu 10, baru ada ${msgs.length}.`)
    lastRun.set(cdKey, now)
    await ctx.react('⏳').catch(() => {})
    const chatLog = msgs.map(m => `${m.sender}: ${m.text}`).join('\n')
    const prompt = `Rangkum percakapan grup berikut jadi 5-7 poin penting. Bahasa Indonesia, singkat, pakai bullet:\n\n${chatLog}`
    try {
      const res = await geminiClient.chat({
        messages: [{ role: 'user', content: prompt }],
        tools: [],
      })
      const text = (res.content ?? '').trim() || 'Gagal meringkas.'
      await ctx.reply(`*Rangkuman ${msgs.length} pesan:*\n\n${text}`)
      await ctx.react('✅').catch(() => {})
    } catch (err) {
      await ctx.reply(`Gagal meringkas: ${err.message}`)
      await ctx.react('❌').catch(() => {})
    }
  },
}
