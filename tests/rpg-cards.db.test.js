import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { sql, closeDatabase } from '../src/storage/connection.js';
import { createSchema } from '../src/storage/definitions.js';
import { rpgPlayerModel } from '../src/features/rpg/models/rpg-player.model.js';
import { rpgCardModel } from '../src/features/rpg/models/rpg-card.model.js';
import { rpgCoinModel } from '../src/features/rpg/models/rpg-coin.model.js';
import { rpgInventoryModel } from '../src/features/rpg/models/rpg-inventory.model.js';
import { cardService } from '../src/features/rpg/services/card-service.js';
import {
  MAIN_CARDS,
  SIGN_CARDS,
  bulkLevelCost,
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

const uid = (n) => `rpgcardtest-${process.pid}-${n}@test.local`;
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

describe('rpg card tables (database)', { skip: !dbAvailable }, () => {
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

  it('migration creates card tables with constraints', async () => {
    for (const table of ['rpg_main_cards', 'rpg_sign_cards']) {
      const cols = await sql`
        SELECT column_name, is_nullable FROM information_schema.columns
        WHERE table_name = ${table}
      `;
      const map = Object.fromEntries(cols.map((c) => [c.column_name, c]));
      for (const name of ['user_id', 'card_id', 'level', 'equipped', 'created_at', 'updated_at']) {
        assert.ok(map[name], `${table} missing ${name}`);
        assert.equal(map[name].is_nullable, 'NO');
      }
      const uniques = await sql`
        SELECT kcu.column_name FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_name = ${table} AND tc.constraint_type = 'UNIQUE'
      `;
      assert.deepEqual(uniques.map((r) => r.column_name).sort(), ['card_id', 'user_id']);
    }
    const indexes = await sql`
      SELECT indexname FROM pg_indexes
      WHERE indexname IN ('uq_rpg_main_cards_equipped', 'uq_rpg_sign_cards_equipped')
    `;
    assert.equal(indexes.length, 2);
  });

  it('grants ownership and prevents duplicates', async () => {
    const userId = await makeUser('own');
    const first = await cardService.grantCard(userId, 'girgas');
    assert.equal(first.isNew, true);
    assert.equal(first.card.cardId, 'girgas');
    assert.equal(first.card.level, 1);
    const second = await cardService.grantCard(userId, 'girgas');
    assert.equal(second.isNew, false);
    const count = await sql`SELECT COUNT(*)::int AS n FROM rpg_main_cards WHERE user_id = ${userId}`;
    assert.equal(count[0].n, 1);
    await assert.rejects(cardService.grantCard(userId, 'nope'), RangeError);
  });

  it('levels main cards to 100 with scaling and cost', async () => {
    const userId = await makeUser('lvl');
    await cardService.grantCard(userId, 'lena');
    const up = await cardService.levelUp(userId, 'lena', 24);
    assert.equal(up.fromLevel, 1);
    assert.equal(up.toLevel, 25);
    assert.equal(up.levels, 24);
    assert.deepEqual(
      { coin: up.cost.coin, cerelia: up.cost.cerelia },
      { coin: bulkLevelCost(1, 24, 100).coin, cerelia: bulkLevelCost(1, 24, 100).cerelia }
    );
    assert.equal(up.card.skills.active.unlocked, true);
    const maxed = await cardService.bulkLevelUp(userId, 'lena', 100);
    assert.equal(maxed.toLevel, 100);
    assert.equal(maxed.card.skills.passive.upgraded, true);
    assert.deepEqual(maxed.card.stats, cardStatsAtLevel(getMainCard('lena'), 100));
    await assert.rejects(cardService.levelUp(userId, 'lena'), RangeError);
    await assert.rejects(cardService.levelUp(userId, 'lena', 500), RangeError);
    await assert.rejects(
      sql`UPDATE rpg_main_cards SET level = 101 WHERE user_id = ${userId}`
    );
  });

  it('levels sign cards to 50 with ATK/DEF bonuses', async () => {
    const userId = await makeUser('sign');
    await cardService.grantCard(userId, 'girgas_sign');
    const up = await cardService.levelUp(userId, 'girgas_sign', 49);
    assert.equal(up.toLevel, 50);
    assert.deepEqual(Object.keys(up.card.stats).sort(), ['atk', 'def']);
    assert.ok(up.card.stats.atk > getSignCard('girgas_sign').base.atk);
    await assert.rejects(cardService.levelUp(userId, 'girgas_sign'), RangeError);
    await assert.rejects(
      sql`UPDATE rpg_sign_cards SET level = 51 WHERE user_id = ${userId}`
    );
  });

  it('equips one card per slot and replaces on re-equip', async () => {
    const userId = await makeUser('equip');
    await cardService.grantCard(userId, 'girgas');
    await cardService.grantCard(userId, 'daisy');
    await cardService.equipMainCard(userId, 'girgas');
    assert.equal((await cardService.getEquippedMainCard(userId)).cardId, 'girgas');
    await cardService.equipMainCard(userId, 'daisy');
    assert.equal((await cardService.getEquippedMainCard(userId)).cardId, 'daisy');
    const rows = await sql`SELECT COUNT(*)::int AS n FROM rpg_main_cards WHERE user_id = ${userId} AND equipped = 1`;
    assert.equal(rows[0].n, 1);
    await assert.rejects(cardService.equipMainCard(userId, 'lena'), RangeError);
    await assert.rejects(cardService.equipMainCard(userId, 'girgas_sign'), RangeError);
  });

  it('activates sign passive only on compatible main', async () => {
    const userId = await makeUser('compat');
    await cardService.grantCard(userId, 'girgas');
    await cardService.grantCard(userId, 'daisy');
    await cardService.grantCard(userId, 'girgas_sign');
    await cardService.equipMainCard(userId, 'girgas');
    const on = await cardService.equipSignCard(userId, 'girgas_sign');
    assert.equal(on.signCompatible, true);
    let bonuses = await cardService.getCardBonuses(userId);
    assert.equal(bonuses.sign.compatible, true);
    assert.ok(bonuses.main.hp > 0 && bonuses.sign.atk > 0);
    // ATK/DEF stay, passive drops on an incompatible main.
    await cardService.equipMainCard(userId, 'daisy');
    bonuses = await cardService.getCardBonuses(userId);
    assert.equal(bonuses.sign.compatible, false);
    assert.ok(bonuses.sign.atk > 0 && bonuses.sign.def > 0);
    const fx = await cardService.getActiveEffects(userId);
    assert.ok(fx.every((e) => e.source !== 'sign-passive'));
  });

  it('rejects sign equip without a main and cascades main unequip', async () => {
    const userId = await makeUser('slot');
    await cardService.grantCard(userId, 'lena_sign');
    await assert.rejects(cardService.equipSignCard(userId, 'lena_sign'), RangeError);
    await cardService.grantCard(userId, 'lena');
    await cardService.equipMainCard(userId, 'lena');
    await cardService.equipSignCard(userId, 'lena_sign');
    assert.ok(await cardService.getEquippedSignCard(userId));
    await cardService.unequip(userId, 'main');
    assert.equal(await cardService.getEquippedMainCard(userId), null);
    assert.equal(await cardService.getEquippedSignCard(userId), null);
    assert.equal(await cardService.unequip(userId, 'sign'), null);
    await assert.rejects(cardService.unequip(userId, 'all'), RangeError);
  });

  it('exposes milestone-gated active effects with cooldowns', async () => {
    const userId = await makeUser('fx');
    await cardService.grantCard(userId, 'ameris');
    await cardService.equipMainCard(userId, 'ameris');
    await cardService.levelUp(userId, 'ameris', 99);
    await cardService.grantCard(userId, 'ameris_sign');
    await cardService.equipSignCard(userId, 'ameris_sign');
    const fx = await cardService.getActiveEffects(userId);
    const bySource = Object.fromEntries(fx.map((e) => [e.source, e]));
    assert.equal(bySource['main-active'].upgraded, true);
    assert.equal(bySource['main-active'].cooldownMs, MAIN_CARDS.ameris.active.cooldownMs);
    assert.equal(bySource['main-passive'].upgraded, true);
    assert.equal(bySource['main-passive'].cooldownMs, null);
    assert.equal(bySource['sign-passive'].cooldownMs, null);
    assert.deepEqual(bySource['sign-passive'].effects, SIGN_CARDS.ameris_sign.passive.effects);
  });

  it('enforces FK to rpg_players', async () => {
    await assert.rejects(
      rpgCardModel.grant(`rpgcardtest-ghost-${process.pid}@test.local`, 'girgas', 'main')
    );
  });
});
