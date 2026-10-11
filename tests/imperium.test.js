import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  IMPERIUM_BOSS_CHAMBER,
  IMPERIUM_CHAMBER_COUNT,
  IMPERIUM_DIFF_LIST,
  IMPERIUM_EFFECTS,
  IMPERIUM_FALLBACK_THEME,
  IMPERIUM_MAX_ROUNDS,
  IMPERIUM_MIN_LEVEL,
  IMPERIUM_OPTION_KEYS,
  IMPERIUM_OUTCOMES,
  IMPERIUM_THEMES,
  IMPERIUM_WEEKLY,
  getDifficulty,
  rotationCards,
  themeForCard,
  weekIndexFor,
  weeklyCardIdFor,
  weeklyThemeForNow,
} from '#features/rpg/config/imperium-config.js';
import {
  autoSkillAction,
  createBattle,
  simulateBattle,
} from '#features/rpg/services/battle-engine.js';
import { applyPlayerExp } from '#features/rpg/services/player-progress.js';
import {
  applyBossModifiers,
  bossModifiers,
  collectConsequences,
  consequenceSummary,
  consequencesToPassives,
  createImperiumService,
  isDifficultyUnlocked,
} from '#features/rpg/services/imperium-service.js';

const USER = 'u@test';
const WEEK_MS = IMPERIUM_WEEKLY.weekMs;
const BASE_MS = Date.UTC(2026, 0, 5);

const CORRECT = IMPERIUM_OUTCOMES.correct;
const TOLERABLE = IMPERIUM_OUTCOMES.tolerable;
const CRITICAL = IMPERIUM_OUTCOMES.critical;

function makeRng(seed = 7) {
  let state = seed >>> 0;
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
  next.reset = (value = seed) => {
    state = value >>> 0;
  };
  return next;
}

const fakeTx = () => [];
fakeTx.unsafe = async () => [];

function keyForOutcome(question, outcome) {
  const option = question.options.find((o) => o.outcome === outcome);
  assert.ok(option, `tidak ada opsi ${outcome} di ${question.id}`);
  return option.key;
}

/**
 * Pertanyaan yang dikirim ke pemain sengaja disembunyikan kategorinya, jadi test
 * mengambil definisi penuh dari tema config memakai id yang sama.
 */
function keyFor(theme, question, outcome) {
  const full = theme.questions.find((q) => q.id === question.id);
  assert.ok(full, `pertanyaan ${question.id} tidak ada di tema ${theme.cardId}`);
  return keyForOutcome(full, outcome);
}

function effectsFor(theme, question, outcome) {
  const full = theme.questions.find((q) => q.id === question.id);
  assert.ok(full, `pertanyaan ${question.id} tidak ada di tema ${theme.cardId}`);
  return effectsForOutcome(full, outcome);
}

function effectsForOutcome(question, outcome) {
  const option = question.options.find((o) => o.outcome === outcome);
  assert.ok(option, `tidak ada opsi ${outcome} di ${question.id}`);
  return [...option.effects];
}

function severityOf(effectIds) {
  return effectIds.reduce((total, id) => total + IMPERIUM_EFFECTS[id].severity, 0);
}

/**
 * Harness in-memory yang meniru kontrak Postgres yang dipakai Imperium:
 * - advanceChamber = compare-and-set (WHERE chamber = fromChamber AND active)
 * - claimClear     = INSERT ... ON CONFLICT DO NOTHING atas PK
 *                      (user_id, week_index, difficulty)
 * - begin()        = transaksi dengan advisory lock per pengguna
 */
