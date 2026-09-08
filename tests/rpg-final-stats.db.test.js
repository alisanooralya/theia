import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { sql, closeDatabase } from '../src/storage/connection.js';
import { createSchema } from '../src/storage/definitions.js';
import { rpgPlayerModel } from '../src/features/rpg/models/rpg-player.model.js';
import { rpgCoinModel } from '../src/features/rpg/models/rpg-coin.model.js';
import { rpgInventoryModel } from '../src/features/rpg/models/rpg-inventory.model.js';
import { cardService } from '../src/features/rpg/services/card-service.js';
import { finalStatService } from '../src/features/rpg/services/final-stat-service.js';
import {
  cardStatsAtLevel,
  getMainCard,
  getSignCard,
} from '../src/features/rpg/config/card-config.js';

let dbAvailable;
try {
  await sql`SELECT 1`;
  dbAvailable = true;
} catch {
  dbAvailable = false;
}

const uid = (n) => `rpgfinaltest-${process.pid}-${n}@test.local`;
const createdUsers = [];

async function makeUser(n) {
  const userId = uid(n);
  await sql`INSERT INTO users (jid) VALUES (${userId}) ON CONFLICT (jid) DO NOTHING`;
  await rpgPlayerModel.ensure(userId);
  await rpgCoinModel.ensure(userId);
  await rpgCoinModel.addCoin(userId, 5000000);
  await rpgInventoryModel.add(userId, 'cerelia', 10000);
  createdUsers.push(userId);
  return userId;
}

describe('final stats (database)', { skip: !dbAvailable }, () => {
  before(async () => {
    await createSchema();
    await createSchema();
  });

  after(async () => {
    if (createdUsers.length) {
      await sql`DELETE FROM users WHERE jid = ANY(${createdUsers})`;
    }
    await closeDatabase();
  });

  it('1. base stats without cards pass through untouched', async () => {
    const userId = await makeUser('base');
    const base = await rpgPlayerModel.get(userId);
    const final = await finalStatService.getFinalStats(userId);
    assert.deepEqual(final, {
      level: base.level,
      exp: base.exp,
      maxHp: base.max_hp,
      currentHp: base.current_hp,
      atk: base.atk,
      def: base.def,
      critRate: base.crit_rate,
      critDmg: base.crit_dmg,
    });
  });

  it('2. equipped main card adds HP/ATK/DEF at its level', async () => {
    const userId = await makeUser('main');
    await cardService.grantCard(userId, 'girgas');
    await cardService.levelUp(userId, 'girgas', 24);
    await cardService.equipMainCard(userId, 'girgas');
    const expected = cardStatsAtLevel(getMainCard('girgas'), 25);
    const final = await finalStatService.getFinalStats(userId);
    assert.equal(final.maxHp, 100 + expected.hp);
    assert.equal(final.atk, 10 + expected.atk);
    assert.equal(final.def, 5 + expected.def);
    assert.equal(final.currentHp, 100);
  });

  it('3-4. sign bonuses accumulate on top of main bonuses', async () => {
    const userId = await makeUser('both');
    await cardService.grantCard(userId, 'lena');
    await cardService.levelUp(userId, 'lena', 9);
    await cardService.equipMainCard(userId, 'lena');
    await cardService.grantCard(userId, 'lena_sign');
    await cardService.levelUp(userId, 'lena_sign', 9);
    await cardService.equipSignCard(userId, 'lena_sign');
    const m = cardStatsAtLevel(getMainCard('lena'), 10);
    const s = cardStatsAtLevel(getSignCard('lena_sign'), 10);
    const final = await finalStatService.getFinalStats(userId);
    assert.equal(final.maxHp, 100 + m.hp);
    assert.equal(final.atk, 10 + m.atk + s.atk);
    assert.equal(final.def, 5 + m.def + s.def);
  });

  it('5. owned but unequipped cards grant nothing', async () => {
    const userId = await makeUser('unequipped');
    await cardService.grantCard(userId, 'daisy');
    await cardService.levelUp(userId, 'daisy', 50);
    await cardService.grantCard(userId, 'daisy_sign');
    const final = await finalStatService.getFinalStats(userId);
    assert.equal(final.maxHp, 100);
    assert.equal(final.atk, 10);
    assert.equal(final.def, 5);
  });

  it('6. incompatible sign still adds ATK/DEF, no passive in final stats', async () => {
    const userId = await makeUser('incompat');
    await cardService.grantCard(userId, 'girgas');
    await cardService.equipMainCard(userId, 'girgas');
    await cardService.grantCard(userId, 'daisy_sign');
    await cardService.equipSignCard(userId, 'daisy_sign');
    const s = cardStatsAtLevel(getSignCard('daisy_sign'), 1);
    const final = await finalStatService.getFinalStats(userId);
    assert.equal(final.atk, 10 + cardStatsAtLevel(getMainCard('girgas'), 1).atk + s.atk);
    assert.equal(final.def, 5 + cardStatsAtLevel(getMainCard('girgas'), 1).def + s.def);
    assert.deepEqual(Object.keys(final).sort(), [
      'atk',
      'critDmg',
      'critRate',
      'currentHp',
      'def',
      'exp',
      'level',
      'maxHp',
    ]);
  });

  it('7-8. card level changes flow into final stats', async () => {
    const userId = await makeUser('levels');
    await cardService.grantCard(userId, 'ameris');
    await cardService.equipMainCard(userId, 'ameris');
    await cardService.grantCard(userId, 'ameris_sign');
    await cardService.equipSignCard(userId, 'ameris_sign');
    const before = await finalStatService.getFinalStats(userId);
    await cardService.levelUp(userId, 'ameris', 10);
    await cardService.levelUp(userId, 'ameris_sign', 10);
    const after = await finalStatService.getFinalStats(userId);
    const m = cardStatsAtLevel(getMainCard('ameris'), 11);
    const s = cardStatsAtLevel(getSignCard('ameris_sign'), 11);
    assert.ok(after.maxHp > before.maxHp && after.atk > before.atk && after.def > before.def);
    assert.equal(after.maxHp, 100 + m.hp);
    assert.equal(after.atk, 10 + m.atk + s.atk);
    assert.equal(after.def, 5 + m.def + s.def);
  });

  it('9. currentHp stays pinned to the database value', async () => {
    const userId = await makeUser('hp');
    await rpgPlayerModel.setCurrentHp(userId, 37);
    await cardService.grantCard(userId, 'daisy');
    await cardService.levelUp(userId, 'daisy', 99);
    await cardService.equipMainCard(userId, 'daisy');
    const final = await finalStatService.getFinalStats(userId);
    assert.ok(final.maxHp > 37);
    assert.equal(final.currentHp, 37);
    assert.equal((await rpgPlayerModel.get(userId)).current_hp, 37);
  });

  it('10. final stats are never persisted', async () => {
    const userId = await makeUser('persist');
    await cardService.grantCard(userId, 'girgas');
    await cardService.equipMainCard(userId, 'girgas');
    const before = await rpgPlayerModel.get(userId);
    await finalStatService.getFinalStats(userId);
    const after = await rpgPlayerModel.get(userId);
    assert.deepEqual(after, before);
    const tables = await sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_name LIKE 'rpg\_%\_stats' OR table_name = 'rpg_final_stats'
    `;
    assert.equal(tables.length, 0);
    const cols = await sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'rpg_players' AND column_name LIKE '%final%'
    `;
    assert.equal(cols.length, 0);
  });
});
