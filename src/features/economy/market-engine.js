import {
  COMMODITIES,
  PHASES,
  DEFAULT_PHASE,
  EVENTS,
  EVENT_MAP,
  EVENT_CHANCE,
  MOMENTUM_DECAY,
  MOMENTUM_GAIN,
  MOMENTUM_CLAMP,
  MAX_TICK_CHANGE,
} from './market-config.js';

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function pickWeighted(entries) {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = Math.random() * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll <= 0) return value;
  }
  return entries[entries.length - 1][0];
}

function phaseConfig(phase) {
  return PHASES[phase] ?? PHASES[DEFAULT_PHASE];
}

export function rollPhaseDuration(phase) {
  const config = phaseConfig(phase);
  return randInt(config.min, config.max);
}

export function initialCommodityState(id) {
  const commodity = COMMODITIES[id];
  if (!commodity) throw new Error(`Komoditas tidak dikenal: ${id}`);
  return {
    id,
    price: commodity.basePrice,
    prev_price: commodity.basePrice,
    phase: DEFAULT_PHASE,
    phase_ticks: rollPhaseDuration(DEFAULT_PHASE),
    momentum: 0,
    event_id: '',
    event_ticks: 0,
  };
}

export function rollEvent(activeEventIds = []) {
  if (Math.random() >= EVENT_CHANCE) return null;
  const pool = EVENTS.filter((e) => !activeEventIds.includes(e.id));
  if (!pool.length) return null;
  const event = pool[randInt(0, pool.length - 1)];
  return { event, ticks: randInt(event.min, event.max) };
}

export function stepCommodity(state, options = {}) {
  const commodity = COMMODITIES[state.id];
  if (!commodity) throw new Error(`Komoditas tidak dikenal: ${state.id}`);

  const price = Number(state.price) || commodity.basePrice;
  let phase = PHASES[state.phase] ? state.phase : DEFAULT_PHASE;
  let phaseTicks = Number(state.phase_ticks) || 0;
  let momentum = Number(state.momentum) || 0;
  let eventId = state.event_id ?? '';
  let eventTicks = Number(state.event_ticks) || 0;

  if (options.newEventId) {
    eventId = options.newEventId;
    eventTicks = Number(options.newEventTicks) || 0;
  }

  const currentPhase = phaseConfig(phase);
  let popped = false;
  if (phase === 'bubble' && currentPhase.popChance) {
    const popChance = clamp(currentPhase.popChance * commodity.crashRisk, 0, 1);
    if (Math.random() < popChance) {
      phase = 'crash';
      phaseTicks = rollPhaseDuration('crash');
      momentum = Math.min(momentum, 0);
      popped = true;
    }
  }

  if (!popped && phaseTicks <= 0) {
    const candidates = phaseConfig(phase).next.map(([next, weight]) => {
      const adjusted = next === 'crash' ? weight * commodity.crashRisk : weight;
      return [next, Math.max(0.0001, adjusted)];
    });
    const nextPhase = pickWeighted(candidates);
    if (nextPhase !== phase) momentum *= 0.5;
    phase = nextPhase;
    phaseTicks = rollPhaseDuration(phase);
  }

  const active = phaseConfig(phase);
  const event = eventTicks > 0 ? EVENT_MAP[eventId] : null;

  const newsBias = Number(options.newsBias) || 0;
  const newsSwing = Number(options.newsSwing) || 1;

  const sensitivity = 0.6 + commodity.phaseScale * 0.4;
  const bias =
    commodity.drift +
    active.bias * commodity.phaseScale +
    (event?.bias ?? 0) * sensitivity +
    newsBias * sensitivity;

  const swing = active.swing * (event?.swing ?? 1) * newsSwing;
  const noise = (Math.random() * 2 - 1) * commodity.noise * swing;

  const ratio = price / commodity.basePrice;
  const pull = -Math.log(ratio) * commodity.gravity;

  momentum = clamp(
    momentum * MOMENTUM_DECAY + (bias + noise) * MOMENTUM_GAIN,
    -MOMENTUM_CLAMP,
    MOMENTUM_CLAMP
  );

  const change = clamp(
    bias + noise + pull + momentum,
    -MAX_TICK_CHANGE,
    MAX_TICK_CHANGE
  );

  const floor = Math.max(
    1,
    Math.round(commodity.basePrice * commodity.floorMult)
  );
  const ceil = Math.round(commodity.basePrice * commodity.ceilMult);
  const nextPrice = clamp(Math.round(price * (1 + change)), floor, ceil);

  if (eventTicks > 0) eventTicks -= 1;
  if (eventTicks <= 0) {
    eventTicks = 0;
    eventId = '';
  }

  return {
    id: state.id,
    price: nextPrice,
    prev_price: price,
    phase,
    phase_ticks: Math.max(0, phaseTicks - 1),
    momentum: Number(momentum.toFixed(6)),
    event_id: eventId,
    event_ticks: eventTicks,
    change: price > 0 ? (nextPrice - price) / price : 0,
  };
}

export function readIndicators(state) {
  const momentum = Number(state.momentum) || 0;
  const phase = PHASES[state.phase] ? state.phase : DEFAULT_PHASE;
  const bias = phaseConfig(phase).bias + momentum;

  let demand = '➖ Normal';
  let supply = '➖ Normal';

  if (bias >= 0.05) {
    demand = '🔥 Very High';
    supply = '⚠️ Very Low';
  } else if (bias >= 0.02) {
    demand = '🔥 High';
    supply = '⚠️ Low';
  } else if (bias <= -0.05) {
    demand = '❄️ Very Low';
    supply = '📦 Oversupply';
  } else if (bias <= -0.02) {
    demand = '❄️ Low';
    supply = '📦 High';
  }

  return { demand, supply };
}

export function readTrend(changePercent) {
  if (changePercent >= 15) return '📈 Strong';
  if (changePercent >= 3) return '📈 Up';
  if (changePercent <= -15) return '📉 Falling';
  if (changePercent <= -3) return '📉 Down';
  return '➖ Stabil';
}
