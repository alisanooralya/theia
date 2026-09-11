import { CERELIA_ITEM, SIGN_CARDS, MAIN_CARDS } from './card-config.js';

function shopItem({
  id,
  name,
  description,
  price,
  currency = 'coin',
  category = 'rpg',
  purchasable = true,
  cardId = null,
  emoji = '📦',
}) {
  if (!id || !name) throw new RangeError('shop item needs id and name');
  if (!Number.isInteger(price) || price < 0) {
    throw new RangeError(`shop item ${id} needs a non-negative integer price`);
  }
  return Object.freeze({
    id,
    name,
    description: description ?? '',
    price,
    currency,
    category,
    purchasable,
    cardId,
    emoji,
  });
}

function signShopEntries() {
  const entries = {};
  for (const def of Object.values(SIGN_CARDS)) {
    const mainName = MAIN_CARDS[def.compatibleCard]?.name ?? def.compatibleCard;
    entries[def.id] = shopItem({
      id: def.id,
      name: def.name,
      emoji: '🔰',
      description: `Sign Card untuk ${mainName}.`,
      price: 500000,
      category: 'sign',
      cardId: def.id,
    });
  }
  return entries;
}

const SEED_DEFS = [
  {
    id: 'corn_seed',
    name: 'Bibit Jagung',
    emoji: '🌽',
    description: 'Bibit jagung untuk ditanam di Farming.',
    price: 2000,
  },
  {
    id: 'tomato_seed',
    name: 'Bibit Tomat',
    emoji: '🍅',
    description: 'Bibit tomat untuk ditanam di Farming.',
    price: 2500,
  },
  {
    id: 'carrot_seed',
    name: 'Bibit Wortel',
    emoji: '🥕',
    description: 'Bibit wortel untuk ditanam di Farming.',
    price: 3000,
  },
  {
    id: 'potato_seed',
    name: 'Bibit Kentang',
    emoji: '🥔',
    description: 'Bibit kentang untuk ditanam di Farming.',
    price: 4000,
  },
  {
    id: 'pumpkin_seed',
    name: 'Bibit Labu',
    emoji: '🎃',
    description: 'Bibit labu untuk ditanam di Farming.',
    price: 5000,
  },
];

function seedShopEntries() {
  const entries = {};
  for (const def of SEED_DEFS) {
    entries[def.id] = shopItem({ ...def, category: 'seed' });
  }
  return entries;
}

export const SHOP_ITEMS = Object.freeze({
  [CERELIA_ITEM.id]: shopItem({
    id: CERELIA_ITEM.id,
    name: CERELIA_ITEM.name,
    emoji: '🧪',
    description: 'Material untuk meningkatkan Card dan Sign Card.',
    price: 3000,
  }),
  ...seedShopEntries(),
  ...signShopEntries(),
});

export function getShopItems() {
  return Object.values(SHOP_ITEMS);
}

export function getPurchasableItems() {
  return getShopItems().filter((item) => item.purchasable);
}

export function getInventoryItems() {
  return getPurchasableItems().filter((item) => !item.cardId);
}

export function getShopItem(itemId) {
  if (!itemId) return null;
  return SHOP_ITEMS[itemId] ?? null;
}
