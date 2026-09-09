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
  formatLevelUp,
  formatMainCards,
  formatSignCards,
} from '../src/commands/modules/rpg/card.js';
import {
  affordableLevels,
  getBulkLevelUpCost,
} from '../src/features/rpg/config/card-config.js';

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
      fail: async (msg) => {
        throw new Error(msg);
      },
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
    assert.ok(r3[0].includes('Equipped'));
    assert.ok(r3[0].includes('Not Equipped'));
    assert.ok(r3[0].includes('(*unlocked*)'));
    assert.ok(r3[0].includes('(*unlocks* at lv.50)'));
    assert.ok(r3[0].includes('(cd: 8s)'));
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
    const { ctx } = stubCtx(userId, ['equip', 'ameris']);
    await assert.rejects(executeCard(ctx), /card not owned/);
    assert.equal(await cardService.getEquippedMainCard(userId), null);
    const bad = stubCtx(userId, ['equip']);
    await assert.rejects(executeCard(bad.ctx), /Usage/);
  });

  it('7-10. sign list/equip/unequip via command', async () => {
    const userId = await makeUser('sign');
    let s = stubCtx(userId, ['sign']);
    await executeCard(s.ctx);
    assert.ok(s.replies[0].includes('Belum ada Sign Card'));
    await cardService.grantCard(userId, 'girgas_sign');
    s = stubCtx(userId, ['sign', 'equip', 'girgas_sign']);
    await assert.rejects(executeCard(s.ctx), /requires an equipped main card/);
    await cardService.grantCard(userId, 'girgas');
    await cardService.equipMainCard(userId, 'girgas');
    s = stubCtx(userId, ['sign', 'equip', 'girgas_sign']);
    await executeCard(s.ctx);
    assert.ok(s.replies[0].includes('equipped'));
    s = stubCtx(userId, ['sign']);
    await executeCard(s.ctx);
    assert.ok(s.replies[0].includes('Girgas Sign'));
    assert.ok(s.replies[0].includes('Equipped'));
    s = stubCtx(userId, ['sign', 'unequip']);
    await executeCard(s.ctx);
    assert.equal(await cardService.getEquippedSignCard(userId), null);
    s = stubCtx(userId, ['sign', 'equip']);
    await assert.rejects(executeCard(s.ctx), /Usage/);
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
    assert.ok(r2[0].includes('*inactive*'));
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
      const { ctx } = stubCtx(userId, args);
      await assert.rejects(executeCard(ctx), Error);
    }
  });

  it('pure formatters handle empty states', () => {
    assert.ok(formatMainCards([]).includes('Belum ada Main Card'));
    assert.ok(formatSignCards([]).includes('Belum ada Sign Card'));
  });

  function failCtx(userId, args) {
    const replies = [];
    return {
      ctx: {
        sender: userId,
        args,
        reply: async (msg) => replies.push(msg),
        fail: async (msg) => {
          throw new Error(msg);
        },
      },
      replies,
    };
  }

  async function balances(userId) {
    return {
      coin: await rpgCoinModel.getBalance(userId),
      cerelia: await rpgInventoryModel.getQuantity(userId, 'cerelia'),
    };
  }

  it('1-2. levelup without args works; numeric args rejected', async () => {
    const userId = await makeUser('lvlup');
    await cardService.grantCard(userId, 'girgas');
    await cardService.equipMainCard(userId, 'girgas');
    const { ctx, replies } = failCtx(userId, ['levelup']);
    await executeCard(ctx);
    assert.ok(replies[0].includes('Lv.1 →'));
    assert.ok(replies[0].includes('Level Up berhasil'));

    const bad = failCtx(userId, ['levelup', '20']);
    await assert.rejects(executeCard(bad.ctx), /Usage/);
    const badSign = failCtx(userId, ['sign', 'levelup', '5']);
    await assert.rejects(executeCard(badSign.ctx), /Usage/);
  });

  it('3-4. auto-levels to affordable level and stops when broke', async () => {
    const userId = await makeUser('auto');
    // Drain to exactly Lv1 -> Lv3 funds (5000+5500 coin, 5+6 cerelia).
    const start = await balances(userId);
    await rpgCoinModel.spendCoin(userId, start.coin - 10500);
    await rpgInventoryModel.remove(userId, 'cerelia', start.cerelia - 11);
    await cardService.grantCard(userId, 'lena');
    await cardService.equipMainCard(userId, 'lena');
    const { ctx, replies } = failCtx(userId, ['levelup']);
    await executeCard(ctx);
    assert.ok(replies[0].includes('Lv.1 → Lv.3'));
    assert.ok(replies[0].includes('Coin: -10,500') || replies[0].includes('Coin: -10500'));
    assert.deepEqual(await balances(userId), { coin: 0, cerelia: 0 });
    // Nothing left for Lv4: reports no progress, deducts nothing.
    const again = failCtx(userId, ['levelup']);
    await executeCard(again.ctx);
    assert.ok(again.replies[0].includes('Lv.3 → Lv.3'));
    assert.ok(again.replies[0].includes('tidak cukup'));
    assert.deepEqual(await balances(userId), { coin: 0, cerelia: 0 });
  });

  it('5-6. never exceeds max level', async () => {
    const userId = await makeUser('maxcmd');
    await cardService.grantCard(userId, 'daisy');
    await cardService.equipMainCard(userId, 'daisy');
    await cardService.grantCard(userId, 'daisy_sign');
    await cardService.equipMainCard(userId, 'daisy');
    await cardService.bulkLevelUp(userId, 'daisy', 100);
    const { ctx, replies } = failCtx(userId, ['levelup']);
    await executeCard(ctx);
    assert.ok(replies[0].includes('level maksimum'));
    const s = failCtx(userId, ['sign', 'levelup']);
    await assert.rejects(executeCard(s.ctx), /no equipped sign card/);
  });

  it('7-9. per-level costs deducted exactly', async () => {
    const userId = await makeUser('cost');
    await cardService.grantCard(userId, 'ameris');
    await cardService.equipMainCard(userId, 'ameris');
    const before = await balances(userId);
    const afford = affordableLevels(1, before.coin, before.cerelia, 100);
    const { ctx, replies } = failCtx(userId, ['levelup']);
    await executeCard(ctx);
    const card = await cardService.getEquippedMainCard(userId);
    assert.equal(card.level, afford.toLevel);
    const expected = getBulkLevelUpCost('main', 1, afford.toLevel);
    assert.equal(before.coin - (await balances(userId)).coin, expected.coin);
    assert.equal(before.cerelia - (await balances(userId)).cerelia, expected.cerelia);
    assert.ok(replies[0].includes(`Lv.1 → Lv.${afford.toLevel}`));
  });

  it('10. final stats follow the leveled card', async () => {
    const userId = await makeUser('finalcmd');
    await cardService.grantCard(userId, 'girgas');
    await cardService.equipMainCard(userId, 'girgas');
    const before = await finalStatService.getFinalStats(userId);
    const { ctx } = failCtx(userId, ['levelup']);
    await executeCard(ctx);
    const after = await finalStatService.getFinalStats(userId);
    assert.ok(after.maxHp > before.maxHp && after.atk > before.atk);
    assert.equal(after.currentHp, before.currentHp);
  });

  it('11. failed levelup deducts nothing', async () => {
    const userId = await makeUser('failcmd');
    await cardService.grantCard(userId, 'girgas');
    await cardService.equipMainCard(userId, 'girgas');
    // Leave 1 coin: Lv2 is unaffordable.
    const start = await balances(userId);
    await rpgCoinModel.spendCoin(userId, start.coin - 1);
    const before = await balances(userId);
    const { ctx, replies } = failCtx(userId, ['levelup']);
    await executeCard(ctx);
    assert.ok(replies[0].includes('tidak cukup'));
    assert.deepEqual(await balances(userId), before);
    assert.equal((await cardService.getEquippedMainCard(userId)).level, 1);
  });

  it('12. concurrent levelups stay consistent', async () => {
    const userId = await makeUser('race');
    await cardService.grantCard(userId, 'lena');
    await cardService.equipMainCard(userId, 'lena');
    const start = await balances(userId);
    const [a, b] = await Promise.all([
      cardService.autoLevelUp(userId, 'main'),
      cardService.autoLevelUp(userId, 'main'),
    ]);
    const end = await balances(userId);
    const final = await cardService.getEquippedMainCard(userId);
    // Exactly one winner charges; the loser is a no-op on fresh state.
    const spent = start.coin - end.coin;
    const expected = getBulkLevelUpCost('main', 1, final.level);
    assert.equal(spent, expected.coin);
    assert.equal(start.cerelia - end.cerelia, expected.cerelia);
    assert.ok(a.leveled !== b.leveled);
  });

  it('13. sign uses the same generic flow', async () => {
    const userId = await makeUser('signcmd');
    await cardService.grantCard(userId, 'girgas');
    await cardService.equipMainCard(userId, 'girgas');
    await cardService.grantCard(userId, 'girgas_sign');
    await cardService.equipSignCard(userId, 'girgas_sign');
    const { ctx, replies } = failCtx(userId, ['sign', 'levelup']);
    await executeCard(ctx);
    const sign = await cardService.getEquippedSignCard(userId);
    assert.ok(sign.level > 1 && sign.level <= 50);
    assert.ok(replies[0].includes(`Lv.1 → Lv.${sign.level}`));
  });

  it('14. no hardcoded card ids in command', async () => {
    const { readFile } = await import('node:fs/promises');
    const src = await readFile(new URL('../src/commands/modules/rpg/card.js', import.meta.url), 'utf8');
    for (const id of ['girgas', 'lena', 'ameris', 'daisy']) {
      assert.ok(!src.includes(`'${id}'`) && !src.includes(`"${id}"`), id);
    }
  });

  it('pure formatLevelUp covers all states', () => {
    const ok = formatLevelUp({ name: 'Girgas', leveled: true, maxed: false, fromLevel: 15, toLevel: 18, cost: { coin: 1000, cerelia: 5 } });
    assert.ok(ok.includes('Lv.15 → Lv.18'));
    assert.ok(ok.includes('berhasil'));
    const broke = formatLevelUp({ name: 'Girgas', leveled: false, maxed: false, level: 15 });
    assert.ok(broke.includes('Lv.15 → Lv.15'));
    assert.ok(broke.includes('tidak cukup'));
    const maxed = formatLevelUp({ name: 'Girgas', leveled: false, maxed: true, level: 100 });
    assert.ok(maxed.includes('Lv.100'));
    assert.ok(maxed.includes('level maksimum'));
  });
});
