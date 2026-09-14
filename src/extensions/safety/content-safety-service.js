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
        'Classify the TARGET message in Indonesian language and slang context.',
        'Do NOT punish a message merely for containing a certain word when that word is clearly used in a normal, non-toxic sense.',
        'Consider whether a word is used as an insult/harassment, refers to animals/objects/normal context, or is sexual/vulgar/explicit content inappropriate for an all-ages community.',
        'You only classify. You never decide punishments.',
        'Respond ONLY in this exact format:',
        'User Safety: safe|unsafe',
        'Safety Categories: None | Category1, Category2',
        'Categories: Profanity, Sexual, Violence, Hate, Harassment, SelfHarm, Criminal Planning',
      ].join(' '),
    },
    {
      role: 'user',
      content: `${contextBlock}TARGET MESSAGE: ${target}`,
    },
  ];
}

export function parseClassifierOutput(raw) {
  try {
    if (typeof raw !== 'string' || !raw.trim()) return null;
    let cleaned = raw.trim();

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
        // fallback ke format teks
      }
    }

    return parseNemotronText(cleaned);
  } catch {
    return null;
  }
}

function parseNemotronText(text) {
  const safetyMatch = text.match(/User Safety:\s*(safe|unsafe)/i);
  if (!safetyMatch) return null;
  const isSafe = safetyMatch[1].toLowerCase() === 'safe';

  if (isSafe) {
    return { severity: 'none', category: 'safe' };
  }

  const catMatch = text.match(/Safety Categories:\s*(.+)/i);
  const categories = catMatch
    ? catMatch[1]
        .split(/[,\s]+(?:dan\s+)?/)
        .map((c) => c.trim().toLowerCase())
        .filter(Boolean)
    : [];

  const category = mapNemotronCategory(categories);
  return { severity: 'low', category };
}

function mapNemotronCategory(categories) {
  const joined = categories.join(' ');

  if (/sexual/i.test(joined)) return 'sexual';
  if (/harassment|hate/i.test(joined)) return 'harassment';
  if (/profanity/i.test(joined)) return 'vulgar';
  if (/violence|criminal|selfharm/i.test(joined)) return 'other';

  return 'toxic';
}

function resolveApiKey(override) {
  if (typeof override === 'string' && override) return override;
  return SETTINGS.fregatewayApiKey || '';
}

export async function classifyContent(
  text,
  { quotedText = '', fetchImpl, apiKey, model, apiUrl, timeoutMs } = {}
) {
  const key = resolveApiKey(apiKey);
  if (!key) {
    logger.warn(
      '[ContentSafety] FREGATEWAY_API_KEY is not set, skipping AI moderation'
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
      logger.warn(
        { status: res.status, model: body.model },
        '[ContentSafety] Fregateway request failed'
      );
      return null;
    }

    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    const reasoning =
      data?.choices?.[0]?.message?.reasoning ||
      data?.choices?.[0]?.message?.reasoning_content;

    let parsed = parseClassifierOutput(content);
    if (!parsed && reasoning) {
      parsed = parseClassifierOutput(String(reasoning));
    }

    if (!parsed) {
      logger.warn(
        {
          model: body.model,
          content: content,
          reasoning: reasoning ? String(reasoning).slice(0, 200) : null,
          finishReason: data?.choices?.[0]?.finish_reason,
        },
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
    logger.warn(
      { name: err?.name, message: err?.message },
      '[ContentSafety] Classifier request error'
    );
    return null;
  } finally {
    clearTimeout(timer);
  }
}
