/**
 * AI content moderation via OpenRouter (contextual moderation layer).
 *
 * Service ini hanya CLASSIFIER: menilai pesan dan mengembalikan severity
 * (`none` | `low` | `high`) + category. AI TIDAK menentukan punishment;
 * punishment diputuskan oleh pipeline anti-toxic.
 *
 * Fail-safe: setiap kegagalan (key belum diset, timeout, network error,
 * rate limit, malformed response) mengembalikan `null` — caller harus
 * memperlakukannya sebagai ALLOW, bukan pelanggaran.
 *
 * Keamanan: JANGAN pernah me-log API key atau authorization header.
 */

import SETTINGS from '#environment/settings.js';
import { logger } from '#helpers/logger.js';
import { CONTENT_SAFETY_CONFIG } from './content-safety-config.js';

const VALID_SEVERITIES = new Set(['none', 'low', 'high']);
const VALID_CATEGORIES = new Set([
  'safe',
  'toxic',
  'harassment',
  'vulgar',
  'sexual',
  'other',
]);

function truncate(text, max) {
  if (text.length <= max) return text;
  return text.slice(0, max);
}

/**
 * Membangun messages untuk chat completion. AI diposisikan sebagai
 * classifier berbahasa Indonesia, output JSON strict.
 */
export function buildModerationMessages(text, quotedText = '') {
  const target = truncate(
    String(text ?? ''),
    CONTENT_SAFETY_CONFIG.maxTextChars
  );
  const quoted = truncate(
    String(quotedText ?? ''),
    CONTENT_SAFETY_CONFIG.maxTextChars
  );

  const contextBlock = quoted.trim()
    ? `Pesan yang di-reply/quoted (konteks, bisa kosong bila tidak relevan):\n"""${quoted}"""\n\n`
    : '';

  return [
    {
      role: 'system',
      content: [
        'You are a content moderation classifier for an Indonesian all-ages WhatsApp community.',
        'Assess the TARGET message in context: Indonesian language, Indonesian slang, and the quoted/replied message when relevant.',
        'Do NOT punish a message merely for containing a certain word when that word is clearly used in a normal, non-toxic sense (e.g. talking about animals, objects, jokes between friends without insult).',
        'Consider whether a word is used as an insult/harassment, refers to animals/objects/normal context, or is sexual/vulgar/explicit content inappropriate for an all-ages community.',
        'You only classify. You never decide punishments.',
        'Respond with STRICT JSON only, no markdown, no code fences, no explanation:',
        '{"severity": "none" | "low" | "high", "category": "safe" | "toxic" | "harassment" | "vulgar" | "sexual" | "other"}',
        'Severity guide: "none" = no violation. "low" = mild slang/profanity that should just be cleaned up (e.g. casual "jir"/"njir"-style swearing without a target). "high" = severe insult, targeted harassment, sexual/18+ content, sexual harassment, explicit vulgarity, or other clearly prohibited content.',
      ].join(' '),
    },
    {
      role: 'user',
      content: `${contextBlock}Pesan target:\n"""${target}"""`,
    },
  ];
}

/**
 * Parsing defensif output model. Mengembalikan { severity, category }
 * atau null bila tidak valid. Tidak pernah throw untuk input tak valid.
 *
 * Mendukung dua format:
 * 1. JSON: {"severity":"low","category":"vulgar"}
 * 2. Teks nemotron: "User Safety: safe/unsafe\nSafety Categories: ..."
 */
export function parseClassifierOutput(raw) {
  try {
    if (typeof raw !== 'string' || !raw.trim()) return null;
    let cleaned = raw.trim();

    // --- Format 1: JSON (dari openai/gpt-4o-mini atau model lain) ---
    const fenceMatch = cleaned.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fenceMatch) cleaned = fenceMatch[1].trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      try {
        const parsed = JSON.parse(cleaned.slice(start, end + 1));
        const severity = String(parsed?.severity ?? '').toLowerCase();
        const category = String(parsed?.category ?? '').toLowerCase();
        if (VALID_SEVERITIES.has(severity) && VALID_CATEGORIES.has(category)) {
          return { severity, category };
        }
      } catch {
        // bukan JSON valid, lanjut ke format teks
      }
    }

    // --- Format 2: Teks nemotron ("User Safety: ...") ---
    return parseNemotronText(cleaned);
  } catch {
    return null;
  }
}

