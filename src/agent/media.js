import { downloadMediaMessage } from 'baileys'

const MAX_BYTES = 5 * 1024 * 1024

const MIME_BY_TYPE = {
  imageMessage: 'image/jpeg',
  videoMessage: 'video/mp4',
  ptvMessage: 'video/mp4',
  audioMessage: 'audio/ogg',
  documentMessage: 'application/octet-stream',
}

const KIND_BY_TYPE = {
  imageMessage: 'image',
  videoMessage: 'video',
  ptvMessage: 'video',
  audioMessage: 'audio',
  documentMessage: 'document',
}

function sniffMime(buffer, fallback) {
  if (!buffer || buffer.length < 4) return fallback
  if (buffer[0] === 0xFF && buffer[1] === 0xD8) return 'image/jpeg'
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'image/png'
  if (buffer[0] === 0x52 && buffer[1] === 0x49) return 'image/webp'
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'image/webp'
  return fallback
}

export function toBase64DataUrl(buffer, mime) {
  return `data:${mime};base64,${buffer.toString('base64')}`
}

export function buildMultimodalContent(text, media) {
  const safeText = (text ?? '').trim()
  if (!media) return safeText || 'Halo'

  if (media.kind === 'image') {
    const url = toBase64DataUrl(media.buffer, media.mime)
    const parts = []
    if (safeText) parts.push({ type: 'text', text: safeText })
    else parts.push({ type: 'text', text: 'Jelaskan gambar ini.' })
    parts.push({ type: 'image_url', image_url: { url } })
    return parts
  }

  if (media.kind === 'audio') {
    const b64 = media.buffer.toString('base64')
    const fmt = media.mime.includes('mp3') ? 'mp3' : media.mime.includes('wav') ? 'wav' : 'mp3'
    const prompt = safeText || 'Transkrip audio ini dan jawab sesuai konteksnya.'
    return [
      { type: 'text', text: prompt },
      { type: 'input_audio', input_audio: { data: b64, format: fmt } },
    ]
  }

  return safeText || 'Halo'
}

export async function downloadMedia(parsed, msg) {
  let target = null
  let rawMsg = null

  if (parsed.isMedia && ['imageMessage', 'audioMessage', 'ptvMessage'].includes(parsed.type)) {
    target = parsed.type
    rawMsg = msg
  } else if (parsed.quoted?.isMedia && ['imageMessage', 'audioMessage', 'ptvMessage'].includes(parsed.quoted.type)) {
    target = parsed.quoted.type
    rawMsg = { key: parsed.quoted.key, message: parsed.quoted.message }
  } else {
    return null
  }

  let buffer
  try {
    buffer = await downloadMediaMessage(rawMsg, 'buffer', {}, { logger: undefined })
  } catch {
    throw new Error('Gagal mengunduh media. Coba kirim ulang.')
  }

  if (!buffer || buffer.length === 0) throw new Error('Gagal mengunduh media. Coba kirim ulang.')
  if (buffer.length > MAX_BYTES) throw new Error('Media terlalu besar (maks 5MB). Coba kirim file yang lebih kecil.')

  const fallback = MIME_BY_TYPE[target] ?? 'application/octet-stream'
  const mime = target === 'imageMessage' ? sniffMime(buffer, fallback) : fallback
  const kind = KIND_BY_TYPE[target] ?? 'document'

  if (kind === 'document' || kind === 'video') return null

  return { buffer, mime, kind }
}
