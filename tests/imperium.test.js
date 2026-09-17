// Imperium endgame tests (node:test + assert, pola minimal tanpa runner baru).
// Pure logic + service fakes jalan tanpa DB. Test integrasi butuh Postgres
// lokal (pg_ctl) via env:
//   SUPABASE_DB_URL='postgres://postgres@127.0.0.1:5433/theia_test?sslmode=disable' npm test
import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';

import {
  IMPERIUM_BOSSES,
  IMPERIUM_FATES,
  IMPERIUM_MIN_LEVEL,
  IMPERIUM_REWARDS,
  IMPERIUM_WEEKLY_CARD_ID,
  getImperiumBoss,
  getImperiumReward,
  getWeeklyCardDef,
} from '#features/rpg/config/imperium-config.js';
import { getMainCard } from '#features/rpg/config/card-config.js';
import {
  applyFateToBattle,
  clearedBit,
  createImperiumService,
  isDiffCleared,
  isDiffUnlocked,
  parseSlot,
  rollFateChoices,
  weekIdFor,
} from '#features/rpg/services/imperium-service.js';
import {
  autoSkillAction,
  battleSkillsFromEffects,
  createBattle,
  simulateBattle,
} from '#features/rpg/services/battle-engine.js';

const DB_URL = process.env.SUPABASE_DB_URL ?? '';

// ---------- fakes (in-memory, tanpa DB) ----------

function weakBoss(diff) {
  return {
    id: `test_weak_${diff}`,
    name: `Test Weak ${diff}`,
    stats: { maxHp: 10, atk: 1, def: 0, critRate: 0, critDmg: 1.5 },
    behavior: 'basic',
    skills: null,
  };
}

function strongBoss(diff) {
  return {
    id: `test_strong_${diff}`,
    name: `Test Strong ${diff}`,
    stats: { maxHp: 1000000, atk: 50000, def: 0, critRate: 0, critDmg: 1.5 },
    behavior: 'basic',
    skills: null,
  };
}

const FAKE_REWARDS = Object.freeze({
  1: Object.freeze({ coin: 1000, exp: 100, cerelia: 1 }),
  2: Object.freeze({ coin: 2000, exp: 200, cerelia: 2 }),
  3: Object.freeze({ coin: 3000, exp: 300, cerelia: 3 }),
  4: Object.freeze({ coin: 4000, exp: 400, cerelia: 4 }),
  5: Object.freeze({ coin: 5000, exp: 500, cerelia: 5 }),
});

