import { sql } from '#storage/connection.js';
import { userModel } from '#storage/models/user.js';
import { rpgPlayerModel } from '../models/rpg-player.model.js';
import { rpgCoinModel } from '../models/rpg-coin.model.js';
import { rpgInventoryModel } from '../models/rpg-inventory.model.js';
import { imperiumModel } from '../models/imperium.model.js';
import { finalStatService } from './final-stat-service.js';
import { createCardService } from './card-service.js';
import {
  autoSkillAction,
  battleSkillsFromEffects,
  createBattle,
  simulateBattle,
} from './battle-engine.js';
import { grantPlayerExp } from './player-progress.js';
import {
  IMPERIUM_DIFF_COUNT,
  IMPERIUM_FATES,
  IMPERIUM_MIN_LEVEL,
  getImperiumBoss,
  getImperiumReward,
  getImperiumFate,
  getWeeklyCardDef,
} from '../config/imperium-config.js';
import { getMainCard } from '../config/card-config.js';

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// ISO week identifier (UTC, restart-safe): "2026-W38".
export function weekIdFor(nowMs = Date.now()) {
  const d = new Date(nowMs);
  const dayIdx = (d.getUTCDay() + 6) % 7; // Mon=0..Sun=6
  const monday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dayIdx);
  const thursday = monday + 3 * 24 * 60 * 60 * 1000;
  const year = new Date(thursday).getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Idx = (jan4.getUTCDay() + 6) % 7;
  const week1Monday = Date.UTC(year, 0, 4 - jan4Idx);
  const week = 1 + Math.round((monday - week1Monday) / WEEK_MS);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function clearedBit(diff) {
  return 1 << (diff - 1);
}

export function isDiffCleared(clearedMask, diff) {
  return (Number(clearedMask) & clearedBit(diff)) !== 0;
}

export function isDiffUnlocked(diff, clearedMask) {
  if (diff >= 1 && diff <= 3) return true;
  if (diff === 4) {
    return (
      isDiffCleared(clearedMask, 1) &&
      isDiffCleared(clearedMask, 2) &&
      isDiffCleared(clearedMask, 3)
    );
  }
  if (diff === 5) return isDiffCleared(clearedMask, 4);
  return false;
}

