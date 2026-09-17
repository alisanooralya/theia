import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { sql } from '../src/storage/connection.js';
import { createCardService } from '../src/features/rpg/services/card-service.js';
import { createFinalStatService } from '../src/features/rpg/services/final-stat-service.js';
import {
  createProfileService,
  formatProfile,
} from '../src/features/rpg/services/profile-service.js';
import { createGachaService } from '../src/features/rpg/services/gacha-service.js';
import { GACHA_DUPLICATE_COMPENSATION } from '../src/features/rpg/config/gacha-config.js';
import { rpgCardModel } from '../src/features/rpg/models/rpg-card.model.js';
import { rpgPlayerModel } from '../src/features/rpg/models/rpg-player.model.js';
import { rpgCoinModel } from '../src/features/rpg/models/rpg-coin.model.js';
import { rpgInventoryModel } from '../src/features/rpg/models/rpg-inventory.model.js';
import { battleSkillsFromEffects } from '../src/features/rpg/services/battle-engine.js';

let dbAvailable = false;
try {
  await sql`SELECT 1`;
  dbAvailable = true;
} catch {
  dbAvailable = false;
}

const USER = 'luuk_localtest';

function seqRandom(values) {
  const queue = [...values];
  return () => (queue.length ? queue.shift() : 0.99);
}

describe(
  'luuk db integration (pg lokal)',
  { skip: dbAvailable ? false : 'pg lokal tidak tersedia' },
  () => {
    const cards = createCardService();
    const finals = createFinalStatService();
    const profile = createProfileService();
    const gacha = createGachaService();

    before(async () => {
      await sql`DELETE FROM users WHERE jid = ${USER}`;
    });

    after(async () => {
      await sql`DELETE FROM users WHERE jid = ${USER}`;
      await sql.end();
    });

    it('grant + equip luuk main & sign', async () => {
      const main = await cards.grantCard(USER, 'luuk');
      assert.equal(main.card.definition.name, 'Luuk');
      assert.equal(main.isNew, true);
      const sign = await cards.grantCard(USER, 'luuk_sign');
      assert.equal(sign.card.definition.name, 'Luuk Sign');
      await cards.equipMainCard(USER, 'luuk');
      const equippedSign = await cards.equipSignCard(USER, 'luuk_sign');
      assert.equal(equippedSign.signCompatible, true);
    });

    it('final stats = base + luuk lv1', async () => {
      const final = await finals.getFinalStats(USER);
      // base 173/23/9 + main 233/110/9 + sign 40/15
      assert.equal(final.maxHp, 173 + 233);
      assert.equal(final.atk, 23 + 110 + 40);
      assert.equal(final.def, 9 + 9 + 15);
    });

    it('level 100/50 -> final stats target', async () => {
      await rpgCardModel.setLevel(USER, 'luuk', 'main', 100);
      await rpgCardModel.setLevel(USER, 'luuk_sign', 'sign', 50);
      const final = await finals.getFinalStats(USER);
      assert.equal(final.maxHp, 173 + 2450);
      assert.equal(final.atk, 23 + 1100 + 172);
      assert.equal(final.def, 9 + 68 + 64);
    });

    it('active effects berisi savage rend + predatory instinct + blood scent', async () => {
      const effects = await cards.getActiveEffects(USER);
      const bySource = Object.fromEntries(effects.map((e) => [e.source, e]));
      assert.equal(bySource['main-active'].name, 'Savage Rend');
      assert.equal(bySource['main-active'].upgraded, true);
      assert.equal(bySource['main-passive'].name, 'Predatory Instinct');
      assert.equal(bySource['sign-passive'].name, 'Blood Scent');
      const skills = battleSkillsFromEffects(effects);
      assert.equal(skills.active.buffs[0].modifiers.defIgnore, 0.35);
      assert.equal(skills.passives.length, 2);
    });

    it('profile menampilkan luuk', async () => {
      const data = await profile.getProfileData(USER);
      assert.equal(data.main.name, 'Luuk');
      assert.equal(data.main.level, 100);
      assert.equal(data.main.active.name, 'Savage Rend');
      assert.equal(data.main.passive.name, 'Predatory Instinct');
      assert.equal(data.sign.name, 'Luuk Sign');
      const text = formatProfile(data);
      assert.ok(text.includes('Luuk'));
      assert.ok(text.includes('Savage Rend'));
      assert.ok(text.includes('Predatory Instinct'));
      assert.ok(text.includes('Luuk Sign'));
    });

    it('gacha bisa drop luuk + duplicate ikut aturan existing', async () => {
      const dupeUser = `${USER}_gacha`;
      await sql`DELETE FROM users WHERE jid = ${dupeUser}`;
      await rpgPlayerModel.ensure(dupeUser);
      await rpgCoinModel.ensure(dupeUser);
      await rpgCoinModel.addCoin(dupeUser, 100000);
      const first = await gacha.pull(dupeUser, 1, {
        requestKey: `luuk-test-${Date.now()}-1`,
        random: seqRandom([0.005, 0.85]),
      });
      assert.equal(first.results[0].type, 'main');
      assert.equal(first.results[0].cardId, 'luuk');
      const second = await gacha.pull(dupeUser, 1, {
        requestKey: `luuk-test-${Date.now()}-2`,
        random: seqRandom([0.005, 0.85]),
      });
      assert.equal(second.results[0].type, 'duplicate');
      assert.deepEqual(second.results[0].compensation, {
        ...GACHA_DUPLICATE_COMPENSATION,
      });
      const qty = await rpgInventoryModel.getQuantity(
        dupeUser,
        GACHA_DUPLICATE_COMPENSATION.itemId
      );
      assert.ok(qty >= GACHA_DUPLICATE_COMPENSATION.quantity);
      await sql`DELETE FROM users WHERE jid = ${dupeUser}`;
    });
  }
);
