import { initializeDatabase } from '#storage/initializer.js';
import { db } from '#storage/connection.js';
import { logger } from '#helpers/logger.js';

await initializeDatabase();

const { itemModel } = await import('#storage/models/item.js');

const ITEMS = [
  {
    id: 'potion_hp_sm',
    name: 'Health Potion (S)',
    description: 'Pulihkan 50 HP',
    category: 'consumable',
    price: 650,
    rarity: 'common',
    sellable: true,
    stackable: true,
    data: { heal: 50 },
  },
  {
    id: 'potion_hp_md',
    name: 'Health Potion (M)',
    description: 'Pulihkan 150 HP',
    category: 'consumable',
    price: 1500,
    rarity: 'uncommon',
    sellable: true,
    stackable: true,
    data: { heal: 150 },
  },
  {
    id: 'potion_exp',
    name: 'EXP Booster',
    description: '2x EXP selama 1 jam',
    category: 'consumable',
    price: 6000,
    rarity: 'rare',
    sellable: true,
    stackable: true,
    data: { mult: 2 },
  },
  {
    id: 'potion_atk',
    name: 'Attack Potion',
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
    name: 'Defense Potion',
    description: 'DEF +10 selama 1 jam',
    category: 'consumable',
    price: 1800,
    rarity: 'uncommon',
    sellable: true,
    stackable: true,
    data: { def: 10 },
  },
  {
    id: 'bank_upgrade',
    name: 'Bank Upgrade',
    description: 'Limit bank +50000',
    category: 'special',
    price: 18000,
    rarity: 'uncommon',
    sellable: false,
    stackable: false,
    data: {},
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
db.prepare('DELETE FROM items WHERE id = ?').run('premium_7d');
db.prepare('DELETE FROM items WHERE id = ?').run('potion_hp_lg');
logger.info(`Seeded ${ITEMS.length} items`);
logger.info('Seed complete — run: npm run dev');