function createHarness({
  level = 20,
  maxHp = 1_200,
  currentHp = 120,
  atk = 260,
  def = 70,
  critRate = 0.25,
  critDmg = 1.3,
  effects = [],
  nowMs = BASE_MS,
} = {}) {
  const state = {
    player: {
      user_id: USER,
      level,
      exp: 0,
      max_hp: maxHp,
      current_hp: currentHp,
      atk,
      def,
      crit_rate: critRate,
      crit_dmg: critDmg,
    },
    hpWriteCalls: 0,
    coin: 0,
    cerelia: 0,
    runs: new Map(),
    progress: new Map(),
    claimAttempts: 0,
    advisoryLocks: 0,
  };

  const progressKey = (userId, weekIndex, diff) => `${userId}|${weekIndex}|${diff}`;

  const players = {
    async ensure() {
      return { ...state.player };
    },
    async get() {
      return { ...state.player };
    },
    async setLevel(_id, lv) {
      state.player.level = lv;
      return state.player;
    },
    async setExp(_id, value) {
      state.player.exp = value;
      return state.player;
    },
    async setCurrentHp(_id, hp) {
      state.hpWriteCalls += 1;
      state.player.current_hp = hp;
      return state.player;
    },
  };

  const coins = {
    async ensure() {
      return { coin: state.coin };
    },
    async getBalance() {
      return state.coin;
    },
    async addCoin(_id, amount) {
      state.coin += amount;
      return { coin: state.coin };
    },
  };

  const inventory = {
    async add(_id, itemId, qty) {
      if (itemId === 'cerelia') state.cerelia += qty;
      return { item_id: itemId, quantity: state.cerelia };
    },
  };

  const imperium = {
    async startRun(id, userId, weekIndex, difficulty, payload, expiresAt) {
      const row = {
        id,
        user_id: userId,
        week_index: weekIndex,
        difficulty,
        chamber: 1,
        status: 'active',
        payload: structuredClone(payload),
        expires_at: expiresAt,
      };
      state.runs.set(id, row);
      return { ...row };
    },
    async findRun(id) {
      const row = state.runs.get(id);
      return row ? { ...row, payload: structuredClone(row.payload) } : null;
    },
    async advanceChamber(id, fromChamber, toChamber, payload) {
      const row = state.runs.get(id);
      if (!row) return null;
      if (row.status !== 'active' || row.chamber !== fromChamber) return null;
      row.chamber = toChamber;
      row.payload = structuredClone(payload);
      return { ...row, payload: structuredClone(payload) };
    },
    async finishRun(id, status, payload) {
      const row = state.runs.get(id);
      if (!row || row.status !== 'active') return null;
      row.status = status;
      row.payload = structuredClone(payload ?? {});
      return { ...row };
    },
    async abandonActive(userId, difficulty) {
      const ids = [];
      for (const row of state.runs.values()) {
        if (
          row.user_id === userId &&
          row.difficulty === difficulty &&
          row.status === 'active'
        ) {
          row.status = 'abandoned';
          ids.push(row.id);
        }
      }
      return ids;
    },
    async expireStaleRuns(nowSec) {
      let n = 0;
      for (const row of state.runs.values()) {
        if (
          row.status === 'active' &&
          row.expires_at > 0 &&
          row.expires_at <= nowSec
        ) {
          row.status = 'abandoned';
          n += 1;
        }
      }
      return n;
    },
    async clearedDifficulties(userId, weekIndex) {
      return [...state.progress.keys()]
        .filter((key) => key.startsWith(`${userId}|${weekIndex}|`))
        .map((key) => Number(key.split('|')[2]))
        .sort((a, b) => a - b);
    },
    async clearedCount(userId, weekIndex) {
      const rows = await imperium.clearedDifficulties(userId, weekIndex);
      return rows.length;
    },
    async findClear(userId, weekIndex, difficulty) {
      const key = progressKey(userId, weekIndex, difficulty);
      const row = state.progress.get(key);
      return row ? { ...row } : null;
    },
    async claimClear(userId, weekIndex, difficulty, rewards) {
      state.claimAttempts += 1;
      const key = progressKey(userId, weekIndex, difficulty);
      if (state.progress.has(key)) return null;
      const row = {
        user_id: userId,
        week_index: weekIndex,
        difficulty,
        rewards: JSON.stringify(rewards ?? {}),
      };
      state.progress.set(key, row);
      return { ...row };
    },
    async purgeOlderWeeks() {
      return 0;
    },
  };

  const db = {
    async begin(fn) {
      state.advisoryLocks += 1;
      return fn(fakeTx);
    },
  };

  const finalStats = {
    async getFinalStats() {
      return {
        level: state.player.level,
        exp: state.player.exp,
        maxHp: state.player.max_hp,
        currentHp: state.player.current_hp,
        atk: state.player.atk,
        def: state.player.def,
        critRate: state.player.crit_rate,
        critDmg: state.player.crit_dmg,
      };
    },
  };

  const cardService = {
    async getActiveEffects() {
      return effects;
    },
  };

  const rng = makeRng();
  const base = createImperiumService({
    playerModel: players,
    coinModel: coins,
    inventoryModel: inventory,
    imperium,
    finalStatsService: finalStats,
    cardService,
    db,
    now: () => nowMs,
  });

  // Semua entry point memakai PRNG yang sama supaya hasil bisa diulang.
  const service = {
    ...base,
    startRun: (userId, diff, opts = {}) =>
      base.startRun(userId, diff, { random: rng, ...opts }),
    answerChamber: (runId, userId, key, opts = {}) =>
      base.answerChamber(runId, userId, key, { random: rng, ...opts }),
  };

  return { service, base, state, rng, players, coins, inventory, imperium };
}

function serviceAt(h, nowMs) {
  const base = createImperiumService({
    playerModel: h.players,
    coinModel: h.coins,
    inventoryModel: h.inventory,
    imperium: h.imperium,
    finalStatsService: {
      async getFinalStats() {
        return {
          level: h.state.player.level,
          exp: h.state.player.exp,
          maxHp: h.state.player.max_hp,
          currentHp: h.state.player.current_hp,
          atk: h.state.player.atk,
          def: h.state.player.def,
          critRate: h.state.player.crit_rate,
          critDmg: h.state.player.crit_dmg,
        };
      },
    },
    cardService: { async getActiveEffects() { return []; } },
    db: { async begin(fn) { return fn(fakeTx); } },
    now: () => nowMs,
  });
  return {
    ...base,
    startRun: (userId, diff, opts = {}) =>
      base.startRun(userId, diff, { random: h.rng, ...opts }),
    answerChamber: (runId, userId, key, opts = {}) =>
      base.answerChamber(runId, userId, key, { random: h.rng, ...opts }),
  };
}

async function clearDiff(h, diff, outcome = CORRECT, service = h.service) {
  const run = await service.startRun(USER, diff, { random: h.rng });
  const first = await service.answerChamber(
    run.runId,
    USER,
    keyFor(run.theme, run.question, outcome)
  );
  return service.answerChamber(
    run.runId,
    USER,
    keyFor(run.theme, first.question, outcome)
  );
}

// ─────────────────────────── Config & rotasi ───────────────────────────

test('weekly card konsisten sepanjang minggu yang sama', () => {
  const start = weeklyThemeForNow(BASE_MS);
  const end = weeklyThemeForNow(BASE_MS + WEEK_MS - 1);
  assert.equal(start.cardId, end.cardId);
  assert.equal(start.weekIndex, end.weekIndex);
});

test('weekly card sama untuk semua pemain pada minggu yang sama', () => {
  const a = weeklyThemeForNow(BASE_MS);
  const b = weeklyThemeForNow(BASE_MS + 3 * 60 * 60 * 1000);
  assert.equal(a.cardId, b.cardId);
  assert.equal(a.theme, b.theme);
});

test('weekly card berganti antar minggu dan mengikuti rotasi', () => {
  const ids = rotationCards();
  assert.ok(ids.length > 0);
  assert.deepEqual([...IMPERIUM_WEEKLY.rotation], ids);

  const seen = [];
  for (let w = 0; w < ids.length; w += 1) {
    const cardId = weeklyThemeForNow(BASE_MS + w * WEEK_MS).cardId;
    assert.ok(ids.includes(cardId), `${cardId} bukan Main Card`);
    seen.push(cardId);
  }
  assert.equal(new Set(seen).size, ids.length, 'rotasi harus mencakup semua kartu');
  assert.equal(weeklyThemeForNow(BASE_MS + ids.length * WEEK_MS).cardId, seen[0]);
});

test('weekly card selalu mereferensikan Card ID yang ada di Card Config', () => {
  for (let w = -5; w < 60; w += 1) {
    const weekly = weeklyThemeForNow(BASE_MS + w * WEEK_MS);
    assert.ok(weekly.card, `card ${weekly.cardId} tidak ada`);
    assert.equal(weekly.card.id, weekly.cardId);
  }
});

