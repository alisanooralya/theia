import { sql } from '#storage/connection.js';
import { rpgPlayerModel } from '../models/rpg-player.model.js';
import { rpgCoinModel } from '../models/rpg-coin.model.js';
import { rpgInventoryModel } from '../models/rpg-inventory.model.js';
import { imperiumModel, makeRunId } from '../models/imperium.model.js';
import { finalStatService as defaultFinals } from './final-stat-service.js';
import { createCardService } from './card-service.js';
import { grantPlayerExp } from './player-progress.js';
import {
  autoSkillAction,
  battleSkillsFromEffects,
  createBattle,
  simulateBattle,
} from './battle-engine.js';
import {
  IMPERIUM_ANSWER_BOSS_MODIFIERS,
  IMPERIUM_BOSS_CHAMBER,
  IMPERIUM_CHAMBER_COUNT,
  IMPERIUM_EFFECTS,
  IMPERIUM_MAX_ROUNDS,
  IMPERIUM_MIN_LEVEL,
  IMPERIUM_OPTION_KEYS,
  IMPERIUM_OUTCOME_META,
  IMPERIUM_OUTCOMES,
  IMPERIUM_QUESTIONS_PER_CHAMBER,
  IMPERIUM_RUN_TTL_SEC,
  getDifficulty,
  getDifficulties,
  rollReward,
  themeForCard,
  weeklyThemeForNow,
} from '../config/imperium-config.js';

function fail(message, code) {
  const err = new RangeError(message);
  err.code = code;
  return err;
}

function normalizeOption(raw) {
  if (!raw) return null;
  const key = String(raw).trim().toUpperCase();
  return IMPERIUM_OPTION_KEYS.includes(key) ? key : null;
}

/**
 * Konsekuensi dari Chamber 1 dan 2 dikumpulkan di sini lalu baru dipakai
 * saat Chamber 3. Run baru selalu memanggil ini dari array kosong.
 */
export function collectConsequences(answers = []) {
  const collected = [];
  for (const answer of answers) {
    for (const effectId of answer?.effects ?? []) {
      const def = IMPERIUM_EFFECTS[effectId];
      if (def) collected.push(def);
    }
  }
  return collected;
}

export function consequenceSummary(consequences = []) {
  return {
    total: consequences.length,
    blessings: consequences
      .filter((c) => c.kind === 'blessing')
      .map((c) => c.label),
    curses: consequences
      .filter((c) => c.kind === 'curse')
      .map((c) => c.label),
  };
}

/**
 * Blessing dan Curse diterjemahkan jadi passive pemain dengan format yang
 * sama seperti skill Card, jadi Battle Engine existing tetap jadi satu-satunya
 * sumber kebenaran combat.
 */
export function consequencesToPassives(consequences = []) {
  return consequences.map((def) => ({ ...def.passive }));
}

/**
 * Modifier boss berasal dari kartu mingguan + jawaban pemain: setiap Critical
 * Mistake strengthening boss, jawaban sempurna memperkuat DEF boss.
 */
export function bossModifiers({ theme, criticalCount = 0, correctCount = 0 } = {}) {
  const gimmick = theme?.bossGimmick ?? {
    atkPct: 1,
    defPct: 1,
    maxHpPct: 1,
  };
  const rules = IMPERIUM_ANSWER_BOSS_MODIFIERS;
  return {
    label: gimmick.label ?? null,
    atkPct: gimmick.atkPct * (1 + rules.atkPerCritical * criticalCount),
    defPct:
      gimmick.defPct * (1 + (criticalCount === 0 ? rules.defAllCorrect : 0)),
    maxHpPct: gimmick.maxHpPct * (1 + rules.maxHpPerCritical * criticalCount),
    allCorrect: correctCount > 0 && criticalCount === 0,
  };
}

export function applyBossModifiers(bossStats, modifiers) {
  return {
    maxHp: Math.max(1, Math.round(bossStats.maxHp * modifiers.maxHpPct)),
    atk: Math.max(0, Math.round(bossStats.atk * modifiers.atkPct)),
    def: Math.max(0, Math.round(bossStats.def * modifiers.defPct)),
    critRate: bossStats.critRate,
    critDmg: bossStats.critDmg,
  };
}

