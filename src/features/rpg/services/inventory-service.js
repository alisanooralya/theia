/**
 * RPG 2.0 — Inventory service (generic business logic, no SQL here).
 *
 * Thin validation over rpg-inventory.model.js. Item identity comes from
 * Shop Config; this service never enumerates items itself.
 */
import { rpgInventoryModel } from '../models/rpg-inventory.model.js';

function assertPositiveInt(quantity, label = 'quantity') {
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new RangeError(`${label} must be a positive integer`);
  }
}

function assertItemId(itemId) {
  if (typeof itemId !== 'string' || itemId.trim() === '') {
    throw new RangeError('itemId must be a non-empty string');
  }
}

export function createInventoryService({ inventoryModel } = {}) {
  const items = inventoryModel ?? rpgInventoryModel;

  return {
    /** Raw rows [{ user_id, item_id, quantity, ... }]. Read-only. */
    async getInventory(userId) {
      return items.getAll(userId);
    },

    async getItemQuantity(userId, itemId) {
      assertItemId(itemId);
      return items.getQuantity(userId, itemId);
    },

    async hasItem(userId, itemId, quantity = 1) {
      assertItemId(itemId);
      assertPositiveInt(quantity);
      return (await items.getQuantity(userId, itemId)) >= quantity;
    },

    async addItem(userId, itemId, quantity, client) {
      assertItemId(itemId);
      assertPositiveInt(quantity);
      return items.add(userId, itemId, quantity, client);
    },

    /** Returns remaining quantity (0 when the row is cleaned up). */
    async removeItem(userId, itemId, quantity, client) {
      assertItemId(itemId);
      assertPositiveInt(quantity);
      return items.remove(userId, itemId, quantity, client);
    },
  };
}

export const inventoryService = createInventoryService();