test('identitas minggu adalah fungsi murni timestamp sehingga restart-safe', () => {
  assert.equal(weekIndexFor(BASE_MS), weekIndexFor(BASE_MS));
  assert.notEqual(weekIndexFor(BASE_MS), weekIndexFor(BASE_MS + WEEK_MS));
  assert.equal(
    weekIndexFor(BASE_MS + WEEK_MS - 1),
    weekIndexFor(BASE_MS)
  );
  assert.equal(
    weekIndexFor(BASE_MS + WEEK_MS),
    weekIndexFor(BASE_MS) + 1
  );

  const forward = [];
  for (let w = 0; w < 6; w += 1) forward.push(weekIndexFor(BASE_MS + w * WEEK_MS));
  const backward = [];
  for (let w = 5; w >= 0; w -= 1) backward[w] = weekIndexFor(BASE_MS + w * WEEK_MS);
  assert.deepEqual(forward, backward, 'urutan komputasi tidak boleh memengaruhi week index');
});

test('weeklyCardIdFor negatif aman dan berputar', () => {
  const ids = rotationCards();
  assert.equal(weeklyCardIdFor(0), ids[0]);
  assert.equal(weeklyCardIdFor(-1), ids[ids.length - 1]);
  assert.equal(weeklyCardIdFor(ids.length), ids[0]);
});

test('fallback tema tersedia saat konten kartu mingguan tidak ada', () => {
  assert.equal(themeForCard('card_tidak_ada'), IMPERIUM_FALLBACK_THEME);
  assert.equal(themeForCard(null), IMPERIUM_FALLBACK_THEME);
  assert.equal(themeForCard(undefined), IMPERIUM_FALLBACK_THEME);
  for (const chamber of [1, 2]) {
    assert.ok(
      IMPERIUM_FALLBACK_THEME.questions.some((q) => q.chamber === chamber),
      `fallback tidak punya chamber ${chamber}`
    );
  }
});

// ─────────────────────────── Difficulty & gate ───────────────────────────

test('Difficulty 1-3 terbuka langsung, Diff 4 butuh 1-3, Diff 5 butuh 4', () => {
  assert.deepEqual(getDifficulty(1).requires, []);
  assert.deepEqual(getDifficulty(2).requires, []);
  assert.deepEqual(getDifficulty(3).requires, []);
  assert.deepEqual(getDifficulty(4).requires, [1, 2, 3]);
  assert.deepEqual(getDifficulty(5).requires, [4]);

  assert.ok(isDifficultyUnlocked(getDifficulty(1), []));
  assert.ok(isDifficultyUnlocked(getDifficulty(2), []));
  assert.ok(isDifficultyUnlocked(getDifficulty(3), []));
  assert.ok(!isDifficultyUnlocked(getDifficulty(4), [1, 2]));
  assert.ok(!isDifficultyUnlocked(getDifficulty(4), [3]));
  assert.ok(isDifficultyUnlocked(getDifficulty(4), [1, 2, 3]));
  assert.ok(!isDifficultyUnlocked(getDifficulty(5), [1, 2, 3]));
  assert.ok(isDifficultyUnlocked(getDifficulty(5), [4]));
});

test('level gate menutup Imperium di bawah Level 16', async () => {
  const low = createHarness({ level: IMPERIUM_MIN_LEVEL - 1 });
  await assert.rejects(
    () => low.service.startRun(USER, 1, { random: low.rng }),
    (err) => err.code === 'LEVEL'
  );

  const ok = createHarness({ level: IMPERIUM_MIN_LEVEL });
  const run = await ok.service.startRun(USER, 1, { random: ok.rng });
  assert.equal(run.diff, 1);
});

test('Difficulty terkunci ditolak sampai syarat minggu terpenuhi', async () => {
  const h = createHarness({ atk: 4_000, maxHp: 40_000, def: 300 });

  await assert.rejects(
    () => h.service.startRun(USER, 4, { random: h.rng }),
    (err) => err.code === 'LOCKED'
  );
  await assert.rejects(
    () => h.service.startRun(USER, 5, { random: h.rng }),
    (err) => err.code === 'LOCKED'
  );

  const week = weekIndexFor(BASE_MS);
  for (const diff of [1, 2, 3]) {
    await h.imperium.claimClear(USER, week, diff, {});
  }

  const run = await h.service.startRun(USER, 4, { random: h.rng });
  assert.equal(run.diff, 4);
  await assert.rejects(
    () => h.service.startRun(USER, 5, { random: h.rng }),
    (err) => err.code === 'LOCKED'
  );

  await h.imperium.claimClear(USER, week, 4, {});
  const run5 = await h.service.startRun(USER, 5, { random: h.rng });
  assert.equal(run5.diff, 5);
});

test('getStatus melaporkan level, weekly card, dan difficulty terbuka', async () => {
  const h = createHarness();
  const status = await h.service.getStatus(USER);
  const weekly = weeklyThemeForNow(BASE_MS);

  assert.equal(status.levelOk, true);
  assert.equal(status.minLevel, IMPERIUM_MIN_LEVEL);
  assert.equal(status.difficulties.length, IMPERIUM_DIFF_LIST.length);
  assert.deepEqual(
    status.difficulties.filter((d) => d.unlocked).map((d) => d.diff),
    [1, 2, 3]
  );
  assert.deepEqual(status.difficulties.find((d) => d.diff === 4).blockedBy, [1, 2, 3]);
  assert.equal(status.weeklyCardId, weekly.cardId);
  assert.equal(status.weeklyCardName, weekly.card.name);
});

test('getStatus menandai Diff yang sudah clear minggu ini', async () => {
  const h = createHarness({ atk: 4_000, maxHp: 40_000, def: 300 });
  await clearDiff(h, 1);
  const status = await h.service.getStatus(USER);
  assert.equal(status.difficulties.find((d) => d.diff === 1).isCleared, true);
  assert.equal(status.difficulties.find((d) => d.diff === 2).isCleared, false);
});

test('diff tidak valid ditolak', async () => {
  const h = createHarness();
  for (const bad of [0, 6, 99, 'abc']) {
    await assert.rejects(
      () => h.service.startRun(USER, bad, { random: h.rng }),
      (err) => err.code === 'BAD_DIFF'
    );
  }
});

