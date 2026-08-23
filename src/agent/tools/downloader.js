/**
 * Downloader tools — reuse the existing platform services
 * (src/features/platforms/{tiktok,instagram,facebook,youtube}.js) exactly like
 * the !tiktok / !instagram / !facebook / !youtube commands do.
 *
 * Tools send the media directly to the chat via agentCtx.sendMedia, then report
 * the REAL result back to the model. The AI never fabricates download results.
 */
import { tiktokService } from '#features/platforms/tiktok.js'
import { instagramService } from '#features/platforms/instagram.js'
import { facebookService } from '#features/platforms/facebook.js'
import { youtubeService } from '#features/platforms/youtube.js'
import { downloaderService } from '#features/downloader.js'

const MAX_MEDIA_BYTES = 60 * 1024 * 1024 // WhatsApp media limit ~64MB, keep headroom
const MAX_SLIDES = 10

const URL_PATTERNS = {
  tiktok: /(?:vt|vm)\.tiktok\.com\/|tiktok\.com\/.+\/video\//i,
  instagram: /instagram\.com\/(?:p|reel|reels|tv)\//i,
  facebook: /(?:facebook\.com\/|fb\.watch\/|fb\.com\/)/i,
  youtube: /(?:youtu\.be\/|youtube\.com\/(?:watch|embed|shorts|v)\/)/i,
}

