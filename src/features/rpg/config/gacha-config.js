import { MAIN_CARDS } from './card-config.js';
import { getInventoryItems } from './shop-config.js';

export const GACHA_CONFIG = Object.freeze({
  costs: Object.freeze({ 1: 25000, 10: 250000 }),
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

export function allowedPullCounts() {
  return Object.keys(GACHA_CONFIG.costs).map(Number);
}

export function gachaCost(count) {
  const cost = GACHA_CONFIG.costs[count];
  if (cost === undefined)
    throw new RangeError(`unsupported gacha count: ${count}`);
  return cost;
}

export function rollPull(random = Math.random) {
  const roll = random();
  if (roll < GACHA_CONFIG.rates.mainCard) return 'main';
  if (roll < GACHA_CONFIG.rates.mainCard + GACHA_CONFIG.rates.zonk)
    return 'zonk';
  return 'shopItem';
}

export function rollMainCard(random = Math.random) {
  const ids = Object.keys(MAIN_CARDS);
  if (!ids.length) throw new RangeError('no main cards configured');
  return ids[Math.min(ids.length - 1, Math.floor(random() * ids.length))];
}

export function rollShopItem(random = Math.random) {
  const items = getInventoryItems();
  if (!items.length) throw new RangeError('no purchasable shop items');
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))]
    .id;
}

export function rollItemQuantity(random = Math.random) {
  const { min, max } = GACHA_CONFIG.itemQuantity;
  return min + Math.floor(random() * (max - min + 1));
}
