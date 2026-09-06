import { initializeDatabase } from '#storage/initializer.js';
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
    description: 'ATK +10% selama 1 jam',
    category: 'consumable',
    price: 1800,
    rarity: 'uncommon',
    sellable: true,
    stackable: true,
    data: { atkPercent: 10 },
  },
  {
    id: 'potion_atk_md',
    name: 'Greater Attack Food',
    description: 'ATK +20% selama 1 jam',
    category: 'consumable',
    price: 3600,
    rarity: 'rare',
    sellable: true,
    stackable: true,
    data: { atkPercent: 20 },
  },
  {
    id: 'potion_def',
    name: 'Defense Food',
    description: 'DEF +10% selama 1 jam',
    category: 'consumable',
    price: 1800,
    rarity: 'uncommon',
    sellable: true,
    stackable: true,
    data: { defPercent: 10 },
  },
  {
    id: 'potion_def_md',
    name: 'Greater Defense Food',
    description: 'DEF +20% selama 1 jam',
    category: 'consumable',
    price: 3600,
    rarity: 'rare',
    sellable: true,
    stackable: true,
    data: { defPercent: 20 },
  },
  {
    id: 'cerelia',
    name: 'Cerelia',
    description: 'Divergent Universe Core - material langka dari DU',
    category: 'material',
    price: 0,
    rarity: 'rare',
    sellable: false,
    stackable: true,
    data: {},
  },
];

await itemModel.bulkUpsert(ITEMS);
logger.info('Seed complete — run: npm run dev');