function makeFakes({ level = 16, bossFor = weakBoss } = {}) {
  const store = {
    player: null,
    coin: 0,
    cerelia: 0,
    progress: new Map(),
    pending: new Map(),
  };
  const base = { maxHp: 5000, atk: 200, def: 60, critRate: 0.25, critDmg: 1.5 };
  const players = {
    async ensure(userId) {
      if (!store.player) {
        store.player = {
          user_id: userId,
          level,
          exp: 0,
          max_hp: base.maxHp,
          current_hp: base.maxHp,
          atk: base.atk,
          def: base.def,
          crit_rate: base.critRate,
          crit_dmg: base.critDmg,
        };
      }
      return store.player;
    },
    async get() {
      return store.player;
    },
    async setCurrentHp(_userId, hp) {
      store.player.current_hp = Math.max(0, hp);
      return store.player;
    },
    async setLevel(_userId, lv) {
      store.player.level = lv;
      return store.player;
    },
    async setExp(_userId, exp) {
      store.player.exp = exp;
      return store.player;
    },
  };
  const progress = {
    async ensureProgress(userId, weekId) {
      const key = `${userId}|${weekId}`;
      if (!progress.map) progress.map = store.progress;
      if (!store.progress.has(key)) {
        store.progress.set(key, {
          user_id: userId,
          week_id: weekId,
          cleared: 0,
        });
      }
      return store.progress.get(key);
    },
    async getProgress(userId, weekId) {
      return store.progress.get(`${userId}|${weekId}`) ?? null;
    },
    async lockProgress(userId, weekId) {
      return store.progress.get(`${userId}|${weekId}`) ?? null;
    },
    async markCleared(userId, weekId, bit) {
      const row = store.progress.get(`${userId}|${weekId}`);
      if (!row) return null;
      if (row.cleared & bit) return null;
      row.cleared |= bit;
      return { ...row };
    },
    async savePending(userId, weekId, diff, choices) {
      const row = {
        user_id: userId,
        week_id: weekId,
        diff,
        choices: JSON.stringify(choices),
      };
      store.pending.set(userId, row);
      return row;
    },
    async getPending(userId) {
      return store.pending.get(userId) ?? null;
    },
    async consumePending(userId) {
      const row = store.pending.get(userId) ?? null;
      store.pending.delete(userId);
      return row;
    },
  };
  const svc = createImperiumService({
    users: { async ensure() {} },
    players,
    coins: {
      async ensure() {},
      async addCoin(_u, amount) {
        store.coin += amount;
      },
      async getBalance() {
        return store.coin;
      },
    },
    inventory: {
      async add(_u, itemId, qty) {
        if (itemId === 'cerelia') store.cerelia += qty;
      },
    },
    progress,
    finals: {
      async getFinalStats() {
        const p = store.player;
        return {
          level: p.level,
          exp: p.exp,
          maxHp: p.max_hp,
          currentHp: p.current_hp,
          atk: p.atk,
          def: p.def,
          critRate: p.crit_rate,
          critDmg: p.crit_dmg,
        };
      },
    },
    cards: {
      async getActiveEffects() {
        return [];
      },
    },
    db: {
      async begin(fn) {
        return fn({});
      },
    },
    config: {
      minLevel: 16,
      diffCount: 5,
      weeklyCardId: 'luuk',
      fates: IMPERIUM_FATES,
      bosses: {
        1: bossFor(1),
        2: bossFor(2),
        3: bossFor(3),
        4: bossFor(4),
        5: bossFor(5),
      },
      rewards: FAKE_REWARDS,
    },
  });
  return { svc, store, players, progress };
}

async function clearDiff(svc, userId, diff, nowMs) {
  const start = await svc.start(userId, diff, { nowMs, random: () => 0 });
  assert.deepEqual(start.slots, ['A', 'B', 'C']);
  return svc.pick(userId, 'A', { nowMs, random: () => 0.5 });
}

async function assertCode(promise, code) {
  await assert.rejects(promise, (err) => {
    assert.equal(err?.code, code);
    return true;
  });
}

// ---------- ACCESS ----------

describe('imperium access gate', () => {
  it('1. level 15 ditolak', async () => {
    const { svc } = makeFakes({ level: 15 });
    const s = await svc.status('u1');
    assert.equal(s.canEnter, false);
    await assertCode(svc.start('u1', 1), 'LEVEL_GATE');
  });

  it('2. level 16 bisa masuk', async () => {
    const { svc } = makeFakes({ level: 16 });
    const s = await svc.status('u2');
    assert.equal(s.canEnter, true);
    assert.equal(s.minLevel, IMPERIUM_MIN_LEVEL);
    const start = await svc.start('u2', 1, { random: () => 0 });
    assert.equal(start.diff, 1);
  });
});

// ---------- DIFFICULTY ----------

