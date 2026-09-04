import { randomBytes } from 'crypto';
import { fileTypeFromBuffer } from 'file-type';
import { logger } from '#helpers/logger.js';
import { formatBytes } from '#helpers/formatter.js';

const UGUU_UPLOAD_URL = 'https://uguu.se/upload';
const MAX_BYTES = 128 * 1024 * 1024;
const DEFAULT_TIMEOUT = 60_000;

async function resolveFileInfo(buffer, options) {
  const type = await fileTypeFromBuffer(buffer).catch(() => null);
  const ext = options.ext ?? type?.ext ?? 'bin';
  const mimetype = options.mimetype ?? type?.mime ?? 'application/octet-stream';
  const filename =
    options.filename ?? `${randomBytes(6).toString('hex')}.${ext}`;
  return { filename, mimetype };
}

/**
 * Upload buffer ke uguu.se (file expired otomatis setelah 3 jam).
 * @param {Buffer|Uint8Array} input
 * @param {{ filename?: string, mimetype?: string, ext?: string, timeout?: number }} [options]
 * @returns {Promise<string>} URL file publik
 */
export async function uploadToUguu(input, options = {}) {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input ?? []);
  if (buffer.length === 0) throw new Error('Tidak ada file untuk diupload.');
  if (buffer.length > MAX_BYTES) {
    throw new Error(
      `File terlalu besar (${formatBytes(buffer.length)}), maksimal ${formatBytes(MAX_BYTES)}.`
    );
  }

  const { filename, mimetype } = await resolveFileInfo(buffer, options);
  const form = new FormData();
  form.append('files[]', new Blob([buffer], { type: mimetype }), filename);

  let payload;
  try {
    const res = await fetch(UGUU_UPLOAD_URL, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(options.timeout ?? DEFAULT_TIMEOUT),
    });
    payload = await res.json().catch(() => null);
    if (!payload) throw new Error(`Respons tidak valid (HTTP ${res.status})`);
  } catch (err) {
    logger.error({ err, filename, mimetype }, 'Uguu upload failed');
    throw new Error('Gagal upload file ke uguu.se.');
  }

  if (payload.success !== true) {
    logger.warn({ filename, payload }, 'Uguu rejected upload');
    throw new Error(
      `Upload ke uguu.se ditolak: ${payload.description ?? 'alasan tidak diketahui'}`
    );
  }

  const url = payload.files?.[0]?.url;
  if (!url) {
    logger.warn({ filename, payload }, 'Uguu response has no file url');
    throw new Error('uguu.se tidak mengembalikan URL file.');
  }
  return url;
}
