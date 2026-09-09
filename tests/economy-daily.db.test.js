import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { sql, closeDatabase } from '../src/storage/connection.js';
import { createSchema } from '../src/storage/definitions.js';
import { userModel } from '../src/storage/models/user.js';
import { rpgCoinModel } from '../src/features/rpg/models/rpg-coin.model.js';
import { createDailyService } from '../src/features/economy/services/daily-service.js';
import { DAILY_CONFIG, wibDayKey } from '../src/features/economy/config/daily-config.js';

let dbAvailable;
try {
  await sql`SELECT 1`;
  dbAvailable = true;
} catch {
  dbAvailable = false;
}

const uid = (n) => `economytest-${process.pid}-${n}@test.local`;
const createdUsers = [];

// Fixed WIB morning so +24h/+26h stay deterministic across day borders.
const T0 = Date.UTC(2026, 8, 9, 3, 0, 0) / 1000;

async function makeUser(n) {
  const userId = uid(n);
  await sql`INSERT INTO users (jid) VALUES (${userId}) ON CONFLICT (jid) DO NOTHING`;
  createdUsers.push(userId);
  return userId;
}

describe('economy daily (database)', { skip: !dbAvailable }, () => {
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

  it('1-2. claims coin within config range into the existing wallet', async () => {
    const userId = await makeUser('claim');
    const out = await createDailyService().claimDaily(userId, { nowSec: T0, random: () => 0.5 });
    assert.equal(out.status, 'claimed');
    assert.ok(out.coin >= DAILY_CONFIG.coin.min && out.coin <= DAILY_CONFIG.coin.max);
    assert.equal(out.streak, 1);
    assert.equal(await rpgCoinModel.getBalance(userId), out.coin);
  });

  it('4-5. same day rejected, next day succeeds with streak+1', async () => {
    const userId = await makeUser('repeat');
    await createDailyService().claimDaily(userId, { nowSec: T0 });
    const again = await createDailyService().claimDaily(userId, { nowSec: T0 + 3600 });
    assert.equal(again.status, 'already');
    assert.equal(again.streak, 1);
    assert.equal(again.coin, 0);
    const next = await createDailyService().claimDaily(userId, { nowSec: T0 + 25 * 3600 });
    assert.notEqual(wibDayKey(T0), wibDayKey(T0 + 25 * 3600));
    assert.equal(next.status, 'claimed');
    assert.equal(next.streak, 2);
  });

  it('7-8. missed days reset streak, first claim starts at 1', async () => {
    const userId = await makeUser('reset');
    const svc = createDailyService();
    const first = await svc.claimDaily(userId, { nowSec: T0 });
    assert.equal(first.streak, 1);
    const late = await svc.claimDaily(userId, { nowSec: T0 + 72 * 3600 });
    assert.equal(late.status, 'claimed');
    assert.equal(late.streak, 1);
    const state = await userModel.getDaily(userId);
    assert.equal(state.last_daily, T0 + 72 * 3600);
  });

  it('12-13. concurrent same-day claims yield one reward; retry adds nothing', async () => {
    const userId = await makeUser('race');
    const svc = createDailyService();
    const [a, b] = await Promise.allSettled([
      svc.claimDaily(userId, { nowSec: T0 }),
      svc.claimDaily(userId, { nowSec: T0 }),
    ]);
    const claimed = [a, b].filter((r) => r.status === 'fulfilled' && r.value.status === 'claimed');
    const already = [a, b].filter((r) => r.status === 'fulfilled' && r.value.status === 'already');
    assert.equal(claimed.length, 1);
    assert.equal(already.length, 1);
    assert.equal(claimed[0].value.streak, 1);
    const balance = await rpgCoinModel.getBalance(userId);
    assert.equal(balance, claimed[0].value.coin);
    const retry = await svc.claimDaily(userId, { nowSec: T0 + 60 });
    assert.equal(retry.status, 'already');
    assert.equal(await rpgCoinModel.getBalance(userId), balance);
  });

  it('14. reward failure rolls back coin and streak', async () => {
    const userId = await makeUser('rollback');
    const broken = createDailyService({
      coins: {
        ensure: (u) => rpgCoinModel.ensure(u),
        addCoin: async () => {
          throw new Error('wallet exploded');
        },
      },
    });
    await assert.rejects(broken.claimDaily(userId, { nowSec: T0 }), /wallet exploded/);
    assert.equal(await rpgCoinModel.getBalance(userId), 0);
    const state = await userModel.getDaily(userId);
    assert.equal(state.daily_streak, 0);
    assert.equal(state.last_daily, 0);
  });

  it('15. command stays thin and handles errors', async () => {
    const mod = await import('../src/commands/modules/economy/daily.js');
    assert.equal(mod.default.name, 'daily');
    assert.ok(mod.default.aliases.includes('claim'));
    assert.ok(mod.default.aliases.includes('harian'));
    assert.equal(mod.default.category, 'economy');
    const replies = [];
    const userId = await makeUser('cmd');
    await mod.default.execute({
      sender: userId,
      pushName: 'Tester',
      reply: async (m) => replies.push(m),
      fail: async (m) => {
        throw new Error(m);
      },
    });
    assert.ok(replies[0].includes('DAILY REWARD'));
  });
});