describe('imperium difficulty unlock', () => {
  it('3. diff 1-3 unlocked sejak awal', async () => {
    const { svc } = makeFakes();
    const s = await svc.status('u3');
    assert.deepEqual(
      s.diffs.map((d) => d.unlocked),
      [true, true, true, false, false]
    );
  });

  it('4. diff 4 locked sebelum diff 1-3 clear', async () => {
    const { svc } = makeFakes();
    await assertCode(svc.start('u4', 4, { random: () => 0 }), 'LOCKED');
    const win = await clearDiff(svc, 'u4', 2, Date.now());
    assert.equal(win.won, true);
    await assertCode(svc.start('u4', 4, { random: () => 0 }), 'LOCKED');
  });

  it('5. diff 4 unlocked setelah diff 1-3 clear', async () => {
    const { svc } = makeFakes();
    const now = Date.now();
    for (const d of [1, 2, 3]) {
      const r = await clearDiff(svc, 'u5', d, now);
      assert.equal(r.won, true);
    }
    const s = await svc.status('u5');
    assert.equal(s.diffs[3].unlocked, true);
    const start = await svc.start('u5', 4, { random: () => 0 });
    assert.equal(start.diff, 4);
  });

  it('6. diff 5 locked sebelum diff 4 clear', async () => {
    const { svc } = makeFakes();
    const now = Date.now();
    for (const d of [1, 2, 3]) await clearDiff(svc, 'u6', d, now);
    await assertCode(svc.start('u6', 5, { random: () => 0 }), 'LOCKED');
  });

  it('7. diff 5 unlocked setelah diff 4 clear', async () => {
    const { svc } = makeFakes();
    const now = Date.now();
    for (const d of [1, 2, 3, 4]) {
      const r = await clearDiff(svc, 'u7', d, now);
      assert.equal(r.won, true);
    }
    const s = await svc.status('u7');
    assert.equal(s.diffs[4].unlocked, true);
  });
});

// ---------- RETRY ----------

describe('imperium retry', () => {
  it('8. kalah diff 4 -> bisa retry diff 4 (tidak dipaksa ke diff 1)', async () => {
    const { svc, store } = makeFakes({
      bossFor: (d) => (d === 4 ? strongBoss(d) : weakBoss(d)),
    });
    const now = Date.now();
    for (const d of [1, 2, 3]) await clearDiff(svc, 'u8', d, now);
    await svc.start('u8', 4, { nowMs: now, random: () => 0 });
    const lose = await svc.pick('u8', 'A', { nowMs: now, random: () => 0.5 });
    assert.equal(lose.won, false);
    assert.equal(lose.rewards, null);
    // tanpa heal & profil HP 0 pun retry diff yang sama tetap bisa
    // (battle selalu mulai full dari snapshot maxHp)
    store.player.current_hp = 0;
    const retry = await svc.start('u8', 4, { nowMs: now, random: () => 0.1 });
    assert.equal(retry.diff, 4);
  });

  it('9. retry menghasilkan selection baru (pending di-overwrite)', async () => {
    const { svc, progress } = makeFakes();
    const now = Date.now();
    await svc.start('u9', 1, { nowMs: now, random: () => 0 });
    const first = await progress.getPending('u9');
    await svc.start('u9', 1, { nowMs: now, random: () => 0.9999 });
    const second = await progress.getPending('u9');
    assert.notDeepEqual(JSON.parse(first.choices), JSON.parse(second.choices));
  });
});

// ---------- BLESSING / CURSE ----------

