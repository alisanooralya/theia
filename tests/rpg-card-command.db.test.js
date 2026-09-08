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
  executeCard,
  formatMainCards,
  formatSignCards,
} from '../src/commands/modules/rpg/card.js';

let dbAvailable;
try {
  await sql`SELECT 1`;
  dbAvailable = true;
} catch {
  dbAvailable = false;
}

const uid = (n) => `rpgcardcmtest-${process.pid}-${n}@test.local`;
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

function stubCtx(userId, args) {
  const replies = [];
  return {
    ctx: {
      sender: userId,
      args,
      reply: async (msg) => replies.push(msg),
    },
    replies,
  };
}

describe('card command (database)', { skip: !dbAvailable }, () => {
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

  it('1-2. .card lists owned mains with equipped status', async () => {
    const userId = await makeUser('list');
    const { ctx, replies: r2 } = stubCtx(userId, []);
    await executeCard(ctx);
    assert.ok(r2[0].includes('Belum ada Main Card'));
    await cardService.grantCard(userId, 'girgas');
    await cardService.levelUp(userId, 'girgas', 24);
    await cardService.equipMainCard(userId, 'girgas');
    await cardService.grantCard(userId, 'lena');
    const { ctx: c2, replies: r3 } = stubCtx(userId, []);
    await executeCard(c2);
    assert.ok(r3[0].includes('Girgas'));
    assert.ok(r3[0].includes('Lena'));
    assert.ok(r3[0].includes('🟢 Equipped'));
    assert.ok(r3[0].includes('⚪ Not Equipped'));
    assert.ok(r3[0].includes('Active: Unlocked'));
    assert.ok(r3[0].includes('Passive: Locked'));
  });

  it('3-6. equip/unequip main via command, single equipped', async () => {
    const userId = await makeUser('equip');
    await cardService.grantCard(userId, 'girgas');
    await cardService.grantCard(userId, 'daisy');
    let s = stubCtx(userId, ['equip', 'girgas']);
    await executeCard(s.ctx);
    assert.ok(s.replies[0].includes('equipped'));
    assert.equal(
      (await cardService.getEquippedMainCard(userId)).cardId,
      'girgas'
    );
    s = stubCtx(userId, ['equip', 'daisy']);
    await executeCard(s.ctx);
    assert.equal(
      (await cardService.getEquippedMainCard(userId)).cardId,
      'daisy'
    );
    const rows =
      await sql`SELECT COUNT(*)::int AS n FROM rpg_main_cards WHERE user_id = ${userId} AND equipped = 1`;
    assert.equal(rows[0].n, 1);
    s = stubCtx(userId, ['unequip']);
    await executeCard(s.ctx);
    assert.equal(await cardService.getEquippedMainCard(userId), null);
    assert.ok(s.replies[0].includes('unequipped'));
    s = stubCtx(userId, ['unequip']);
    await executeCard(s.ctx);
    assert.ok(s.replies[0].includes('Tidak ada Main Card'));
  });

  it('5. equipping unowned card rejected without crash', async () => {
    const userId = await makeUser('unowned');
    const { ctx, replies } = stubCtx(userId, ['equip', 'ameris']);
    await executeCard(ctx);
    assert.ok(replies[0].includes('Gagal:'));
    assert.equal(await cardService.getEquippedMainCard(userId), null);
    const bad = stubCtx(userId, ['equip']);
    await executeCard(bad.ctx);
    assert.ok(bad.replies[0].includes('Usage'));
  });

  it('7-10. sign list/equip/unequip via command', async () => {
    const userId = await makeUser('sign');
    let s = stubCtx(userId, ['sign']);
    await executeCard(s.ctx);
    assert.ok(s.replies[0].includes('Belum ada Sign Card'));
    await cardService.grantCard(userId, 'girgas_sign');
    s = stubCtx(userId, ['sign', 'equip', 'girgas_sign']);
    await executeCard(s.ctx);
    assert.ok(s.replies[0].includes('Gagal:'));
    await cardService.grantCard(userId, 'girgas');
    await cardService.equipMainCard(userId, 'girgas');
    s = stubCtx(userId, ['sign', 'equip', 'girgas_sign']);
    await executeCard(s.ctx);
    assert.ok(s.replies[0].includes('equipped'));
    s = stubCtx(userId, ['sign']);
    await executeCard(s.ctx);
    assert.ok(s.replies[0].includes('Girgas Sign'));
    assert.ok(s.replies[0].includes('🟢 Equipped'));
    s = stubCtx(userId, ['sign', 'unequip']);
    await executeCard(s.ctx);
    assert.equal(await cardService.getEquippedSignCard(userId), null);
    s = stubCtx(userId, ['sign', 'equip']);
    await executeCard(s.ctx);
    assert.ok(s.replies[0].includes('Usage'));
  });

  it('11-13. incompatible sign equips with inactive passive', async () => {
    const userId = await makeUser('incompat');
    await cardService.grantCard(userId, 'girgas');
    await cardService.grantCard(userId, 'daisy_sign');
    await cardService.equipMainCard(userId, 'girgas');
    const { ctx, replies } = stubCtx(userId, ['sign', 'equip', 'daisy_sign']);
    await executeCard(ctx);
    assert.ok(replies[0].includes('Inactive'));
    const equipped = await cardService.getEquippedSignCard(userId);
    assert.equal(equipped.signCompatible, false);
    const { ctx: c2, replies: r2 } = stubCtx(userId, ['sign']);
    await executeCard(c2);
    assert.ok(r2[0].includes('Passive: Inactive'));
    assert.ok(r2[0].includes('Incompatible'));
  });

  it('14-15. equip/unequip flows into FinalStats, no duplicate equipped', async () => {
    const userId = await makeUser('final');
    await cardService.grantCard(userId, 'lena');
    await cardService.levelUp(userId, 'lena', 9);
    const base = await finalStatService.getFinalStats(userId);
    let s = stubCtx(userId, ['equip', 'lena']);
    await executeCard(s.ctx);
    const equipped = await finalStatService.getFinalStats(userId);
    assert.ok(equipped.atk > base.atk && equipped.maxHp > base.maxHp);
    s = stubCtx(userId, ['unequip']);
    await executeCard(s.ctx);
    const after = await finalStatService.getFinalStats(userId);
    assert.deepEqual(after, base);
    const rows =
      await sql`SELECT COUNT(*)::int AS n FROM rpg_main_cards WHERE user_id = ${userId} AND equipped = 1`;
    assert.equal(rows[0].n, 0);
  });

  it('16. unknown subcommand and errors never crash', async () => {
    const userId = await makeUser('err');
    for (const args of [
      ['bogus'],
      ['sign', 'bogus'],
      ['equip', 'nope'],
      ['sign', 'equip', 'nope'],
    ]) {
      const { ctx, replies } = stubCtx(userId, args);
      await executeCard(ctx);
      assert.equal(replies.length, 1);
    }
  });

  it('pure formatters handle empty states', () => {
    assert.ok(formatMainCards([]).includes('Belum ada Main Card'));
    assert.ok(formatSignCards([]).includes('Belum ada Sign Card'));
  });
});
