/**
 * Konfigurasi Card — semua pemetaan card_id ke artwork ada di file ini.
 * Ubah map di sini untuk menambah/mengganti gambar tanpa menyentuh command.
 */
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Direktori artwork karakter card.
export const CARD_DIR = join(__dirname, '..', '..', '..', 'temp', 'card');

/**
 * card_id -> nama file artwork.
 * Card tanpa entri (mis. support `raid_emblem`) dianggap tidak punya gambar.
 */
export const CARD_IMAGE_MAP = {
  girgas: 'girgas.webp',
  lena: 'lena.webp',
  ameris: 'ameris.webp',
  daisy: 'daisy.webp',
};

/** Nama file artwork untuk sebuah card_id, atau null jika tidak ada. */
export function cardArtFile(cardId) {
  if (!cardId) return null;
  return CARD_IMAGE_MAP[cardId] ?? null;
}

/** Path absolut artwork yang benar-benar ada di disk, atau null. */
export function cardArtPath(cardId) {
  const file = cardArtFile(cardId);
  if (!file) return null;
  const full = join(CARD_DIR, file);
  return existsSync(full) ? full : null;
}