describe('imperium blessing & curse', () => {
  it('10. selalu tepat 3 pilihan', () => {
    const choices = rollFateChoices(IMPERIUM_FATES, () => 0.3);
    assert.equal(choices.length, 3);
    assert.deepEqual(
      choices.map((c) => c.slot),
      ['A', 'B', 'C']
    );
    assert.equal(new Set(choices.map((c) => c.fateId)).size, 3);
  });

  it('11. pilihan random', () => {
    const a = rollFateChoices(IMPERIUM_FATES, () => 0);
    const b = rollFateChoices(IMPERIUM_FATES, () => 0.9999);
    assert.notDeepEqual(
      a.map((c) => c.fateId),
      b.map((c) => c.fateId)
    );
  });

  it('12. efek tidak terlihat sebelum selection (blind)', async () => {
    const { svc } = makeFakes();
    const start = await svc.start('u12', 1, { random: () => 0 });
    assert.deepEqual(Object.keys(start).sort(), [
      'bossName',
      'diff',
      'slots',
      'weekId',
    ]);
    const leaked = JSON.stringify(start);
    for (const f of IMPERIUM_FATES) {
      assert.ok(!leaked.includes(f.id), `leak fate id ${f.id}`);
      assert.ok(!leaked.includes(f.name), `leak fate name ${f.name}`);
    }
    assert.ok(!leaked.includes('blessing') && !leaked.includes('curse'));
  });

  it('13. hasil direveal setelah selection', async () => {
    const { svc } = makeFakes();
    await svc.start('u13', 1, { random: () => 0 });
    const r = await svc.pick('u13', 'B', { random: () => 0.5 });
    assert.ok(['blessing', 'curse'].includes(r.fate.kind));
    assert.ok(r.fate.name && r.fate.icon && r.fate.reveal);
  });

  it('14. modifier berlaku pada run (player buff / boss affix menempel)', () => {
    const base = { active: null, passives: [] };
    const blessing = IMPERIUM_FATES.find((f) => f.kind === 'blessing');
    const out = applyFateToBattle(blessing, base, getImperiumBoss(1));
    assert.equal(out.playerSkills.passives.length, 1);
    assert.equal(out.playerSkills.passives[0].source, 'imperium-fate');
    const curse = IMPERIUM_FATES.find(
      (f) => f.boss && (f.boss.atkMult || f.boss.defMult)
    );
    const out2 = applyFateToBattle(curse, base, getImperiumBoss(1));
    const expected = { ...getImperiumBoss(1).stats };
    if (curse.boss.atkMult)
      expected.atk = Math.round(expected.atk * curse.boss.atkMult);
    if (curse.boss.defMult)
      expected.def = Math.round(expected.def * curse.boss.defMult);
    assert.deepEqual(out2.enemy.stats, expected);
  });

  it('15. modifier tidak terbawa setelah kalah/retry', async () => {
    const { svc, store, progress } = makeFakes({ bossFor: strongBoss });
    const now = Date.now();
    await svc.start('u15', 1, { nowMs: now, random: () => 0 });
    const lose = await svc.pick('u15', 'A', { nowMs: now, random: () => 0.5 });
    assert.equal(lose.won, false);
    assert.equal(await progress.getPending('u15'), null);
    store.player.current_hp = store.player.max_hp;
    await svc.start('u15', 1, { nowMs: now, random: () => 0.9999 });
    const pending = await progress.getPending('u15');
    assert.ok(pending);
    // input battle tidak termutasi oleh fate
    const base = { active: null, passives: [] };
    applyFateToBattle(IMPERIUM_FATES[0], base, getImperiumBoss(1));
    assert.equal(base.passives.length, 0);
  });
});

// ---------- FULL-HP SNAPSHOT (tanpa currentHp profile) ----------

describe('imperium full-hp snapshot', () => {
  it('kalah diff 1 -> HP profile tidak berubah', async () => {
    const { svc, store } = makeFakes({ bossFor: strongBoss });
    await svc.status('ufull1');
    store.player.current_hp = 1234;
    const now = Date.now();
    await svc.start('ufull1', 1, { nowMs: now, random: () => 0 });
    const lose = await svc.pick('ufull1', 'A', {
      nowMs: now,
      random: () => 0.5,
    });
    assert.equal(lose.won, false);
    assert.equal(store.player.current_hp, 1234);
  });

  it('battle selalu mulai full maxHp walau HP profile sekarat', async () => {
    const { svc, store } = makeFakes();
    await svc.status('ufull2');
    store.player.current_hp = 1;
    const now = Date.now();
    await svc.start('ufull2', 1, { nowMs: now, random: () => 0 });
    const win = await svc.pick('ufull2', 'A', {
      nowMs: now,
      random: () => 0.5,
    });
    assert.equal(win.won, true);
    // one-shot kill tanpa damage balasan -> HP akhir battle == HP awal battle
    assert.equal(win.playerHp, store.player.max_hp);
    assert.equal(store.player.current_hp, 1);
  });

  it('retry diff mulai full lagi, bukan sisa HP battle sebelumnya', async () => {
    const { svc, store } = makeFakes({ bossFor: strongBoss });
    await svc.status('ufull3');
    const now = Date.now();
    await svc.start('ufull3', 1, { nowMs: now, random: () => 0 });
    const lose = await svc.pick('ufull3', 'A', {
      nowMs: now,
      random: () => 0.5,
    });
    assert.equal(lose.won, false);
    assert.equal(lose.playerHp, 0);
    // profil tidak tersentuh; retry langsung tanpa heal
    assert.equal(store.player.current_hp, store.player.max_hp);
    const retry = await svc.start('ufull3', 1, {
      nowMs: now,
      random: () => 0.7,
    });
    assert.equal(retry.diff, 1);
    assert.deepEqual(retry.slots, ['A', 'B', 'C']);
  });

  it('clear lalu lanjut diff berikutnya -> HP full lagi, tanpa carryover', async () => {
    const { svc, store } = makeFakes();
    await svc.status('ufull4');
    store.player.current_hp = 1;
    const now = Date.now();
    const r1 = await clearDiff(svc, 'ufull4', 1, now);
    assert.equal(r1.won, true);
    assert.equal(r1.playerHp, store.player.max_hp);
    const r2 = await clearDiff(svc, 'ufull4', 2, now);
    assert.equal(r2.won, true);
    assert.equal(r2.playerHp, store.player.max_hp);
    assert.equal(store.player.current_hp, 1);
  });
});

