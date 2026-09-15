export const CONTENT_SAFETY_CONFIG = {
  apiUrl: 'https://api.fregateway.biz.id/v1/chat/completions',
  model: 'fregateway/qwen3.8-flash',
  timeoutMs: 15_000,
  maxTextChars: 1000,
};

export const LOW_KEYWORDS = ['jir', 'njir', 'bjir', 'wanjir', 'wanjirr'];

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
  'kampret',
];

export const REVIEW_KEYWORDS = [
  'pea',
  "pe'",
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

const CONTEXTUAL_SUFFIX = '(?:nya|ku|mu|lah|kah|tah|pun)?';
export const CONTEXTUAL_RE = new RegExp(
  `(?:^|[^a-z0-9_])(?:${CONTEXTUAL_KEYWORDS.map(escapeRegExp).join('|')})${CONTEXTUAL_SUFFIX}(?![a-z0-9_])`,
  'i'
);

export function shouldReview(lowerText) {
  if (CONTEXTUAL_RE.test(lowerText)) return true;
  if (REVIEW_KEYWORD_RE.test(lowerText)) return true;
  return REVIEW_PATTERNS.some((re) => re.test(lowerText));
}
