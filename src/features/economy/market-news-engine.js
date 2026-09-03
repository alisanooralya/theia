import {
  NEWS_TYPES,
  NEWS_TEMPLATES,
  NEWS_SPAWN_CHANCE,
  NEWS_GLOBAL_COOLDOWN_TICKS,
  NEWS_MAX_ACTIVE,
  NEWS_MAX_ACTIVE_PER_COMMODITY,
  NEWS_OUTCOME_WEIGHTS,
  NEWS_OUTCOME_MULT,
  NEWS_REVERSE_CHANCE,
  NEWS_PARTIAL_DROP_CHANCE,
  NEWS_IMPACT_DELAY,
  NEWS_IMPACT_RAMP,
  NEWS_FADE_PORTION,
  NEWS_TOTAL_BIAS_CLAMP,
  NEWS_TOTAL_SWING_CLAMP,
  NEWS_COMMODITY_WEIGHTS,
} from './market-news-config.js';

/**
 * Engine Market News — murni fungsi, tanpa akses database.
 *
 * Berita tidak pernah mengubah harga secara langsung. Yang dihasilkan di sini
 * hanya tekanan (bias & swing) yang dipakai market engine sebagai salah satu
 * komponen pergerakan harga, sehingga semua pagar harga tetap berlaku.
 */

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min, max) {
  return min + Math.random() * (max - min);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pickWeighted(entries) {
  const pool = entries.filter(([, weight]) => weight > 0);
  if (!pool.length) return null;
  const total = pool.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = Math.random() * total;
  for (const [value, weight] of pool) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return pool[pool.length - 1][0];
}

/** Jumlah berita aktif per komoditas, dipakai untuk membatasi penumpukan. */
function countByCommodity(activeNews) {
  const counter = {};
  for (const news of activeNews) {
    for (const id of newsTargets(news)) {
      counter[id] = (counter[id] ?? 0) + 1;
    }
  }
  return counter;
}

function newsTargets(news) {
  if (Array.isArray(news?.targets)) return news.targets;
  const raw = news?.affected_commodities ?? '';
  return raw ? String(raw).split(',').filter(Boolean) : [];
}

function newsImpact(news) {
  if (news?.impact) return news.impact;
  if (!news?.hidden_impact) return null;
  try {
    return JSON.parse(news.hidden_impact);
  } catch {
    return null;
  }
}

function templateWeight(template) {
  const weights = template.targets.map(
    (id) => NEWS_COMMODITY_WEIGHTS[id] ?? 1
  );
  const mean = weights.reduce((sum, w) => sum + w, 0) / (weights.length || 1);
  return mean * (template.weight ?? 1);
}

/**
 * Bobot efek berita pada satu tick: naik bertahap lalu mereda.
 * Mengembalikan 0 selama masa delay dan setelah masa berlaku habis.
 */
export function newsWeight(elapsed, total, delay, ramp) {
  const span = Math.max(1, Number(total) - Number(delay));
  const active = Number(elapsed) - Number(delay);
  if (!Number.isFinite(active) || active < 0 || active >= span) return 0;
  const rise = ramp > 0 ? Math.min(1, (active + 1) / ramp) : 1;
  const remaining = 1 - active / span;
  const fade =
    NEWS_FADE_PORTION > 0 ? Math.min(1, remaining / NEWS_FADE_PORTION) : 1;
  return Math.max(0, rise * fade);
}

/**
 * Total tekanan berita untuk satu komoditas pada tick tertentu.
 * Hasil dibatasi konfigurasi supaya berita tidak pernah lebih kuat dari
 * siklus market maupun event ekonomi.
 */
export function newsPressure(newsList, commodityId, tick) {
  let bias = 0;
  let swing = 1;

  for (const news of newsList ?? []) {
    const impact = newsImpact(news);
    const entry = impact?.perCommodity?.[commodityId];
    if (!entry) continue;

    const weight = newsWeight(
      Number(tick) - Number(news.start_tick),
      impact.total,
      impact.delay,
      impact.ramp
    );
    if (weight <= 0) continue;

    bias += Number(entry.bias) * weight;
    swing *= 1 + (Number(entry.swing) - 1) * weight;
  }

  return {
    bias: clamp(bias, -NEWS_TOTAL_BIAS_CLAMP, NEWS_TOTAL_BIAS_CLAMP),
    swing: clamp(swing, 1 / NEWS_TOTAL_SWING_CLAMP, NEWS_TOTAL_SWING_CLAMP),
  };
}

/** Komoditas yang benar-benar terdampak — bisa sebagian saat PARTIAL. */
function resolveAffected(template, outcome) {
  if (outcome !== 'PARTIAL' || template.targets.length < 2)
    return [...template.targets];
  const kept = template.targets.filter(
    (_, index) => index === 0 || Math.random() >= NEWS_PARTIAL_DROP_CHANCE
  );
  return kept.length ? kept : [template.targets[0]];
}

/**
 * Coba munculkan satu berita global untuk tick ini.
 *
 * context:
 * - tick       : nomor tick yang sedang dihitung
 * - active     : berita yang masih berlaku
 * - lastAny    : tick berita terakhir (tipe apa pun)
 * - lastByType : tick berita terakhir per tipe
 *
 * Mengembalikan null kalau tidak ada berita, atau objek berita siap simpan.
 * Efeknya tidak pernah langsung terasa pada tick ini karena selalu ada delay.
 */
export function rollNews(context = {}) {
  const tick = Number(context.tick) || 0;
  const active = context.active ?? [];
  const lastAny = Number(context.lastAny) || 0;
  const lastByType = context.lastByType ?? {};

  if (Math.random() >= NEWS_SPAWN_CHANCE) return null;
  if (active.length >= NEWS_MAX_ACTIVE) return null;
  if (lastAny > 0 && tick - lastAny < NEWS_GLOBAL_COOLDOWN_TICKS) return null;

  const typeId = pickWeighted(
    Object.values(NEWS_TYPES).map((type) => [type.id, type.weight])
  );
  const type = NEWS_TYPES[typeId];
  if (!type) return null;

  // Tipe langka tetap langka: kalau masih cooldown, tick ini tanpa berita.
  const lastSameType = Number(lastByType[type.id]) || 0;
  if (lastSameType > 0 && tick - lastSameType < type.cooldown) return null;

  const busy = countByCommodity(active);
  const pool = NEWS_TEMPLATES.filter(
    (template) =>
      template.type === type.id &&
      template.targets.every(
        (id) => (busy[id] ?? 0) < NEWS_MAX_ACTIVE_PER_COMMODITY
      )
  );
  if (!pool.length) return null;

  const template = pickWeighted(
    pool.map((item) => [item, templateWeight(item)])
  );
  if (!template) return null;

  const outcome = pickWeighted(
    Object.entries(NEWS_OUTCOME_WEIGHTS[type.id] ?? { TRUE: 1 })
  );
  const [multMin, multMax] = NEWS_OUTCOME_MULT[outcome] ?? [1, 1];
  const strength = randFloat(multMin, multMax);
  const reversed = Math.random() < (NEWS_REVERSE_CHANCE[outcome] ?? 0);
  const sign = (template.direction >= 0 ? 1 : -1) * (reversed ? -1 : 1);

  const delay = randInt(NEWS_IMPACT_DELAY[0], NEWS_IMPACT_DELAY[1]);
  const ramp = randInt(NEWS_IMPACT_RAMP[0], NEWS_IMPACT_RAMP[1]);
  const duration = randInt(type.duration[0], type.duration[1]);
  const total = delay + duration;

  const perCommodity = {};
  for (const id of resolveAffected(template, outcome)) {
    const magnitude =
      randFloat(type.impact[0], type.impact[1]) *
      (template.strength ?? 1) *
      strength;
    const extraSwing = randFloat(type.swing[0], type.swing[1]) - 1;
    perCommodity[id] = {
      bias: Number((sign * magnitude).toFixed(6)),
      swing: Number((1 + extraSwing * (0.4 + strength * 0.6)).toFixed(4)),
    };
  }

  return {
    news_key: `${tick}-${template.id}`,
    type: type.id,
    template_id: template.id,
    title: template.title,
    message: template.message,
    targets: [...template.targets],
    hidden_outcome: outcome,
    start_tick: tick,
    expire_tick: tick + total,
    impact: { perCommodity, delay, ramp, total, outcome, reversed },
  };
}