// ---------- WEEKLY (pure) ----------

describe('imperium weekly logic', () => {
  it('weekId stabil dalam seminggu & beda antar minggu', () => {
    const mon = Date.UTC(2026, 8, 14, 0, 0, 0);
    const sun = Date.UTC(2026, 8, 20, 23, 59, 59);
    const nextMon = Date.UTC(2026, 8, 21, 0, 0, 0);
    assert.equal(weekIdFor(mon), weekIdFor(sun));
    assert.notEqual(weekIdFor(mon), weekIdFor(nextMon));
    assert.match(weekIdFor(mon), /^\d{4}-W\d{2}$/);
  });

  it('parseSlot hanya menerima A/B/C', () => {
    assert.equal(parseSlot('a'), 'A');
    assert.equal(parseSlot(' C '), 'C');
    assert.equal(parseSlot('d'), null);
    assert.equal(parseSlot('1'), null);
    assert.equal(parseSlot(null), null);
  });

  it('bitmask cleared/unlocked konsisten', () => {
    assert.equal(clearedBit(1), 1);
    assert.equal(clearedBit(5), 16);
    assert.equal(isDiffCleared(0b00111, 3), true);
    assert.equal(isDiffCleared(0b00111, 4), false);
    assert.equal(isDiffUnlocked(4, 0b00111), true);
    assert.equal(isDiffUnlocked(4, 0b00101), false);
    assert.equal(isDiffUnlocked(5, 0b01111), true);
    assert.equal(isDiffUnlocked(5, 0b00111), false);
  });
});

// ---------- CONFIG ----------

describe('imperium config', () => {
  it('20. weekly card valid dari card config existing (tanpa duplikasi)', () => {
    const def = getWeeklyCardDef();
    assert.equal(def.id, IMPERIUM_WEEKLY_CARD_ID);
    assert.equal(def, getMainCard(IMPERIUM_WEEKLY_CARD_ID));
    assert.ok(def.active && def.passive);
  });

  it('21. setiap diff memakai boss berbeda', () => {
    const ids = [1, 2, 3, 4, 5].map((d) => getImperiumBoss(d).id);
    assert.equal(new Set(ids).size, 5);
    for (const d of [1, 2, 3, 4, 5]) {
      assert.ok(getImperiumBoss(d));
      assert.ok(getImperiumReward(d));
    }
  });

  it('boss skill hanya memakai format battle-engine existing', () => {
    for (const d of [3, 4, 5]) {
      const boss = IMPERIUM_BOSSES[d];
      assert.equal(boss.behavior, 'skill_based');
      assert.ok(boss.skills?.active?.multiplier > 1);
      assert.ok(boss.skills.active.cooldownSec > 0);
    }
  });

  it('reward diff 1-5 terdefinisi (coin+exp+cerelia)', () => {
    for (const d of [1, 2, 3, 4, 5]) {
      const r = IMPERIUM_REWARDS[d];
      assert.ok(Number.isInteger(r.coin) && r.coin > 0);
      assert.ok(Number.isInteger(r.exp) && r.exp > 0);
      assert.ok(Number.isInteger(r.cerelia) && r.cerelia > 0);
    }
  });
});

