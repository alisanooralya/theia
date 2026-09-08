/**
 * RPG 2.0 — Shop config. Single source of truth for RPG Shop items.
 *
 * RULE: adding an item = adding one entry here. Commands, services, and
 * the database schema never change per item. No second item list may
 * exist anywhere else; `getShopItems()` reads this object directly.
 *
 * Entry shape:
 *   { id, name, description, price (coin), currency: 'coin',
 *     category, purchasable }
 *
 * Cerelia identity (id/name/description) is reused from Card Config so
 * the Card system and the Shop never define a second Cerelia — only the
 * shop price/purchasability live here.
 */
import { CERELIA_ITEM } from './card-config.js';

function shopItem({ id, name, description, price, currency = 'coin', category = 'rpg', purchasable = true }) {
  if (!id || !name) throw new RangeError('shop item needs id and name');
  if (!Number.isInteger(price) || price < 0) {
    throw new RangeError(`shop item ${id} needs a non-negative integer price`);
  }
  return Object.freeze({ id, name, description: description ?? '', price, currency, category, purchasable });
}

export const SHOP_ITEMS = Object.freeze({
  [CERELIA_ITEM.id]: shopItem({
    id: CERELIA_ITEM.id,
    name: CERELIA_ITEM.name,
    description: 'Material untuk meningkatkan Card dan Sign Card.',
    price: 5000,
  }),
});

/** All shop entries as an array, in definition order. */
export function getShopItems() {
  return Object.values(SHOP_ITEMS);
}

/** Only buyable entries (what `.shop` displays). */
export function getPurchasableItems() {
  return getShopItems().filter((item) => item.purchasable);
}

/** Entry by id, or null. No branching, no hardcoded ids. */
export function getShopItem(itemId) {
  if (!itemId) return null;
  return SHOP_ITEMS[itemId] ?? null;
}