export function isDifficultyUnlocked(difficulty, cleared = []) {
  const clearedSet = new Set(cleared);
  return difficulty.requires.every((req) => clearedSet.has(req));
}

export function pickQuestion(theme, chamber, random = Math.random) {
  const pool = theme.questions.filter((q) => q.chamber === chamber);
  const needed = IMPERIUM_QUESTIONS_PER_CHAMBER[chamber] ?? 1;
  const available = [...pool];
  const picked = [];
  while (picked.length < needed && available.length) {
    const idx = Math.min(
      available.length - 1,
      Math.floor(random() * available.length)
    );
    picked.push(available.splice(idx, 1)[0]);
  }
  if (!picked.length) {
    throw new RangeError(`imperium: no chamber ${chamber} question in theme`);
  }
  return picked[0];
}

/** Pertanyaan disimpan penuh di payload run supaya tema yang berganti di
 *  tengah minggu tidak bisa mengganti Chamber 2 pada run yang sedang jalan. */
function publicQuestion(question) {
  return {
    id: question.id,
    chamber: question.chamber,
    prompt: question.prompt,
    lore: question.lore,
    options: question.options.map((o) => ({ key: o.key, text: o.text })),
  };
}

export function describeOutcome(option) {
  const meta = IMPERIUM_OUTCOME_META[option.outcome];
  return {
    key: option.key,
    outcome: option.outcome,
    label: meta.label,
    isCorrect: option.outcome === IMPERIUM_OUTCOMES.correct,
    effects: option.effects.map((id) => {
      const def = IMPERIUM_EFFECTS[id];
      return { id: def.id, label: def.label, kind: def.kind };
    }),
  };
}