// ---------- BATTLE (pure, engine existing) ----------

describe('imperium battle via existing engine', () => {
  it('22. boss skill berjalan lewat simulateBattle', () => {
    for (const d of [1, 2, 3, 4, 5]) {
      const boss = getImperiumBoss(d);
      const skills = battleSkillsFromEffects([]);
      const { enemy, enemySkills } = applyFateToBattle(
        IMPERIUM_FATES[0],
        skills,
        boss
      );
      const state = createBattle({
        playerStats: {
          maxHp: 50000,
          currentHp: 50000,
          atk: 500,
          def: 100,
          critRate: 0.25,
          critDmg: 1.5,
        },
        enemy,
        playerSkills: skills,
        enemySkills,
        battleId: `test-imperium-d${d}`,
      });
      const end = simulateBattle(state, autoSkillAction, () => 0.5);
      assert.ok(['WIN', 'LOSE', 'DRAW'].includes(end.status));
    }
  });

  it('23-24. boss affix & player buff valid untuk engine', () => {
    for (const f of IMPERIUM_FATES) {
      assert.ok(f.player || f.boss, `fate ${f.id} tanpa efek`);
      const { playerSkills, enemySkills } = applyFateToBattle(
        f,
        { active: null, passives: [] },
        getImperiumBoss(5)
      );
      for (const p of [
        ...playerSkills.passives,
        ...(enemySkills?.passives ?? []),
      ]) {
        assert.ok(['attack', 'defend', 'battle_start'].includes(p.trigger));
        assert.ok(p.modifiers && typeof p.modifiers === 'object');
      }
    }
  });
});

// ---------- REWARD (fakes) ----------

describe('imperium reward atomic (fakes)', () => {
  it('26. win -> coin+exp+cerelia; 17. tidak bisa farming diff yang sudah clear', async () => {
    const { svc, store } = makeFakes();
    const now = Date.now();
    await svc.start('u26', 1, { nowMs: now, random: () => 0 });
    const r = await svc.pick('u26', 'A', { nowMs: now, random: () => 0.5 });
    assert.equal(r.won, true);
    assert.deepEqual(r.rewards, FAKE_REWARDS[1]);
    assert.equal(store.coin, FAKE_REWARDS[1].coin);
    assert.equal(store.cerelia, FAKE_REWARDS[1].cerelia);
    await assertCode(
      svc.start('u26', 1, { nowMs: now, random: () => 0 }),
      'ALREADY_CLEARED'
    );
    assert.equal(store.coin, FAKE_REWARDS[1].coin);
  });

  it('27. lose -> tanpa reward', async () => {
    const { svc, store } = makeFakes({ bossFor: strongBoss });
    const now = Date.now();
    await svc.start('u27', 1, { nowMs: now, random: () => 0 });
    const r = await svc.pick('u27', 'A', { nowMs: now, random: () => 0.5 });
    assert.equal(r.won, false);
    assert.equal(r.rewards, null);
    assert.equal(store.coin, 0);
    assert.equal(store.cerelia, 0);
  });
});

// ---------- INTEGRASI DB ----------

const dbDescribe = DB_URL ? describe : describe.skip;

