import { initializeDatabase } from '#storage/initializer.js';
import { db } from '#storage/connection.js';
import { logger } from '#helpers/logger.js';

await initializeDatabase();

const { itemModel } = await import('#storage/models/item.js');
const { questModel } = await import('#storage/models/quest.js');

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

const QUESTS = [
  {
    id: 'daily_win',
    name: 'Pemenang Harian',
    description: 'Menang 3 battle hari ini',
    type: 'daily',
    goal: 3,
    rewardCash: 3000,
    rewardExp: 50,
  },
  {
    id: 'daily_rob',
    name: 'Perampok Harian',
    description: 'Rampok 1 user hari ini',
    type: 'daily',
    goal: 1,
    rewardCash: 1500,
    rewardExp: 20,
  },
  {
    id: 'daily_shop',
    name: 'Belanja Harian',
    description: 'Beli 1 item di toko',
    type: 'daily',
    goal: 1,
    rewardCash: 500,
    rewardExp: 10,
  },
  {
    id: 'weekly_win',
    name: 'Warrior Minggu Ini',
    description: 'Menang 20 battle minggu ini',
    type: 'weekly',
    goal: 20,
    rewardCash: 25000,
    rewardExp: 300,
  },
  {
    id: 'total_battles',
    name: 'Battle Maniac',
    description: 'Ikut 50 battle total',
    type: 'story',
    goal: 50,
    rewardCash: 10000,
    rewardExp: 200,
  },
];

itemModel.bulkUpsert(ITEMS);
db.prepare('DELETE FROM items WHERE id = ?').run('premium_7d');
db.prepare('DELETE FROM items WHERE id = ?').run('potion_hp_lg');
logger.info(`Seeded ${ITEMS.length} items`);

questModel.bulkUpsert(QUESTS);
logger.info(`Seeded ${QUESTS.length} quests`);
logger.info('Seed complete — run: npm run dev');