// ─────────────────────────── Kategori jawaban ───────────────────────────

test('setiap pertanyaan punya tepat 3 opsi A/B/C dengan tiga kategori berbeda', () => {
  for (const theme of [...Object.values(IMPERIUM_THEMES), IMPERIUM_FALLBACK_THEME]) {
    for (const chamber of [1, 2]) {
      const pool = theme.questions.filter((q) => q.chamber === chamber);
      assert.ok(pool.length >= 1, `${theme.cardId} tidak punya chamber ${chamber}`);
      for (const q of pool) {
        assert.equal(q.options.length, 3, `${q.id} bukan 3 opsi`);
        assert.deepEqual(
          q.options.map((o) => o.key).sort(),
          [...IMPERIUM_OPTION_KEYS].sort(),
          `${q.id} kunci opsi tidak lengkap`
        );
        assert.deepEqual(
          q.options.map((o) => o.outcome).sort(),
          [CORRECT, CRITICAL, TOLERABLE],
          `${q.id} kategori hasil tidak lengkap`
        );
      }
    }
  }
});

test('posisi A/B/C bukan penentu hasil yang tetap', () => {
  const positions = { [CORRECT]: new Set(), [TOLERABLE]: new Set(), [CRITICAL]: new Set() };
  for (const theme of Object.values(IMPERIUM_THEMES)) {
    for (const q of theme.questions) {
      for (const o of q.options) positions[o.outcome].add(o.key);
    }
  }
  for (const [outcome, keys] of Object.entries(positions)) {
    assert.equal(keys.size, 3, `kategori ${outcome} selalu di posisi yang sama`);
  }
});

test('Critical Mistake selalu lebih merugikan dari Tolerable Mistake', () => {
  for (const theme of Object.values(IMPERIUM_THEMES)) {
    for (const q of theme.questions) {
      const severity = {
        [CORRECT]: severityOf(effectsForOutcome(q, CORRECT)),
        [TOLERABLE]: severityOf(effectsForOutcome(q, TOLERABLE)),
        [CRITICAL]: severityOf(effectsForOutcome(q, CRITICAL)),
      };
      assert.ok(
        severity[CORRECT] < 0,
        `${q.id}: correct harus berupa blessing (severity negatif)`
      );
      assert.ok(
        severity[CORRECT] < severity[TOLERABLE],
        `${q.id}: correct harus lebih ringan dari tolerable`
      );
      assert.ok(
        severity[TOLERABLE] < severity[CRITICAL],
        `${q.id}: critical harus lebih berat dari tolerable`
      );
    }
  }
});

test('jawab A/B/C mengembalikan kategori dan efek yang sesuai', async () => {
  for (const outcome of [CORRECT, TOLERABLE, CRITICAL]) {
    const h = createHarness();
    const run = await h.service.startRun(USER, 1, { random: h.rng });
    const result = await h.service.answerChamber(
      run.runId,
      USER,
      keyFor(run.theme, run.question, outcome)
    );

    assert.equal(result.consequence.outcome, outcome);
    assert.equal(result.consequence.isCorrect, outcome === CORRECT);
    assert.ok(result.consequence.effects.length >= 1);

    const expectedKind = outcome === CORRECT ? 'blessing' : 'curse';
    for (const eff of result.consequence.effects) {
      assert.equal(eff.kind, expectedKind);
      assert.ok(IMPERIUM_EFFECTS[eff.id]);
    }
  }
});

test('opsi di luar A/B/C ditolak dan run tetap utuh', async () => {
  const h = createHarness();
  const run = await h.service.startRun(USER, 1, { random: h.rng });
  for (const bad of ['D', '1', 'x', '', null, undefined]) {
    await assert.rejects(
      () => h.service.answerChamber(run.runId, USER, bad),
      (err) => err.code === 'BAD_OPTION'
    );
  }
  assert.equal(h.state.runs.get(run.runId).chamber, 1);
  assert.equal(h.state.runs.get(run.runId).payload.answers.length, 0);
});

test('huruf kecil untuk opsi tetap diterima', async () => {
  const h = createHarness();
  const run = await h.service.startRun(USER, 1, { random: h.rng });
  const key = keyFor(run.theme, run.question, CORRECT);
  const result = await h.service.answerChamber(run.runId, USER, key.toLowerCase());
  assert.equal(result.consequence.outcome, CORRECT);
});

// ─────────────────────────── Konsekuensi → boss ───────────────────────────

test('Chamber 1 dan 2 membentuk tiga chamber per run', async () => {
  const h = createHarness();
  const run = await h.service.startRun(USER, 1, { random: h.rng });
  assert.equal(run.chamberCount, IMPERIUM_CHAMBER_COUNT);
  assert.equal(IMPERIUM_BOSS_CHAMBER, 3);
  assert.equal(run.chamber, 1);

  const first = await h.service.answerChamber(run.runId, USER, 'A');
  assert.equal(first.kind, 'chamber');
  assert.equal(first.chamber, 2);
  assert.equal(first.bossesAway, 1);

  const second = await h.service.answerChamber(run.runId, USER, 'A');
  assert.equal(second.kind, 'battle');
  assert.equal(second.chamber, IMPERIUM_BOSS_CHAMBER);
});

test('konsekuensi kedua chamber dikumpulkan lalu diterapkan ke boss', async () => {
  const h = createHarness({ atk: 3_000, maxHp: 30_000, def: 300 });
  const run = await h.service.startRun(USER, 1, { random: h.rng });

  const first = await h.service.answerChamber(
    run.runId,
    USER,
    keyFor(run.theme, run.question, CORRECT)
  );
  const second = await h.service.answerChamber(
    run.runId,
    USER,
    keyFor(run.theme, first.question, CORRECT)
  );

  assert.equal(first.consequences.total, 1);
  assert.equal(second.consequences.total, 2);
  assert.equal(second.consequences.blessings.length, 2);
  assert.equal(second.consequences.curses.length, 0);
  assert.equal(second.summary.criticalCount, 0);
  assert.equal(second.summary.correctCount, 2);
  assert.ok(second.bossModifiers.allCorrect);
});