dbDescribe('imperium integration (local pg)', async () => {
  const { createSchema } = await import('#storage/definitions.js');
  const { rpgPlayerModel } =
    await import('#features/rpg/models/rpg-player.model.js');
  const { rpgCoinModel } =
    await import('#features/rpg/models/rpg-coin.model.js');
  const { imperiumModel } =
    await import('#features/rpg/models/imperium.model.js');
  const { userModel } = await import('#storage/models/user.js');

  let seq = 0;
  const uid = (tag) =>
    `imperium-t-${Date.now()}-${seq++}-${tag}@s.whatsapp.net`;
  const dbBosses = (strongDiff = -1) => ({
    1: strongDiff === 1 ? strongBoss(1) : weakBoss(1),
    2: strongDiff === 2 ? strongBoss(2) : weakBoss(2),
    3: strongDiff === 3 ? strongBoss(3) : weakBoss(3),
    4: strongDiff === 4 ? strongBoss(4) : weakBoss(4),
    5: strongDiff === 5 ? strongBoss(5) : weakBoss(5),
  });
  const dbConfig = (strongDiff = -1) => ({
    minLevel: 16,
    diffCount: 5,
    weeklyCardId: 'luuk',
    fates: IMPERIUM_FATES,
    bosses: dbBosses(strongDiff),
    rewards: FAKE_REWARDS,
  });
  const mkSvc = (strongDiff = -1) =>
    createImperiumService({ config: dbConfig(strongDiff) });

  async function prepUser(tag, level = 16) {
    const id = uid(tag);
    await userModel.ensure(id, {});
    await rpgPlayerModel.ensure(id);
    await rpgCoinModel.ensure(id);
    await rpgPlayerModel.setLevel(id, level);
    return id;
  }

  async function clearDiffDb(svc, userId, diff, nowMs) {
    await svc.start(userId, diff, { nowMs, random: () => 0 });
    return svc.pick(userId, 'A', { nowMs, random: () => 0.5 });
  }

  before(async () => {
    await createSchema();
  });

  it('16. progress clear tersimpan setelah restart (instance baru)', async () => {
    const svc = mkSvc();
    const id = await prepUser('restart');
    const now = Date.now();
    const r = await clearDiffDb(svc, id, 1, now);
    assert.equal(r.won, true);
    const svc2 = createImperiumService({ config: dbConfig() });
    const s = await svc2.status(id, { nowMs: now });
    assert.equal(s.diffs[0].cleared, true);
    assert.equal(s.diffs[1].cleared, false);
  });

  it('17. reward hanya sekali per diff per minggu (db)', async () => {
    const svc = mkSvc();
    const id = await prepUser('once');
    const now = Date.now();
    const before = await rpgCoinModel.getBalance(id);
    await clearDiffDb(svc, id, 1, now);
    const after = await rpgCoinModel.getBalance(id);
    assert.equal(after - before, FAKE_REWARDS[1].coin);
    await assertCode(
      svc.start(id, 1, { nowMs: now, random: () => 0 }),
      'ALREADY_CLEARED'
    );
    assert.equal(await rpgCoinModel.getBalance(id), after);
  });

  it('18-19. weekly reset: reward bisa lagi, diff 4/5 kembali locked', async () => {
    const svc = mkSvc();
    const id = await prepUser('reset');
    const weekA = Date.UTC(2026, 8, 14, 1, 0, 0);
    const weekB = Date.UTC(2026, 8, 21, 1, 0, 0);
    assert.notEqual(weekIdFor(weekA), weekIdFor(weekB));
    for (const d of [1, 2, 3, 4]) {
      const r = await clearDiffDb(svc, id, d, weekA);
      assert.equal(r.won, true);
    }
    const sA = await svc.status(id, { nowMs: weekA });
    assert.equal(sA.diffs[4].unlocked, true);
    const sB = await svc.status(id, { nowMs: weekB });
    assert.deepEqual(
      sB.diffs.map((d) => d.cleared),
      [false, false, false, false, false]
    );
    assert.deepEqual(
      sB.diffs.map((d) => d.unlocked),
      [true, true, true, false, false]
    );
    const before = await rpgCoinModel.getBalance(id);
    const rB = await clearDiffDb(svc, id, 1, weekB);
    assert.equal(rB.won, true);
    assert.equal(
      (await rpgCoinModel.getBalance(id)) - before,
      FAKE_REWARDS[1].coin
    );
  });

  it('20. weekly card dapat diganti tanpa ubah logic', async () => {
    const svc = createImperiumService({
      config: {
        ...dbConfig(),
        weeklyCardId: 'girgas',
        weeklyCard: getMainCard('girgas'),
      },
    });
    const id = await prepUser('weekly');
    const s = await svc.status(id);
    assert.equal(s.weeklyCard.id, 'girgas');
    assert.equal(s.weeklyCard.name, 'Girgas');
    const r = await clearDiffDb(svc, id, 2, Date.now());
    assert.equal(r.won, true);
  });

  it('25. final stats persisted tidak berubah (hanya hp/exp berjalan)', async () => {
    const svc = mkSvc();
    const id = await prepUser('finalstats');
    const snap = async () => {
      const p = await rpgPlayerModel.get(id);
      return {
        max_hp: p.max_hp,
        atk: p.atk,
        def: p.def,
        crit_rate: p.crit_rate,
        crit_dmg: p.crit_dmg,
      };
    };
    const beforeStats = await snap();
    const r = await clearDiffDb(svc, id, 1, Date.now());
    assert.equal(r.won, true);
    assert.deepEqual(await snap(), beforeStats);
  });

  it('28. concurrent pick tidak memberi reward dua kali', async () => {
    const svc = mkSvc();
    const id = await prepUser('race');
    const now = Date.now();
    await svc.start(id, 1, { nowMs: now, random: () => 0 });
    const before = await rpgCoinModel.getBalance(id);
    const results = await Promise.allSettled([
      svc.pick(id, 'A', { nowMs: now, random: () => 0.5 }),
      svc.pick(id, 'A', { nowMs: now, random: () => 0.5 }),
    ]);
    const wins = results.filter((r) => r.status === 'fulfilled' && r.value.won);
    assert.equal(wins.length, 1);
    assert.equal(
      (await rpgCoinModel.getBalance(id)) - before,
      FAKE_REWARDS[1].coin
    );
  });

  it('battle db mulai full maxHp walau HP profile rendah', async () => {
    const svc = mkSvc();
    const id = await prepUser('fulldb');
    await rpgPlayerModel.setCurrentHp(id, 1);
    const maxHp = (await rpgPlayerModel.get(id)).max_hp;
    const now = Date.now();
    await svc.start(id, 1, { nowMs: now, random: () => 0 });
    const win = await svc.pick(id, 'A', { nowMs: now, random: () => 0.5 });
    assert.equal(win.won, true);
    // weak boss mati 1 hit tanpa damage balasan -> HP akhir battle == HP awal battle
    assert.equal(win.playerHp, maxHp);
    assert.equal((await rpgPlayerModel.get(id)).current_hp, 1);
  });

  it('retry kalah di db: profil HP utuh, pending hangus, start ulang diff sama', async () => {
    const svc = mkSvc(2);
    const id = await prepUser('retrydb');
    const now = Date.now();
    const hpBefore = (await rpgPlayerModel.get(id)).current_hp;
    await svc.start(id, 2, { nowMs: now, random: () => 0 });
    const lose = await svc.pick(id, 'A', { nowMs: now, random: () => 0.5 });
    assert.equal(lose.won, false);
    assert.equal((await rpgPlayerModel.get(id)).current_hp, hpBefore);
    assert.equal(await imperiumModel.getPending(id), null);
    // retry langsung tanpa heal, battle mulai full lagi
    const retry = await svc.start(id, 2, { nowMs: now, random: () => 0.7 });
    assert.equal(retry.diff, 2);
    assert.deepEqual(retry.slots, ['A', 'B', 'C']);
  });
});

// ---------- REGRESI (existing tidak tersentuh) ----------

describe('imperium regression', async () => {
  const { isBossFloor, enemyForFloor } =
    await import('#features/rpg/config/orbital-lift-config.js');
  const { getDomain } = await import('#features/rpg/config/domain-config.js');
  const cardCfg = await import('#features/rpg/config/card-config.js');

  it('29-31. orbital/domain/card behavior existing utuh', () => {
    assert.equal(isBossFloor(10), true);
    assert.equal(isBossFloor(9), false);
    assert.ok(enemyForFloor(1).stats.maxHp > 0);
    assert.equal(getDomain('easy').boss.name, 'Slime King');
    assert.equal(getDomain('hard').boss.skills.active.name, 'Abyss Breath');
    assert.equal(cardCfg.getMainCard('luuk').name, 'Luuk');
    assert.equal(cardCfg.MAIN_MAX_LEVEL, 100);
    const skills = battleSkillsFromEffects([]);
    assert.deepEqual(skills, { active: null, passives: [] });
  });
});