export function createImperiumService({
  playerModel,
  coinModel,
  inventoryModel,
  imperium = imperiumModel,
  finalStatsService,
  cardService,
  db = sql,
  now = Date.now,
} = {}) {
  const players = playerModel ?? rpgPlayerModel;
  const coins = coinModel ?? rpgCoinModel;
  const inventory = inventoryModel ?? rpgInventoryModel;
  const runs = imperium;
  const finals = finalStatsService ?? defaultFinals;
  const cards = cardService ?? createCardService();

  async function readProgress(userId, nowMs) {
    const { weekIndex } = weeklyThemeForNow(nowMs);
    const cleared = await runs.clearedDifficulties(userId, weekIndex);
    return { weekIndex, cleared };
  }

  async function describeDifficulty(entry, cleared, player) {
    const unlocked = isDifficultyUnlocked(entry, cleared);
    return {
      diff: entry.diff,
      name: entry.name,
      emoji: entry.emoji,
      description: entry.description,
      boss: entry.boss.name,
      bossHp: entry.boss.stats.maxHp,
      requires: [...entry.requires],
      blockedBy: unlocked
        ? null
        : entry.requires.filter((req) => !cleared.includes(req)),
      unlocked,
      isCleared: cleared.includes(entry.diff),
      levelOk: (player?.level ?? 0) >= IMPERIUM_MIN_LEVEL,
      rewards: entry.rewards,
    };
  }

  async function loadPlayer(userId) {
    return players.ensure(userId);
  }

  /**
   * Reward hanya boleh masuk satu kali per Diff per minggu. Advisory lock
   * menyerialkan request paralel untuk user yang sama, dan PK pada tabel
   * progress menolak INSERT kedua.
   */
  async function claimWeeklyReward(userId, difficulty, weekIndex, random) {
    const rewards = {
      exp: rollReward(difficulty.rewards.exp, random),
      coin: rollReward(difficulty.rewards.coin, random),
      cerelia: rollReward(difficulty.rewards.cerelia, random),
    };

    return db.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(hashtext(${`imperium:${userId}`}))`;

      const claim = await runs.claimClear(
        userId,
        weekIndex,
        difficulty.diff,
        rewards,
        tx
      );
      if (!claim) {
        const prior = await runs.findClear(
          userId,
          weekIndex,
          difficulty.diff,
          tx
        );
        let priorRewards;
        try {
          priorRewards = JSON.parse(prior?.rewards ?? '{}');
        } catch {
          priorRewards = {};
        }
        return { rewards: priorRewards, replay: true, leveledUp: false };
      }

      await coins.addCoin(userId, rewards.coin, tx);
      await inventory.add(userId, 'cerelia', rewards.cerelia, tx);
      const growth = await grantPlayerExp(players, userId, rewards.exp, tx);
      return { rewards, replay: false, leveledUp: Boolean(growth?.leveledUp) };
    });
  }

  async function resolveBossBattle(runId, userId, difficulty, payload, random) {
    // Tema diambil dari cardId yang tersimpan saat run mulai, bukan dari
    // tanggal sekarang, supaya gimmick boss selalu cocok dengan Weekly Card.
    const theme = themeForCard(payload.cardId);
    const answers = payload.answers ?? [];
    const stats = payload.stats ?? {};
    const criticalCount = Number(stats.critical ?? 0);
    const correctCount = Number(stats.correct ?? 0);

    const consequences = collectConsequences(answers);
    const modifiers = bossModifiers({ theme, criticalCount, correctCount });
    const enemyStats = applyBossModifiers(difficulty.boss.stats, modifiers);

    const final = await finals.getFinalStats(userId);
    const activeEffects = await cards.getActiveEffects(userId);
    const playerSkills = battleSkillsFromEffects(activeEffects);
    const passives = consequencesToPassives(consequences);

    // Battle selalu mulai dari maxHp snapshot, bukan currentHp Profile.
    const startHp = final.maxHp;
    const state = createBattle({
      playerStats: {
        maxHp: final.maxHp,
        currentHp: startHp,
        atk: final.atk,
        def: final.def,
        critRate: final.critRate,
        critDmg: final.critDmg,
      },
      enemy: {
        id: difficulty.boss.id,
        name: difficulty.boss.name,
        behavior: difficulty.boss.behavior,
        stats: enemyStats,
      },
      playerSkills: {
        ...playerSkills,
        passives: [...(playerSkills.passives ?? []), ...passives],
      },
      enemySkills: difficulty.boss.skills ?? null,
      maxRounds: IMPERIUM_MAX_ROUNDS,
      battleId: runId,
    });

    const end = simulateBattle(state, autoSkillAction, random);
    const collected = consequenceSummary(consequences);
    const summary = {
      bossName: difficulty.boss.name,
      bossHp: enemyStats.maxHp,
      bossModifiers: modifiers,
      startHp,
      playerHp: end.player.hp,
      rounds: end.round,
      status: end.status,
      blessings: collected.blessings,
      curses: collected.curses,
      criticalCount,
      correctCount,
    };

    if (end.status !== 'WIN') {
      return {
        status: end.status,
        rounds: end.round,
        bossName: difficulty.boss.name,
        startHp,
        playerHp: end.player.hp,
        enemyHp: end.enemy.hp,
        enemyMaxHp: enemyStats.maxHp,
        bossModifiers: modifiers,
        rewards: null,
        replay: false,
        leveledUp: false,
        summary,
      };
    }

    const claimed = await claimWeeklyReward(
      userId,
      difficulty,
      payload.weekIndex,
      random
    );

    return {
      status: 'WIN',
      rounds: end.round,
      bossName: difficulty.boss.name,
      startHp,
      playerHp: end.player.hp,
      enemyHp: end.enemy.hp,
      enemyMaxHp: enemyStats.maxHp,
      bossModifiers: modifiers,
      rewards: claimed.rewards,
      replay: claimed.replay,
      leveledUp: claimed.leveledUp,
      summary: { ...summary, rewards: claimed.rewards, replay: claimed.replay },
    };
  }

  return {
    config: {
      minLevel: IMPERIUM_MIN_LEVEL,
      chambers: IMPERIUM_CHAMBER_COUNT,
      bossChamber: IMPERIUM_BOSS_CHAMBER,
      maxRounds: IMPERIUM_MAX_ROUNDS,
      runTtlSec: IMPERIUM_RUN_TTL_SEC,
    },

    async getStatus(userId, { nowMs = now() } = {}) {
      const player = await loadPlayer(userId);
      const weekly = weeklyThemeForNow(nowMs);
      const { weekIndex, cleared } = await readProgress(userId, nowMs);
      const difficulties = await Promise.all(
        getDifficulties().map((entry) =>
          describeDifficulty(entry, cleared, player)
        )
      );
      return {
        weekIndex,
        level: player.level,
        minLevel: IMPERIUM_MIN_LEVEL,
        levelOk: player.level >= IMPERIUM_MIN_LEVEL,
        weeklyCardId: weekly.cardId,
        weeklyCardName: weekly.card?.name ?? weekly.theme.title,
        weeklyTheme: weekly.theme,
        cleared,
        difficulties,
      };
    },

    async startRun(userId, diffInput, { nowMs = now(), random = Math.random } = {}) {
      const entry = getDifficulty(diffInput);
      if (!entry) {
        throw fail(`Difficulty Imperium tidak valid: ${diffInput}`, 'BAD_DIFF');
      }

      const player = await loadPlayer(userId);
      if (player.level < IMPERIUM_MIN_LEVEL) {
        throw fail(
          `Imperium butuh RPG Level ${IMPERIUM_MIN_LEVEL}. Kamu masih Level ${player.level}.`,
          'LEVEL'
        );
      }

      const weekly = weeklyThemeForNow(nowMs);
      const { weekIndex, cleared } = await readProgress(userId, nowMs);
      if (!isDifficultyUnlocked(entry, cleared)) {
        const missing = entry.requires
          .filter((req) => !cleared.includes(req))
          .map((req) => `Diff ${req}`)
          .join(', ');
        throw fail(
          `Diff ${entry.diff} terkunci. Clear ${missing} dulu minggu ini.`,
          'LOCKED'
        );
      }

      await coins.ensure(userId);
      await runs.expireStaleRuns(Math.floor(nowMs / 1000));
      // Retry = run baru total: run aktif lama di difficulty yang sama dibuang.
      await runs.abandonActive(userId, entry.diff);

      const questions = {
        1: pickQuestion(weekly.theme, 1, random),
        2: pickQuestion(weekly.theme, 2, random),
      };
      const expiresAt = Math.floor(nowMs / 1000) + IMPERIUM_RUN_TTL_SEC;
      const payload = {
        weekIndex,
        cardId: weekly.cardId,
        theme: weekly.theme.title,
        questions: {
          1: publicQuestion(questions[1]),
          2: publicQuestion(questions[2]),
        },
        answers: [],
        stats: { correct: 0, tolerable: 0, critical: 0 },
      };

      const run = await runs.startRun(
        makeRunId(),
        userId,
        weekIndex,
        entry.diff,
        payload,
        expiresAt
      );
      if (!run) throw fail('Gagal memulai run Imperium.', 'NO_RUN');

      return {
        runId: run.id,
        diff: entry.diff,
        difficulty: entry,
        weekIndex,
        cardId: weekly.cardId,
        theme: weekly.theme,
        chamber: 1,
        chamberCount: IMPERIUM_CHAMBER_COUNT,
        question: publicQuestion(questions[1]),
        expiresAt,
        clearedThisWeek: cleared.includes(entry.diff),
      };
    },

    async getRun(runId, userId) {
      const run = await runs.findRun(runId);
      if (!run || run.user_id !== userId) return null;
      return run;
    },

    async abandonRun(runId, userId) {
      const run = await runs.findRun(runId);
      if (!run || run.user_id !== userId) return false;
      await runs.finishRun(runId, 'abandoned', run.payload);
      return true;
    },

    /**
     * Satu pintu untuk A/B/C. Perpindahan chamber memakai compare-and-set di
     * database, jadi tap ganda atau callback lama tidak bisa menjawab Chamber 1
     * dua kali maupun melewati Chamber 2.
     */
    async answerChamber(runId, userId, optionInput, { nowMs = now(), random = Math.random } = {}) {
      const optionKey = normalizeOption(optionInput);
      if (!optionKey) throw fail('Pilihan tidak valid. Gunakan A, B, atau C.', 'BAD_OPTION');

      const run = await runs.findRun(runId);
      if (!run) throw fail('Run Imperium tidak ditemukan.', 'NO_RUN');
      if (run.user_id !== userId) {
        throw fail('Run Imperium ini bukan milikmu.', 'NOT_OWNER');
      }
      if (run.status !== 'active') {
        throw fail('Run Imperium ini sudah selesai.', 'CLOSED');
      }
      if (Number(run.expires_at) > 0 && run.expires_at <= Math.floor(nowMs / 1000)) {
        await runs.finishRun(runId, 'abandoned', run.payload);
        throw fail('Run Imperium kedaluwarsa. Mulai ulang.', 'EXPIRED');
      }

      const chamber = Number(run.chamber);
      if (chamber > IMPERIUM_BOSS_CHAMBER - 1) {
        throw fail('Semua chamber pertanyaan sudah dijawab.', 'NO_CHAMBER');
      }

      const payload = run.payload ?? {};
      const question = payload.questions?.[chamber];
      if (!question) throw fail('Pertanyaan Chamber tidak ditemukan.', 'NO_QUESTION');

      const source = weeklyThemeForNow(nowMs).theme;
      const full = source.questions.find((q) => q.id === question.id);
      if (!full) throw fail('Konten Chamber tidak tersedia.', 'NO_QUESTION');
      const option = full.options.find((o) => o.key === optionKey);
      if (!option) {
        throw fail(
          `Pilihan ${optionKey} tidak tersedia untuk Chamber ${chamber}.`,
          'BAD_OPTION'
        );
      }

      const answers = [
        ...(payload.answers ?? []),
        {
          chamber,
          questionId: full.id,
          optionKey: option.key,
          outcome: option.outcome,
          effects: [...option.effects],
        },
      ];
      const stats = {
        correct: answers.filter((a) => a.outcome === IMPERIUM_OUTCOMES.correct)
          .length,
        tolerable: answers.filter((a) => a.outcome === IMPERIUM_OUTCOMES.tolerable)
          .length,
        critical: answers.filter((a) => a.outcome === IMPERIUM_OUTCOMES.critical)
          .length,
      };
      const nextPayload = {
        ...payload,
        answers,
        stats,
        lastOutcome: describeOutcome(option),
      };
      const nextChamber = chamber + 1;

      const advanced = await runs.advanceChamber(
        runId,
        chamber,
        nextChamber,
        nextPayload
      );
      if (!advanced) {
        throw fail('Pilihan sudah diproses atau run sudah berakhir.', 'STALE');
      }

      const consequences = collectConsequences(answers);
      const consequence = describeOutcome(option);

      if (nextChamber < IMPERIUM_BOSS_CHAMBER) {
        const nextQuestion = nextPayload.questions?.[nextChamber] ?? null;
        return {
          kind: 'chamber',
          runId,
          chamber: nextChamber,
          chamberCount: IMPERIUM_CHAMBER_COUNT,
          consequence,
          consequences: consequenceSummary(consequences),
          question: nextQuestion,
          bossesAway: IMPERIUM_BOSS_CHAMBER - nextChamber,
        };
      }

      const difficulty = getDifficulty(run.difficulty);
      if (!difficulty) throw fail('Diff run tidak valid.', 'BAD_DIFF');

      const battle = await resolveBossBattle(
        runId,
        userId,
        difficulty,
        nextPayload,
        random
      );
      await runs.finishRun(
        runId,
        battle.status === 'WIN' ? 'won' : 'lost',
        { ...nextPayload, result: battle.summary }
      );

      return {
        kind: 'battle',
        runId,
        chamber: IMPERIUM_BOSS_CHAMBER,
        chamberCount: IMPERIUM_CHAMBER_COUNT,
        consequence,
        consequences: consequenceSummary(consequences),
        ...battle,
      };
    },
  };
}

export const imperiumService = createImperiumService();