test('Critical Mistake strengthen boss dan mengganti blessing jadi curse', async () => {
  const clean = createHarness({ atk: 3_000, maxHp: 30_000, def: 300 });
  const cleanRun = await clean.service.startRun(USER, 1, { random: clean.rng });
  const cleanFirst = await clean.service.answerChamber(
    cleanRun.runId,
    USER,
    keyFor(cleanRun.theme, cleanRun.question, CORRECT)
  );
  const cleanBattle = await clean.service.answerChamber(
    cleanRun.runId,
    USER,
    keyFor(cleanRun.theme, cleanFirst.question, CORRECT)
  );

  const cursed = createHarness({ atk: 3_000, maxHp: 30_000, def: 300 });
  const cursedRun = await cursed.service.startRun(USER, 1, { random: cursed.rng });
  const cursedFirst = await cursed.service.answerChamber(
    cursedRun.runId,
    USER,
    keyFor(cursedRun.theme, cursedRun.question, CRITICAL)
  );
  const cursedBattle = await cursed.service.answerChamber(
    cursedRun.runId,
    USER,
    keyFor(cursedRun.theme, cursedFirst.question, CRITICAL)
  );

  assert.ok(
    cursedBattle.bossModifiers.atkPct > cleanBattle.bossModifiers.atkPct,
    'boss harus lebih kuat setelah Critical Mistake'
  );
  assert.ok(cursedBattle.bossModifiers.maxHpPct > cleanBattle.bossModifiers.maxHpPct);
  assert.ok(!cursedBattle.bossModifiers.allCorrect);
  assert.equal(cursedBattle.consequences.blessings.length, 0);
  assert.equal(cursedBattle.consequences.curses.length, 2);
  assert.equal(cursedBattle.summary.criticalCount, 2);
  assert.equal(cleanBattle.summary.criticalCount, 0);
});

test('modifier boss memakai gimmick kartu mingguan', () => {
  const weekly = weeklyThemeForNow(BASE_MS);
  const modifiers = bossModifiers({ theme: weekly.theme, criticalCount: 0, correctCount: 1 });
  assert.equal(modifiers.label, weekly.theme.bossGimmick.label);
  assert.equal(modifiers.atkPct, weekly.theme.bossGimmick.atkPct);
  assert.equal(modifiers.maxHpPct, weekly.theme.bossGimmick.maxHpPct);
  assert.equal(modifiers.defPct, weekly.theme.bossGimmick.defPct * 1.08);
  assert.equal(modifiers.allCorrect, true);
});

test('modifier boss diterapkan ke stat boss dan tetap valid', () => {
  const modifiers = bossModifiers({
    theme: IMPERIUM_THEMES.girgas,
    criticalCount: 2,
    correctCount: 0,
  });
  const base = getDifficulty(5).boss.stats;
  const stats = applyBossModifiers(base, modifiers);
  assert.ok(stats.maxHp > base.maxHp);
  assert.ok(stats.atk > base.atk);
  assert.ok(stats.def > 0);
  assert.ok(Number.isInteger(stats.maxHp));
  assert.ok(Number.isInteger(stats.atk));
  assert.equal(stats.critRate, base.critRate);
  assert.equal(stats.critDmg, base.critDmg);
});

test('konsekuensi ditranslasikan ke format passive Battle Engine', () => {
  const consequences = collectConsequences([
    { effects: ['blessing_keen_edge'] },
    { effects: ['critical_shattered_ward'] },
  ]);
  assert.equal(consequences.length, 2);

  const passives = consequencesToPassives(consequences);
  assert.equal(passives.length, 2);
  assert.deepEqual(
    passives.map((p) => p.source),
    ['imperium-blessing', 'imperium-curse']
  );
  for (const passive of passives) {
    assert.ok(['battle_start', 'attack', 'defend'].includes(passive.trigger));
    assert.ok(Object.keys(passive.modifiers).length > 0);
  }

  const summary = consequenceSummary(consequences);
  assert.equal(summary.total, 2);
  assert.equal(summary.blessings.length, 1);
  assert.equal(summary.curses.length, 1);
});

test('boss battle memakai Battle Engine existing, bukan engine baru', async () => {
  const seed = 4242;
  const h = createHarness({ atk: 900, maxHp: 6_000, def: 120 });
  const run = await h.service.startRun(USER, 2, { random: h.rng });

  const c1Outcome = CORRECT;
  const c2Outcome = TOLERABLE;
  const first = await h.service.answerChamber(
    run.runId,
    USER,
    keyFor(run.theme, run.question, c1Outcome)
  );
  const secondKey = keyFor(run.theme, first.question, c2Outcome);

  h.rng.reset(seed);
  const battle = await h.service.answerChamber(run.runId, USER, secondKey);

  const usedEffects = [
    ...effectsFor(run.theme, run.question, c1Outcome),
    ...effectsFor(run.theme, first.question, c2Outcome),
  ];
  const replayRng = makeRng(seed);
  const difficulty = getDifficulty(2);
  const state = createBattle({
    playerStats: {
      maxHp: h.state.player.max_hp,
      currentHp: h.state.player.max_hp,
      atk: h.state.player.atk,
      def: h.state.player.def,
      critRate: h.state.player.crit_rate,
      critDmg: h.state.player.crit_dmg,
    },
    enemy: {
      id: difficulty.boss.id,
      name: difficulty.boss.name,
      behavior: difficulty.boss.behavior,
      stats: applyBossModifiers(difficulty.boss.stats, battle.bossModifiers),
    },
    playerSkills: {
      active: null,
      passives: consequencesToPassives(collectConsequences([{ effects: usedEffects }])),
    },
    enemySkills: difficulty.boss.skills,
    maxRounds: IMPERIUM_MAX_ROUNDS,
    battleId: 'replay',
  });
  const replay = simulateBattle(state, autoSkillAction, replayRng);

  assert.equal(battle.status, replay.status);
  assert.equal(battle.rounds, replay.round);
  assert.equal(battle.playerHp, replay.player.hp);
  assert.equal(battle.enemyHp, replay.enemy.hp);
  assert.equal(battle.startHp, h.state.player.max_hp);
});

test('boss memakai skill yang kompatibel dengan Battle Engine', () => {
  for (const diff of IMPERIUM_DIFF_LIST) {
    const entry = getDifficulty(diff);
    assert.ok(['basic', 'skill_based'].includes(entry.boss.behavior));
    if (entry.boss.skills) {
      const active = entry.boss.skills.active;
      assert.ok(active.unlocked);
      assert.ok(active.multiplier > 0);
      assert.ok(active.cooldownSec > 0);
    }
  }
});

