import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { sql, closeDatabase } from '../src/storage/connection.js';
import { createSchema } from '../src/storage/definitions.js';
import { rpgPlayerModel } from '../src/features/rpg/models/rpg-player.model.js';
import { rpgCoinModel } from '../src/features/rpg/models/rpg-coin.model.js';
import { rpgInventoryModel } from '../src/features/rpg/models/rpg-inventory.model.js';
import { cardService } from '../src/features/rpg/services/card-service.js';
import { profileService } from '../src/features/rpg/services/profile-service.js';

let dbAvailable;
try {
  await sql`SELECT 1`;
  dbAvailable = true;
} catch {
  dbAvailable = false;
}

const uid = (n) => `rpgprofiletest-${process.pid}-${n}@test.local`;
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

async function snapshot(userId) {
  const player = await rpgPlayerModel.get(userId);
  const cards = await cardService.getOwnedCards(userId);
  return JSON.stringify({ player, cards });
}

describe('profile read-only (database)', { skip: !dbAvailable }, () => {
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

  it('renders full profile without changing the database', async () => {
    const userId = await makeUser('full');
    await rpgPlayerModel.setCurrentHp(userId, 37);
    await cardService.grantCard(userId, 'girgas');
    await cardService.levelUp(userId, 'girgas', 24);
    await cardService.equipMainCard(userId, 'girgas');
    await cardService.grantCard(userId, 'girgas_sign');
    await cardService.equipSignCard(userId, 'girgas_sign');
    const before = await snapshot(userId);
    const data = await profileService.getProfileData(userId);
    assert.equal(data.currentHp, 37);
    assert.equal(data.main.name, 'Girgas');
    assert.equal(data.sign.compatible, true);
    assert.equal(await snapshot(userId), before);
  });

  it('auto-creates player for new users via existing ensure behavior', async () => {
    const userId = uid('new');
    await sql`INSERT INTO users (jid) VALUES (${userId}) ON CONFLICT (jid) DO NOTHING`;
    createdUsers.push(userId);
    const data = await profileService.getProfileData(userId);
    assert.equal(data.level, 1);
    assert.equal(data.main, null);
    assert.equal(data.sign, null);
    const again = await snapshot(userId);
    await profileService.getProfileData(userId);
    assert.equal(await snapshot(userId), again);
  });

  it('handles HP 0 and incompatible sign from live data', async () => {
    const userId = await makeUser('edge');
    await rpgPlayerModel.setCurrentHp(userId, 0);
    await cardService.grantCard(userId, 'girgas');
    await cardService.equipMainCard(userId, 'girgas');
    await cardService.grantCard(userId, 'daisy_sign');
    await cardService.equipSignCard(userId, 'daisy_sign');
    const before = await snapshot(userId);
    const data = await profileService.getProfileData(userId);
    assert.equal(data.currentHp, 0);
    assert.equal(data.sign.compatible, false);
    assert.equal(await snapshot(userId), before);
  });
});
