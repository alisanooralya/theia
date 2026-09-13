/**
 * Konfigurasi terpusat untuk AI content moderation (anti-toxic).
 *
 * - Model / API URL / timeout hanya didefinisikan di sini (jangan hardcode
 *   di banyak file).
 * - API key TIDAK ada di sini — diambil dari SETTINGS.openrouterApiKey
 *   (env `OPENROUTER_API_KEY`).
 * - Keyword lokal hanya menentukan apakah sebuah pesan layak direview AI.
 *   Keputusan konteks (none/low/high) ada di tangan AI classifier.
 */

// ---------------------------------------------------------------------------
// OpenRouter content-safety classifier
// ---------------------------------------------------------------------------

export const CONTENT_SAFETY_CONFIG = {
  apiUrl: 'https://api.fregateway.biz.id/v1/chat/completions',
  model: 'fregateway/qwen3.8-flash',
  timeoutMs: 15_000,
  // Batasi panjang teks yang dikirim ke classifier agar request tetap ringan.
  maxTextChars: 1000,
};

// ---------------------------------------------------------------------------
// LOW keywords — slang ringan yang unambiguous.
// Langsung menghasilkan `low` (delete only) TANPA request AI.
// ---------------------------------------------------------------------------

export const LOW_KEYWORDS = [
  'jir',
  'njir',
  'bjir',
  // Tambahan manual user di daftar lama — dipertahankan, dikategorikan LOW.
  'wanjir',
  'wanjirr',
];

// ---------------------------------------------------------------------------
// CONTEXTUAL words — kata yang wajar dipakai dalam konteks normal
// (hewan, benda, candaan non-toxic). JANGAN auto-punish, selalu via AI.
// ---------------------------------------------------------------------------

export const CONTEXTUAL_KEYWORDS = [
  'anjing',
  'babi',
  'b4bi',
  'monyet',
  'nyet',
  'babu',
  'bodoh',
  'idiot',
  'stupid',
  'sinting',
  'sialan',
  'setan',
  // Hewan nokturnal; sering dipakai normal, sering juga sebagai makian.
  'kampret',
];

// ---------------------------------------------------------------------------
// REVIEW keywords — kandidat toxic/vulgar/sexual berat.
// BUKAN auto-punishment; pesan yang cocok diteruskan ke AI untuk klasifikasi
// konteks. Daftar lama sudah diaudit: singkatan ambigu yang rawan false
// positive (wtf, ewe, bdoh, bdh, bct, ppk, sht) dibuang dari deteksi.
// ---------------------------------------------------------------------------

export const REVIEW_KEYWORDS = [
  // Makian / hinaan berat + variasi umum.
  'goblok',
  'goblog',
  'gblk',
  'gblg',
  'goblk',
  'goblg',
  'gblok',
  'gblog',
  'tolol',
  'tlol',
  'bangsat',
  'bngst',
  'brengsek',
  'brngsk',
  'brngsek',
  'bajingan',
  'badjingan',
  'bjngn',
  'bego',
  'bacot',
  'bcot',
  'bact',
  'kimak',
  'pantek',
  'pntk',
  // Keluarga anj* — ringan sampai berat tergantung konteks, biar AI menilai.
  'anjir',
  'anjier',
  'anjierr',
  'njier',
  'anying',
  'anjg',
  'ajg',
  'anj',
  'anjay',
  'anjai',
  'njai',
  'njay',
  'jing',
  'jink',
  // Vulgar / organ seksual / aktivitas seksual + variasi sensor umum.
  'kontol',
  'k0ntl',
  'k0nt0l',
  'kntl',
  'kontl',
  'kntol',
  'memek',
  'memk',
  'mmek',
  'mmk',
  'jembut',
  'jmbt',
  'mbut',
  'pepek',
  'pepk',
  'ppek',
  'puki',
  'pukimak',
  'titit',
  'tytyd',
  'pantat',
  'tai',
  't4i',
  'taik',
  'ngentot',
  'ngentod',
  'ngntt',
  'ngntd',
  'ngentd',
  'ngentt',
  'ngntod',
  'ngntot',
  // English heavy.
  'asshole',
  'bitch',
  'bastard',
  'motherfucker',
  'nigga',
  'nigger',
  'nigg',
  'fuck',
  'fck',
  'shit',
  'dick',
  'pussy',
  'cunt',
  'whore',
  'slut',
  'retard',
  'stpd',
];

// ---------------------------------------------------------------------------
// REVIEW patterns — sinyal seksual/18+ atau ajakan tidak pantas yang sering
// lolos keyword. Config-driven dan mudah diperluas. Sengaja ketat agar chat
// normal (makanan, umur, dsb) tidak memicu review AI.
// ---------------------------------------------------------------------------

export const REVIEW_PATTERNS = [
  /\bopen\s?bo\b/i,
  /\b(boking|booking)\b/i,
  /\b(bokep|porn|hentai)\b/i,
  /\b(sange|horny|colmek|desah)\b/i,
  /\b(esek[-\s]?esek|threesome|mastur)\b/i,
  /\b(ngewe|wikwik)\b/i,
  /\bpap\s+(tt|nenen|colmek|bugil|nude)\b/i,
];

function escapeRegExp(word) {
  return word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wordsToRegExp(words) {
  return new RegExp(`\\b(?:${words.map(escapeRegExp).join('|')})\\b`, 'i');
}

export const LOW_RE = wordsToRegExp(LOW_KEYWORDS);
export const REVIEW_KEYWORD_RE = wordsToRegExp(REVIEW_KEYWORDS);

// Kata kontekstual memakai pencocokan toleran sufiks Indonesia (-nya, -ku,
// -mu, -lah, -kah, -pun) agar "anjingnya lucu" tetap masuk review AI,
// bukan lolos diam-diam karena word boundary (\banjing\b tidak cocok
// dengan "anjingnya").
const CONTEXTUAL_SUFFIX = '(?:nya|ku|mu|lah|kah|tah|pun)?';
export const CONTEXTUAL_RE = new RegExp(
  `(?:^|[^a-z0-9_])(?:${CONTEXTUAL_KEYWORDS.map(escapeRegExp).join('|')})${CONTEXTUAL_SUFFIX}(?![a-z0-9_])`,
  'i'
);

/**
 * True jika pesan mengandung kandidat lokal (contextual/high/sexual) atau
 * cocok dengan review pattern — artinya layak direview AI.
 * BUKAN keputusan pelanggaran; AI yang mengklasifikasikan konteks.
 */
export function shouldReviewWithAI(lowerText) {
  if (CONTEXTUAL_RE.test(lowerText)) return true;
  if (REVIEW_KEYWORD_RE.test(lowerText)) return true;
  return REVIEW_PATTERNS.some((re) => re.test(lowerText));
}