// ─────────────────────────── HP & state run ───────────────────────────

test('battle selalu mulai dari maxHp dan tidak menulis HP Profile', async () => {
  const h = createHarness({ maxHp: 5_000, currentHp: 25, atk: 2_000, def: 200 });
  const run = await h.service.startRun(USER, 1, { random: h.rng });
  const first = await h.service.answerChamber(
    run.runId,
    USER,
    keyFor(run.theme, run.question, CORRECT)
  );
  const battle = await h.service.answerChamber(
    run.runId,
    USER,
    keyFor(run.theme, first.question, CORRECT)
  );

  assert.equal(battle.startHp, 5_000);
  assert.notEqual(battle.startHp, 25);
  assert.equal(h.state.player.current_hp, 25, 'currentHp Profile tidak boleh berubah');
  assert.equal(h.state.hpWriteCalls, 0, 'Imperium tidak boleh menulis HP ke Profile');
});

test('kalah mengakhiri run tanpa reward dan tanpa menulis HP', async () => {
  const h = createHarness({ maxHp: 200, currentHp: 3, atk: 1, def: 0 });
  const run = await h.service.startRun(USER, 1, { random: h.rng });
  const first = await h.service.answerChamber(
    run.runId,
    USER,
    keyFor(run.theme, run.question, CRITICAL)
  );
  const battle = await h.service.answerChamber(
    run.runId,
    USER,
    keyFor(run.theme, first.question, CRITICAL)
  );

  assert.notEqual(battle.status, 'WIN');
  assert.equal(battle.rewards, null);
  assert.equal(h.state.coin, 0);
  assert.equal(h.state.cerelia, 0);
  assert.equal(h.state.player.current_hp, 3);
  assert.equal(h.state.hpWriteCalls, 0);
  assert.equal(h.state.runs.get(run.runId).status, 'lost');
});

test('retry memulai run baru tanpa membawa state attempt sebelumnya', async () => {
  const h = createHarness({ atk: 2_500, maxHp: 20_000, def: 200 });
  const firstRun = await h.service.startRun(USER, 1, { random: h.rng });
  await h.service.answerChamber(
    firstRun.runId,
    USER,
    keyFor(firstRun.theme, firstRun.question, CORRECT)
  );

  const secondRun = await h.service.startRun(USER, 1, { random: h.rng });
  assert.notEqual(secondRun.runId, firstRun.runId);
  assert.equal(secondRun.chamber, 1);
  assert.equal(h.state.runs.get(firstRun.runId).status, 'abandoned');
  assert.equal(h.state.runs.get(secondRun.runId).payload.answers.length, 0);
  assert.deepEqual(h.state.runs.get(secondRun.runId).payload.stats, {
    correct: 0,
    tolerable: 0,
    critical: 0,
  });

  const retryFirst = await h.service.answerChamber(
    secondRun.runId,
    USER,
    keyFor(secondRun.theme, secondRun.question, CRITICAL)
  );
  assert.equal(retryFirst.consequences.total, 1);
  assert.equal(retryFirst.consequences.blessings.length, 0);

  const battle = await h.service.answerChamber(
    secondRun.runId,
    USER,
    keyFor(secondRun.theme, retryFirst.question, CRITICAL)
  );
  assert.equal(battle.consequences.total, 2);
  assert.equal(battle.summary.blessings.length, 0);
  assert.ok(!battle.bossModifiers.allCorrect);
});

test('double tap pada chamber yang sama hanya satu yang diterima', async () => {
  const h = createHarness();
  const run = await h.service.startRun(USER, 1, { random: h.rng });

  const results = await Promise.allSettled([
    h.service.answerChamber(run.runId, USER, 'A'),
    h.service.answerChamber(run.runId, USER, 'B'),
    h.service.answerChamber(run.runId, USER, 'C'),
  ]);

  const ok = results.filter((r) => r.status === 'fulfilled');
  const rejected = results.filter((r) => r.status === 'rejected');
  assert.equal(ok.length, 1, 'tepat satu pilihan yang boleh masuk');
  for (const bad of rejected) assert.equal(bad.reason.code, 'STALE');

  const stored = h.state.runs.get(run.runId);
  assert.equal(stored.payload.answers.length, 1, 'hanya satu jawaban yang tercatat');
  assert.equal(stored.chamber, 2);
});

test('memilih ulang Chamber 1 setelah pindah ke Chamber 2 ditolak', async () => {
  const h = createHarness();
  const run = await h.service.startRun(USER, 1, { random: h.rng });
  const first = await h.service.answerChamber(run.runId, USER, 'A');
  assert.equal(first.chamber, 2);

  const before = h.state.runs.get(run.runId).payload.answers.length;
  await h.service.answerChamber(
    run.runId,
    USER,
    keyFor(run.theme, first.question, CORRECT)
  );
  assert.equal(
    h.state.runs.get(run.runId).payload.answers.length,
    before + 1,
    'jawaban kedua hanya boleh untuk Chamber 2'
  );
  assert.equal(h.state.runs.get(run.runId).payload.answers[1].chamber, 2);
});

test('callback lama, run milik orang lain, dan run selesai ditolak', async () => {
  const h = createHarness();
  const run = await h.service.startRun(USER, 1, { random: h.rng });

  await assert.rejects(
    () => h.service.answerChamber(run.runId, 'orang_lain', 'A'),
    (err) => err.code === 'NOT_OWNER'
  );
  await assert.rejects(
    () => h.service.answerChamber('imp_hilang', USER, 'A'),
    (err) => err.code === 'NO_RUN'
  );

  await h.service.answerChamber(run.runId, USER, 'A');
  await h.service.answerChamber(run.runId, USER, 'A');
  await assert.rejects(
    () => h.service.answerChamber(run.runId, USER, 'A'),
    (err) => err.code === 'CLOSED'
  );
  assert.equal(await h.service.getRun(run.runId, 'orang_lain'), null);
  assert.equal(await h.service.getRun('imp_hilang', USER), null);
});