// Random 3 pilihan berbeda dari pool. Blind: caller hanya boleh
// menampilkan slot (A/B/C) sebelum pick — tanpa nama/angka efek.
export function rollFateChoices(pool = IMPERIUM_FATES, random = Math.random) {
  const list = [...pool];
  if (list.length < 3) throw new RangeError('imperium fate pool needs >= 3 entries');
  for (let i = list.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return ['A', 'B', 'C'].map((slot, i) => ({ slot, fateId: list[i].id }));
}

export function parseSlot(raw) {
  const s = String(raw ?? '').trim().toUpperCase();
  return s === 'A' || s === 'B' || s === 'C' ? s : null;
}

function fail(message, code) {
  const err = new RangeError(message);
  err.code = code;
  return err;
}

// Terapkan fate ke battle via mekanisme battle-engine existing:
// - blessing player -> extra passive di playerSkills.passives
// - curse boss -> pengali stat boss / guard passive / penguat skill boss
export function applyFateToBattle(fate, playerSkills, boss) {
  const nextSkills = {
    active: playerSkills?.active ? { ...playerSkills.active } : null,
    passives: [...(playerSkills?.passives ?? [])],
  };
  if (fate?.player) {
    nextSkills.passives.push({
      name: fate.name,
      source: 'imperium-fate',
      trigger: fate.player.trigger,
      modifiers: { ...(fate.player.modifiers ?? {}) },
      effects: [],
    });
  }
  const mult = fate?.boss ?? {};
  const stats = {
    maxHp: Math.max(1, Math.round(boss.stats.maxHp * (mult.hpMult ?? 1))),
    atk: Math.max(0, Math.round(boss.stats.atk * (mult.atkMult ?? 1))),
    def: Math.max(0, Math.round(boss.stats.def * (mult.defMult ?? 1))),
    critRate: boss.stats.critRate,
    critDmg: boss.stats.critDmg,
  };
  const enemy = { id: boss.id, name: boss.name, stats, behavior: boss.behavior };
  let enemySkills = null;
  if (boss.skills) {
    enemySkills = {
      active: boss.skills.active ? { ...boss.skills.active } : null,
      passives: [...(boss.skills.passives ?? [])],
    };
    if (enemySkills.active && mult.skillMult) {
      enemySkills.active = {
        ...enemySkills.active,
        multiplier: enemySkills.active.multiplier * mult.skillMult,
      };
    }
  }
  if (mult.guardMult) {
    enemySkills = enemySkills ?? { active: null, passives: [] };
    enemySkills = {
      active: enemySkills.active,
      passives: [
        ...enemySkills.passives,
        {
          name: fate.name,
          source: 'imperium-affix',
          trigger: 'defend',
          modifiers: { guardMult: mult.guardMult },
          effects: [],
        },
      ],
    };
  }
  return { playerSkills: nextSkills, enemy, enemySkills };
}

export function createImperiumService({
  users = userModel,
  players = rpgPlayerModel,
  coins = rpgCoinModel,
  inventory = rpgInventoryModel,
  progress = imperiumModel,
  finals = finalStatService,
  cards = createCardService(),
  db = sql,
  config = {},
} = {}) {
  const minLevel = config.minLevel ?? IMPERIUM_MIN_LEVEL;
  const diffCount = config.diffCount ?? IMPERIUM_DIFF_COUNT;
  const fatePool = config.fates ?? IMPERIUM_FATES;
  const bossFor = config.bosses
    ? (diff) => config.bosses[diff] ?? null
    : (diff) => getImperiumBoss(diff);
  const rewardFor = config.rewards
    ? (diff) => config.rewards[diff] ?? null
    : (diff) => getImperiumReward(diff);
  const fateFor = (fateId) =>
    fatePool.find((f) => f.id === fateId) ??
    (config.fates ? null : getImperiumFate(fateId));
  const weeklyCardDef = () => {
    if (config.weeklyCard) return config.weeklyCard;
    if (config.weeklyCardId) {
      const def = getMainCard(config.weeklyCardId);
      if (!def) throw fail(`unknown imperium weekly card: ${config.weeklyCardId}`, 'BAD_CONFIG');
      return def;
    }
    return getWeeklyCardDef();
  };

  function assertDiff(diff) {
    if (!Number.isInteger(diff) || diff < 1 || diff > diffCount) {
      throw fail(`Pilih Diff 1–${diffCount}. Contoh: .imperium 1`, 'INVALID_DIFF');
    }
  }

  async function ensureAll(userId, weekId, client) {
    await users.ensure(userId, {}, client);
    await players.ensure(userId, client);
    await coins.ensure(userId, client);
    await progress.ensureProgress(userId, weekId, client);
  }

  function clearedList(clearedMask) {
    const out = [];
    for (let d = 1; d <= diffCount; d += 1) {
      if (isDiffCleared(clearedMask, d)) out.push(d);
    }
    return out;
  }

  return {
    weekIdFor,
    isDiffUnlocked,
    isDiffCleared,

    async status(userId, { nowMs = Date.now() } = {}) {
      const weekId = weekIdFor(nowMs);
      await ensureAll(userId, weekId, db);
      const [player, prog] = await Promise.all([
        players.get(userId, db),
        progress.getProgress(userId, weekId, db),
      ]);
      const level = Number(player?.level ?? 1);
      const clearedMask = Number(prog?.cleared ?? 0);
      const weekly = weeklyCardDef();
      return {
        weekId,
        level,
        minLevel,
        canEnter: level >= minLevel,
        weeklyCard: { id: weekly.id, name: weekly.name, role: weekly.role },
        diffs: Array.from({ length: diffCount }, (_, i) => {
          const diff = i + 1;
          const boss = bossFor(diff);
          return {
            diff,
            bossName: boss?.name ?? `Boss ${diff}`,
            cleared: isDiffCleared(clearedMask, diff),
            unlocked: isDiffUnlocked(diff, clearedMask),
            reward: rewardFor(diff),
          };
        }),
      };
    },

    // Langkah 1: pilih Diff -> generate 3 pilihan blind (A/B/C).
    async start(userId, diff, { nowMs = Date.now(), random = Math.random } = {}) {
      assertDiff(diff);
      const weekId = weekIdFor(nowMs);
      await ensureAll(userId, weekId, db);
      const [player, prog, final] = await Promise.all([
        players.get(userId, db),
        progress.getProgress(userId, weekId, db),
        finals.getFinalStats(userId),
      ]);
      if (Number(player?.level ?? 1) < minLevel) {
        throw fail(
          `Imperium butuh RPG Level ${minLevel} (level kamu ${player?.level ?? 1}).`,
          'LEVEL_GATE'
        );
      }
      if (final.currentHp <= 0) {
        throw fail('HP kamu 0! Heal dulu sebelum Imperium.', 'HP0');
      }
      const clearedMask = Number(prog?.cleared ?? 0);
      if (isDiffCleared(clearedMask, diff)) {
        throw fail(`Diff ${diff} sudah clear minggu ini. Reward hanya sekali.`, 'ALREADY_CLEARED');
      }
      if (!isDiffUnlocked(diff, clearedMask)) {
        throw fail(
          diff === 5
            ? 'Diff 5 terkunci. Selesaikan Diff 4 dulu minggu ini.'
            : 'Diff 4 terkunci. Selesaikan Diff 1, 2, dan 3 dulu minggu ini.',
          'LOCKED'
        );
      }
      const boss = bossFor(diff);
      if (!boss) throw fail(`Boss Diff ${diff} belum dikonfigurasi.`, 'NO_BOSS');
      const choices = rollFateChoices(fatePool, random);
      await progress.savePending(userId, weekId, diff, choices, db);
      return {
        weekId,
        diff,
        bossName: boss.name,
        slots: choices.map((c) => c.slot),
      };
    },

    // Langkah 2: pick A/B/C -> reveal fate -> battle via battle-engine.
    async pick(userId, slotRaw, { nowMs = Date.now(), random = Math.random } = {}) {
      const slot = parseSlot(slotRaw);
      if (!slot) throw fail('Pilih: .imperium pick A / B / C', 'INVALID_SLOT');
      const weekId = weekIdFor(nowMs);
      await ensureAll(userId, weekId, db);

      const final = await finals.getFinalStats(userId);
      if (final.currentHp <= 0) {
        throw fail('HP kamu 0! Heal dulu sebelum Imperium.', 'HP0');
      }
      const activeEffects = await cards.getActiveEffects(userId);
      const baseSkills = battleSkillsFromEffects(activeEffects);

      return db.begin(async (t) => {
        await progress.ensureProgress(userId, weekId, t);
        await progress.lockProgress(userId, weekId, t);
        const pending = await progress.consumePending(userId, t);
        if (!pending) throw fail('Tidak ada pilihan aktif. Mulai dulu: .imperium <1-5>', 'NO_PENDING');

        let choices;
        try {
          choices = JSON.parse(pending.choices);
        } catch {
          choices = [];
        }
        if (!Array.isArray(choices)) choices = [];
        const chosen = choices.find((c) => c.slot === slot);
        if (pending.week_id !== weekId || Number(pending.diff) < 1 || !chosen) {
          throw fail('Pilihan kedaluwarsa. Mulai lagi: .imperium <1-5>', 'STALE');
        }
        const diff = Number(pending.diff);
        const fate = fateFor(chosen.fateId);
        if (!fate) throw fail('Pilihan kedaluwarsa. Mulai lagi: .imperium <1-5>', 'STALE');

        const prog = await progress.getProgress(userId, weekId, t);
        const clearedMask = Number(prog?.cleared ?? 0);
        if (isDiffCleared(clearedMask, diff)) {
          throw fail(`Diff ${diff} sudah clear minggu ini. Reward hanya sekali.`, 'ALREADY_CLEARED');
        }
        const boss = bossFor(diff);
        const reward = rewardFor(diff);
        if (!boss || !reward) throw fail(`Diff ${diff} belum dikonfigurasi.`, 'NO_BOSS');

        const { playerSkills, enemy, enemySkills } = applyFateToBattle(fate, baseSkills, boss);
        const state = createBattle({
          playerStats: {
            maxHp: final.maxHp,
            currentHp: Math.max(0, final.currentHp),
            atk: final.atk,
            def: final.def,
            critRate: final.critRate,
            critDmg: final.critDmg,
          },
          enemy,
          playerSkills,
          enemySkills,
          battleId: `imperium:${userId}:${weekId}:d${diff}:${nowMs}`,
        });
        const end = simulateBattle(state, autoSkillAction, random);
        const won = end.status === 'WIN';

        await players.setCurrentHp(userId, end.player.hp, t);

        const fateView = {
          kind: fate.kind,
          name: fate.name,
          icon: fate.icon,
          reveal: fate.reveal,
        };

        if (!won) {
          return {
            won: false,
            status: end.status,
            weekId,
            diff,
            bossName: boss.name,
            fate: fateView,
            rounds: end.round,
            playerHp: end.player.hp,
            enemyHp: end.enemy.hp,
            rewards: null,
          };
        }

        const saved = await progress.markCleared(userId, weekId, clearedBit(diff), t);
        if (!saved) {
          throw fail(`Diff ${diff} sudah clear minggu ini. Reward hanya sekali.`, 'ALREADY_CLEARED');
        }
        await coins.addCoin(userId, reward.coin, t);
        const grown = await grantPlayerExp(players, userId, reward.exp, t);
        await inventory.add(userId, 'cerelia', reward.cerelia, t);
        return {
          won: true,
          status: 'WIN',
          weekId,
          diff,
          bossName: boss.name,
          fate: fateView,
          rounds: end.round,
          playerHp: end.player.hp,
          enemyHp: end.enemy.hp,
          rewards: { ...reward },
          leveledUp: grown.leveledUp,
          cleared: clearedList(Number(saved.cleared ?? 0)),
        };
      });
    },
  };
}

export const imperiumService = createImperiumService();
