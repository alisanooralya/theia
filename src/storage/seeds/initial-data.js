import { initializeDatabase } from '#storage/initializer.js';
import { db } from '#storage/connection.js';
import { logger } from '#helpers/logger.js';

await initializeDatabase();

const { itemModel } = await import('#storage/models/item.js');

const ITEMS = [
  {
    id: 'food_sm',
    name: 'Bread',
    description: 'Pulihkan 100 HP',
    category: 'consumable',
    price: 500,
    rarity: 'common',
    sellable: true,
    stackable: true,
    data: { heal: 100 },
  },
  {
    id: 'food_md',
    name: 'Roasted Meat',
    description: 'Pulihkan 300 HP',
    category: 'consumable',
    price: 1200,
    rarity: 'uncommon',
    sellable: true,
    stackable: true,
    data: { heal: 300 },
  },
  {
    id: 'food_lg',
    name: 'Feast Meal',
    description: 'Pulihkan 600 HP',
    category: 'consumable',
    price: 3000,
    rarity: 'rare',
    sellable: true,
    stackable: true,
    data: { heal: 600 },
  },
  {
    id: 'potion_atk',
    name: 'Attack Food',
    description: 'ATK +10 selama 1 jam',
    category: 'consumable',
    price: 1800,
    rarity: 'uncommon',
    sellable: true,
    stackable: true,
    data: { atk: 10 },
  },
  {
    id: 'potion_def',
    name: 'Defense Food',
    description: 'DEF +10 selama 1 jam',
    category: 'consumable',
    price: 1800,
    rarity: 'uncommon',
    sellable: true,
    stackable: true,
    data: { def: 10 },
  },
  {
    id: 'cerelia',
    name: 'Cerelia',
    description: 'Divergent Universe Core - material untuk level up relic',
    category: 'material',
    price: 0,
    rarity: 'rare',
    sellable: false,
    stackable: true,
    data: {},
  },
];

itemModel.bulkUpsert(ITEMS);
logger.info(`Seeded ${ITEMS.length} items`);
logger.info('Seed complete — run: npm run dev');