test('run kedaluwarsa ditolak dan ditandai abandoned', async () => {
  const h = createHarness();
  const run = await h.service.startRun(USER, 1, { random: h.rng });
  h.state.runs.get(run.runId).expires_at = Math.floor(BASE_MS / 1000) + 5;

  await assert.rejects(
    () => serviceAt(h, BASE_MS + 10 * 60 * 1000).answerChamber(run.runId, USER, 'A'),
    (err) => err.code === 'EXPIRED'
  );
  assert.equal(h.state.runs.get(run.runId).status, 'abandoned');
});

test('abandonRun menutup run milik sendiri saja', async () => {
  const h = createHarness();
  const run = await h.service.startRun(USER, 1, { random: h.rng });
  assert.equal(await h.service.abandonRun(run.runId, 'orang_lain'), false);
  assert.equal(h.state.runs.get(run.runId).status, 'active');
  assert.equal(await h.service.abandonRun(run.runId, USER), true);
  assert.equal(h.state.runs.get(run.runId).status, 'abandoned');
});

// ─────────────────────────── Reward & weekly ───────────────────────────

test('reward diberikan sekali per Diff per minggu', async () => {
  const h = createHarness({ atk: 4_000, maxHp: 40_000, def: 300 });

  const first = await clearDiff(h, 1);
  assert.equal(first.status, 'WIN');
  assert.equal(first.replay, false);
  const reward = first.rewards;
  assert.equal(h.state.coin, reward.coin);
  assert.equal(h.state.cerelia, reward.cerelia);

  const replay = await clearDiff(h, 1);
  assert.equal(replay.status, 'WIN');
  assert.equal(replay.replay, true);
  assert.deepEqual(replay.rewards, reward);
  assert.equal(h.state.coin, reward.coin, 'coin tidak boleh bertambah dua kali');
  assert.equal(h.state.cerelia, reward.cerelia);
  assert.ok(h.state.claimAttempts >= 2);
});

test('klaim reward yang sama tidak bisa masuk dua kali walau dipanggil bersamaan', async () => {
  const h = createHarness();
  const week = weekIndexFor(BASE_MS);
  const claims = await Promise.all([
    h.imperium.claimClear(USER, week, 1, { coin: 1 }),
    h.imperium.claimClear(USER, week, 1, { coin: 2 }),
    h.imperium.claimClear(USER, week, 1, { coin: 3 }),
  ]);
  assert.equal(claims.filter(Boolean).length, 1);
  assert.deepEqual(await h.imperium.clearedDifficulties(USER, week), [1]);
  assert.equal(await h.imperium.clearedCount(USER, week), 1);
});

test('request paralel ke chamber berbeda tetap menghasilkan satu klaim', async () => {
  const h = createHarness({ atk: 4_000, maxHp: 40_000, def: 300 });
  const runA = await h.service.startRun(USER, 1, { random: h.rng });
  const firstA = await h.service.answerChamber(runA.runId, USER, 'A');
  const runB = await h.service.startRun(USER, 2, { random: h.rng });
  const firstB = await h.service.answerChamber(runB.runId, USER, 'A');

  const [battleA, battleB] = await Promise.all([
    h.service.answerChamber(
      runA.runId,
      USER,
      keyFor(runA.theme, firstA.question, CORRECT)
    ),
    h.service.answerChamber(
      runB.runId,
      USER,
      keyFor(runB.theme, firstB.question, CORRECT)
    ),
  ]);

  assert.equal(battleA.status, 'WIN');
  assert.equal(battleB.status, 'WIN');
  assert.equal(battleA.replay, false);
  assert.equal(battleB.replay, false, 'Diff berbeda tetap boleh dapat reward sendiri');
  assert.deepEqual(
    await h.imperium.clearedDifficulties(USER, weekIndexFor(BASE_MS)),
    [1, 2]
  );
  assert.equal(h.state.coin, battleA.rewards.coin + battleB.rewards.coin);
  assert.ok(h.state.advisoryLocks >= 2, 'setiap klaim lewat transaksi dengan lock');
});

test('reward tiap Diff memakai range konfigurasi masing-masing', async () => {
  const h = createHarness({ atk: 6_000, maxHp: 60_000, def: 400 });
  const seen = [];
  for (const diff of [1, 2, 3]) {
    const battle = await clearDiff(h, diff);
    assert.equal(battle.status, 'WIN', `diff ${diff} harus bisa dimenangkan`);
    const range = getDifficulty(diff).rewards;
    assert.ok(battle.rewards.exp >= range.exp.min && battle.rewards.exp <= range.exp.max);
    assert.ok(
      battle.rewards.coin >= range.coin.min && battle.rewards.coin <= range.coin.max
    );
    assert.ok(
      battle.rewards.cerelia >= range.cerelia.min &&
        battle.rewards.cerelia <= range.cerelia.max
    );
    seen.push(battle.rewards.coin);
  }
  assert.ok(seen[0] < seen[1] && seen[1] < seen[2], 'reward naik sesuai kesulitan');
});

test('weekly reset mereset progres, unlock, dan klaim reward', async () => {
  const h = createHarness({ atk: 4_000, maxHp: 40_000, def: 300 });
  const weekA = weekIndexFor(BASE_MS);
  const first = await clearDiff(h, 1);
  assert.equal(first.status, 'WIN');
  assert.equal(first.replay, false);

  const next = serviceAt(h, BASE_MS + WEEK_MS);
  const statusNext = await next.getStatus(USER);
  assert.equal(statusNext.weekIndex, weekA + 1);
  assert.deepEqual(statusNext.cleared, []);
  assert.equal(statusNext.difficulties.find((d) => d.diff === 1).isCleared, false);
  assert.deepEqual(statusNext.difficulties.find((d) => d.diff === 4).blockedBy, [1, 2, 3]);

  const coinBefore = h.state.coin;
  const run2 = await next.startRun(USER, 1, { random: h.rng });
  const step2 = await next.answerChamber(run2.runId, USER, 'A');
  const second = await next.answerChamber(step2.runId, USER, 'A');
  assert.equal(second.status, 'WIN');
  assert.equal(second.replay, false, 'minggu baru berarti klaim baru');
  assert.ok(h.state.coin > coinBefore);
  assert.notEqual(second.rewards.coin, first.rewards.coin + second.rewards.coin);
});

