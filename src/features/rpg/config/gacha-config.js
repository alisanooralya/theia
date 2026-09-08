/**
 * RPG 2.0 — Gacha config. Single source of truth for pull costs, rates,
 * and item quantity range. Services/commands read from here; nothing is
 * hardcoded per pull count or per outcome.
 *
 * Rates must total exactly 1 (validated at load):
 *   mainCard 1% + zonk 50% + shopItem 49%.
 * No pity, no guarantees — every pull is independent.
 */
import { MAIN_CARDS } from './card-config.js';
import { getInventoryItems } from './shop-config.js';

export const GACHA_CONFIG = Object.freeze({
  costs: Object.freeze({ 1: 2500, 10: 25000 }),
  rates: Object.freeze({ mainCard: 0.01, zonk: 0.5, shopItem: 0.49 }),
  itemQuantity: Object.freeze({ min: 1, max: 3 }),
  animationDelayMs: 1600,
});

const rateTotal =
  GACHA_CONFIG.rates.mainCard +
  GACHA_CONFIG.rates.zonk +
  GACHA_CONFIG.rates.shopItem;
if (Math.abs(rateTotal - 1) > 1e-9) {
  throw new RangeError(`gacha rates must total 1, got ${rateTotal}`);
}

/** Allowed pull counts (keys of costs). */
export function allowedPullCounts() {
  return Object.keys(GACHA_CONFIG.costs).map(Number);
}

/** Total coin cost for a pull count. Throws for unsupported counts. */
export function gachaCost(count) {
  const cost = GACHA_CONFIG.costs[count];
  if (cost === undefined)
    throw new RangeError(`unsupported gacha count: ${count}`);
  return cost;
}

/** Outcome category for one pull: 'main' | 'zonk' | 'shopItem'. */
export function rollPull(random = Math.random) {
  const roll = random();
  if (roll < GACHA_CONFIG.rates.mainCard) return 'main';
  if (roll < GACHA_CONFIG.rates.mainCard + GACHA_CONFIG.rates.zonk)
    return 'zonk';
  return 'shopItem';
}

/** Uniform Main Card pick straight from Card Config (auto-follows it). */
export function rollMainCard(random = Math.random) {
  const ids = Object.keys(MAIN_CARDS);
  if (!ids.length) throw new RangeError('no main cards configured');
  return ids[Math.min(ids.length - 1, Math.floor(random() * ids.length))];
}

/** Uniform pick over inventory-type shop items (card grants excluded). */
export function rollShopItem(random = Math.random) {
  const items = getInventoryItems();
  if (!items.length) throw new RangeError('no purchasable shop items');
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))].id;
}

/** Item quantity for a shop-item pull, within the configured range. */
export function rollItemQuantity(random = Math.random) {
  const { min, max } = GACHA_CONFIG.itemQuantity;
  return min + Math.floor(random() * (max - min + 1));
}