function validateUrl(url, platform) {
  const raw = String(url ?? '').trim()
  if (!raw) return { ok: false, error: `URL ${platform} tidak diberikan — minta user mengirim link-nya.` }
  if (!/^https?:\/\//i.test(raw)) return { ok: false, error: `URL ${platform} tidak valid (harus diawali http/https).` }
  const key = platform.toLowerCase()
  if (!URL_PATTERNS[key]?.test(raw)) return { ok: false, error: `URL bukan link ${platform} yang valid.` }
  return { ok: true, url: raw }
}

function guardSize(buf) {
  if (buf.length > MAX_MEDIA_BYTES) throw new Error('File terlalu besar untuk dikirim ke WhatsApp (maks 60MB).')
}

export const downloaderTools = [
  {
    name: 'download_tiktok',
    description: 'Download video/slideshow/audio dari link TikTok (tanpa watermark) dan kirim ke chat.',
    permission: 'user',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Link TikTok lengkap, contoh: https://vt.tiktok.com/xxx atau https://www.tiktok.com/@user/video/123' },
      },
      required: ['url'],
      additionalProperties: false,
    },
    async execute(args, ctx) {
      const { ok, url, error } = validateUrl(args.url, 'TikTok')
      if (!ok) return { success: false, error }
      try {
        const result = await tiktokService.resolve(url)
        if (result.type === 'video') {
          const buf = await tiktokService.toBuffer(result.url, result._cookie)
          guardSize(buf)
          await ctx.sendMedia('video', buf, `🎵 ${result.title || ''}\n👤 ${result.author || ''}`, { mimetype: 'video/mp4' })
        } else if (result.type === 'slideshow') {
          for (const imgUrl of result.images.slice(0, MAX_SLIDES)) {
            const buf = await downloaderService.toBuffer(imgUrl)
            guardSize(buf)
            await ctx.sendMedia('image', buf, `📸 ${result.title}\n👤 ${result.author}`)
          }
        } else if (result.type === 'audio') {
          const buf = await tiktokService.toBuffer(result.url, result._cookie)
          guardSize(buf)
          await ctx.sendMedia('audio', buf, `🎵 ${result.title}\n👤 ${result.author}`, { mimetype: 'audio/mpeg', ptt: false })
        } else {
          return { success: false, error: 'Jenis media TikTok tidak dikenali.' }
        }
        return { success: true, message: 'Media TikTok berhasil dikirim.', data: { type: result.type, title: result.title || null, author: result.author || null } }
      } catch (err) {
        return { success: false, error: err.message || 'Gagal mengunduh TikTok.' }
      }
    },
  },
  {
    name: 'download_instagram',
    description: 'Download media Instagram (post/reel/carousel) dan kirim ke chat.',
    permission: 'user',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Link Instagram lengkap, contoh: https://www.instagram.com/reel/xxx' },
      },
      required: ['url'],
      additionalProperties: false,
    },
    async execute(args, ctx) {
      const { ok, url, error } = validateUrl(args.url, 'Instagram')
      if (!ok) return { success: false, error }
      try {
        const result = await instagramService.resolve(url)
        if (result.type === 'carousel') {
          for (const item of result.items.slice(0, MAX_SLIDES)) {
            const buf = await instagramService.toBuffer(item.url)
            guardSize(buf)
            await ctx.sendMedia(item.type === 'video' ? 'video' : 'image', buf, '', { mimetype: item.type === 'video' ? 'video/mp4' : 'image/jpeg' })
          }
        } else if (result.type === 'video') {
          const buf = await instagramService.toBuffer(result.url)
          guardSize(buf)
          await ctx.sendMedia('video', buf, '', { mimetype: 'video/mp4' })
        } else if (result.type === 'image') {
          const buf = await instagramService.toBuffer(result.url)
          guardSize(buf)
          await ctx.sendMedia('image', buf, '', { mimetype: 'image/jpeg' })
        } else {
          return { success: false, error: 'Jenis media Instagram tidak dikenali.' }
        }
        return { success: true, message: 'Media Instagram berhasil dikirim.', data: { type: result.type } }
      } catch (err) {
        return { success: false, error: err.message || 'Gagal mengunduh Instagram.' }
      }
    },
  },
  {
    name: 'download_facebook',
    description: 'Download video Facebook/reel dan kirim ke chat.',
    permission: 'user',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Link Facebook lengkap, contoh: https://www.facebook.com/xxx/videos/123 atau https://fb.watch/xxx' },
      },
      required: ['url'],
      additionalProperties: false,
    },
    async execute(args, ctx) {
      const { ok, url, error } = validateUrl(args.url, 'Facebook')
      if (!ok) return { success: false, error }
      try {
        const result = await facebookService.resolve(url)
        const buf = await facebookService.toBuffer(result.url)
        guardSize(buf)
        const caption = result.title ? `${result.title}${result.hasHd ? '\n📺 HD tersedia' : ''}` : ''
        await ctx.sendMedia('video', buf, caption, { mimetype: 'video/mp4' })
        return { success: true, message: 'Video Facebook berhasil dikirim.', data: { title: result.title || null } }
      } catch (err) {
        return { success: false, error: err.message || 'Gagal mengunduh Facebook.' }
      }
    },
  },
  {
    name: 'download_youtube',
    description: 'Download video YouTube dan kirim ke chat.',
    permission: 'user',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Link YouTube lengkap, contoh: https://www.youtube.com/watch?v=xxx atau https://youtu.be/xxx' },
      },
      required: ['url'],
      additionalProperties: false,
    },
    async execute(args, ctx) {
      const { ok, url, error } = validateUrl(args.url, 'YouTube')
      if (!ok) return { success: false, error }
      try {
        const result = await youtubeService.resolve(url, { audioOnly: false })
        let buf, caption
        if (result.mode === 'progressive') {
          buf = await youtubeService.toBuffer(result.url)
          caption = `🎬 ${result.title}\n📺 ${result.quality}`
        } else {
          buf = await youtubeService.toBuffer(result.videoUrl)
          caption = `🎬 ${result.title}\n📺 ${result.quality}\n_Adaptive — audio terpisah_`
        }
        guardSize(buf)
        await ctx.sendMedia('video', buf, caption, { mimetype: 'video/mp4' })
        return { success: true, message: 'Video YouTube berhasil dikirim.', data: { title: result.title || null, quality: result.quality || null } }
      } catch (err) {
        return { success: false, error: err.message || 'Gagal mengunduh YouTube.' }
      }
    },
  },
]