test('clear di minggu lama tidak membuka Diff di minggu baru', async () => {
  const h = createHarness();
  const weekA = weekIndexFor(BASE_MS);
  for (const diff of [1, 2, 3]) {
    await h.imperium.claimClear(USER, weekA, diff, {});
  }
  assert.deepEqual(await h.imperium.clearedDifficulties(USER, weekA), [1, 2, 3]);
  assert.ok(isDifficultyUnlocked(getDifficulty(4), [1, 2, 3]));

  const weekB = weekA + 1;
  assert.deepEqual(await h.imperium.clearedDifficulties(USER, weekB), []);
  assert.ok(!isDifficultyUnlocked(getDifficulty(4), []));
  await assert.rejects(
    () => serviceAt(h, BASE_MS + WEEK_MS).startRun(USER, 4, { random: h.rng }),
    (err) => err.code === 'LOCKED'
  );
});

test('clear hanya berlaku untuk minggu yang sama, bukan untuk minggu lampau', async () => {
  const h = createHarness({ atk: 4_000, maxHp: 40_000, def: 300 });
  await clearDiff(h, 1);
  const older = serviceAt(h, BASE_MS - WEEK_MS);
  const statusOlder = await older.getStatus(USER);
  assert.deepEqual(statusOlder.cleared, []);
  assert.equal(statusOlder.difficulties.find((d) => d.diff === 1).isCleared, false);
});

test('restart tidak mengubah hasil: identitas minggu dihitung ulang dari waktu', async () => {
  const h = createHarness({ atk: 4_000, maxHp: 40_000, def: 300 });
  const before = await h.service.getStatus(USER);
  const after = await serviceAt(h, BASE_MS).getStatus(USER);
  assert.equal(after.weekIndex, before.weekIndex);
  assert.equal(after.weeklyCardId, before.weeklyCardId);
  assert.deepEqual(after.cleared, before.cleared);
});

// ─────────────────────────── Pemain tanpa card ───────────────────────────

test('pemain tidak wajib memiliki Weekly Card untuk masuk Labyrinth', async () => {
  const h = createHarness({ effects: [] });
  const run = await h.service.startRun(USER, 1, { random: h.rng });
  const weekly = weeklyThemeForNow(BASE_MS);

  assert.equal(run.cardId, weekly.cardId);
  assert.ok(rotationCards().includes(run.cardId));
  assert.equal(run.theme.cardId, weekly.cardId);

  await h.service.answerChamber(run.runId, USER, 'A');
  const battle = await h.service.answerChamber(run.runId, USER, 'A');
  assert.equal(battle.kind, 'battle');
  assert.ok(['WIN', 'LOSE', 'DRAW'].includes(battle.status));
});

test('card yang dimiliki pemain tetap dipakai sebagai passive', async () => {
  const effects = [
    {
      source: 'main-passive',
      cardId: 'girgas',
      name: 'Sugar Rush',
      upgraded: false,
      cooldownMs: null,
      effects: [{ stat: 'critRate', mode: 'add', value: 0.05 }],
    },
  ];
  const plain = createHarness({ atk: 50, maxHp: 300, def: 25 });
  const withCard = createHarness({ atk: 50, maxHp: 300, def: 25, effects });

  plain.rng.reset(1234);
  withCard.rng.reset(1234);
  const runA = await plain.service.startRun(USER, 1, { random: plain.rng });
  await plain.service.answerChamber(runA.runId, USER, 'A');
  plain.rng.reset(99);
  const battleA = await plain.service.answerChamber(runA.runId, USER, 'A');

  const runB = await withCard.service.startRun(USER, 1, { random: withCard.rng });
  await withCard.service.answerChamber(runB.runId, USER, 'A');
  withCard.rng.reset(99);
  const battleB = await withCard.service.answerChamber(runB.runId, USER, 'A');

  assert.ok(battleA.enemyHp > 0, 'boss harus masih hidup supaya selisih terlihat');
  assert.equal(battleA.enemyMaxHp, battleB.enemyMaxHp, 'boss tidak boleh berubah');
  assert.notEqual(
    battleA.enemyHp,
    battleB.enemyHp,
    'passive Main Card harus mengubah hasil battle'
  );
});

// ─────────────────────────── EXP ───────────────────────────

test('EXP diberikan mengikuti progression existing', async () => {
  const h = createHarness({ atk: 4_000, maxHp: 40_000, def: 300 });
  h.state.player.level = 16;
  h.state.player.exp = 40;

  const battle = await clearDiff(h, 1);
  assert.equal(battle.status, 'WIN');

  const expected = applyPlayerExp(16, 40, battle.rewards.exp);
  assert.equal(h.state.player.level, expected.level);
  assert.equal(h.state.player.exp, expected.exp);
});

// ─────────────────────────── Konfigurasi difficulty ───────────────────────────

test('konfigurasi difficulty konsisten dan naik monoton', () => {
  assert.deepEqual([...IMPERIUM_DIFF_LIST], [1, 2, 3, 4, 5]);
  for (const diff of IMPERIUM_DIFF_LIST) {
    const entry = getDifficulty(diff);
    assert.ok(entry, `diff ${diff} tidak ada`);
    assert.equal(entry.diff, diff);
    assert.ok(entry.boss.stats.maxHp > 0);
    assert.ok(entry.boss.stats.atk > 0);
    assert.ok(entry.boss.stats.def >= 0);
    assert.ok(entry.rewards.coin.max >= entry.rewards.coin.min);
    assert.ok(entry.rewards.exp.max >= entry.rewards.exp.min);
    assert.ok(entry.rewards.cerelia.max >= entry.rewards.cerelia.min);
  }
  for (let i = 1; i < IMPERIUM_DIFF_LIST.length; i += 1) {
    const prev = getDifficulty(i);
    const next = getDifficulty(i + 1);
    assert.ok(next.boss.stats.maxHp > prev.boss.stats.maxHp);
    assert.ok(next.boss.stats.atk > prev.boss.stats.atk);
    assert.ok(next.boss.stats.def >= prev.boss.stats.def);
  }
});

test('boss unik per Difficulty', () => {
  const ids = IMPERIUM_DIFF_LIST.map((d) => getDifficulty(d).boss.id);
  assert.equal(new Set(ids).size, IMPERIUM_DIFF_LIST.length);
});