/**
 * Parse output teks nemotron:
 *   "User Safety: safe"
 *   "User Safety: unsafe\nSafety Categories: Profanity"
 *   "User Safety: unsafe\nSafety Categories: Sexual, Profanity"
 */
function parseNemotronText(text) {
  const safetyMatch = text.match(/User Safety:\s*(safe|unsafe)/i);
  if (!safetyMatch) return null;
  const isSafe = safetyMatch[1].toLowerCase() === 'safe';

  if (isSafe) {
    return { severity: 'none', category: 'safe' };
  }

  // Unsafe — extract categories
  const catMatch = text.match(/Safety Categories:\s*(.+)/i);
  const categories = catMatch
    ? catMatch[1].split(',').map((c) => c.trim().toLowerCase())
    : [];

  // Map nemotron categories ke internal categories
  const category = mapNemotronCategory(categories);
  return { severity: 'low', category };
}

/**
 * Map nemotron safety categories ke internal categories.
 * Nemotron: Profanity, Sexual, Violence, Hate, Harassment, SelfHarm, Criminal Planning/Confessions
 * Internal: safe, toxic, harassment, vulgar, sexual, other
 */
function mapNemotronCategory(categories) {
  const joined = categories.join(' ');

  if (/sexual/i.test(joined)) return 'sexual';
  if (/harassment|hate/i.test(joined)) return 'harassment';
  if (/profanity/i.test(joined)) return 'vulgar';
  if (/violence|criminal|selfharm/i.test(joined)) return 'other';

  // Default untuk unsafe tanpa kategori yang dikenal
  return 'toxic';
}

function resolveApiKey(override) {
  if (typeof override === 'string' && override) return override;
  return SETTINGS.openrouterApiKey || '';
}

/**
 * Klasifikasi pesan via OpenRouter.
 * @returns {Promise<{severity: string, category: string} | null>}
 *   null = AI unavailable / response invalid → caller harus ALLOW.
 */
export async function classifyContent(
  text,
  { quotedText = '', fetchImpl, apiKey, model, apiUrl, timeoutMs } = {}
) {
  const key = resolveApiKey(apiKey);
  if (!key) {
    logger.warn(
      '[ContentSafety] OPENROUTER_API_KEY is not set, skipping AI moderation'
    );
    return null;
  }

  const body = {
    model: model || CONTENT_SAFETY_CONFIG.model,
    messages: buildModerationMessages(text, quotedText),
    temperature: 0,
    max_tokens: 100,
  };

  const endpoint = apiUrl || CONTENT_SAFETY_CONFIG.apiUrl;
  const timeout = timeoutMs ?? CONTENT_SAFETY_CONFIG.timeoutMs;
  const doFetch = fetchImpl || fetch;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const startedAt = Date.now();

  try {
    const res = await doFetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!res.ok) {
      // Hanya status code yang di-log; body/header (termasuk auth) tidak.
      logger.warn(
        { status: res.status, model: body.model },
        '[ContentSafety] OpenRouter request failed'
      );
      return null;
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    const parsed = parseClassifierOutput(content);
    if (!parsed) {
      logger.warn(
        { model: body.model },
        '[ContentSafety] Unparseable classifier response'
      );
      return null;
    }

    logger.debug(
      {
        model: body.model,
        severity: parsed.severity,
        category: parsed.category,
        latencyMs: Date.now() - startedAt,
      },
      '[ContentSafety] Classified message'
    );
    return parsed;
  } catch (err) {
    // Timeout (abort), network error, dsb — fail aman tanpa detail sensitif.
    logger.warn(
      { name: err?.name, message: err?.message },
      '[ContentSafety] Classifier request error'
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}
