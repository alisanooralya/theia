import { sql } from '#storage/connection.js';
import {
  raidModel,
  walletModel,
  userModel,
  groupModel,
} from '#storage/models/index.js';
import { cardService } from '#features/rpg/card.js';
import {
  buildRaidSnapshot,
  simulateRaidBattle,
  RAID_MAX_SECONDS,
} from '#features/rpg/raid-battle.js';
import {
  getActivePeriod,
  getLastEndedPeriod,
  getUpcomingPeriod,
} from '#features/rpg/raid-period-config.js';
import { F } from '#helpers/index.js';
import { logger } from '#helpers/logger.js';
import SETTINGS from '#environment/settings.js';

const TZ = SETTINGS.timezone || 'Asia/Jakarta';

// State window harian per period id ('open' | 'closed') — in-memory,
// dipakai maintain() untuk mendeteksi transisi buka/tutup window
// (pengumuman sekali per transisi, bukan setiap tick).
const windowStates = new Map();

/**
 * Key hari kalender (YYYY-MM-DD) sesuai timezone bot.
 * Dipakai untuk reset Raid Entry harian berbasis tanggal,
 * bukan process restart.
 */
export function raidDayKey(now = Date.now(), timeZone = TZ) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(new Date(now));
}

class RaidService {
  /**
   * Data lengkap untuk status panel: period, progression boss,
   * entry harian, dan kontribusi player.
   */
  async getOverview(jid) {
    const activeConfig = getActivePeriod();
    const upcoming = activeConfig ? null : getUpcomingPeriod();

    if (!activeConfig) {
      return {
        phase: upcoming ? 'upcoming' : 'none',
        upcoming,
        remainingMs: upcoming ? upcoming.startAt - Date.now() : 0,
        bosses: [],
        activeBoss: null,
        entriesUsed: 0,
        entriesLeft: 0,
        myTotalDamage: 0,
        periodConfig: null,
        period: null,
      };
    }

    await raidModel.ensurePeriod(activeConfig);
    const [period, bossStates, entriesUsed, myTotalDamage] = await Promise.all([
      raidModel.getPeriod(activeConfig.id),
      raidModel.getBossStates(activeConfig.id),
      jid ? raidModel.getRaidEntries(jid, raidDayKey()) : 0,
      jid ? raidModel.getTotalContribution(activeConfig.id, jid) : 0,
    ]);

    const bosses = activeConfig.bosses.map((config, index) => ({
      config,
      state: bossStates.find((b) => b.boss_index === index) ?? null,
    }));
    const activeIndex = period?.current_boss ?? 0;
    const phase = period?.status === 'completed' ? 'completed' : 'active';

    return {
      phase,
      periodConfig: activeConfig,
      period,
      bosses,
      activeBoss: phase === 'active' ? (bosses[activeIndex] ?? null) : null,
      entriesUsed,
      entriesLeft: Math.max(0, activeConfig.entriesPerDay - entriesUsed),
      myTotalDamage,
      remainingMs: Math.max(0, activeConfig.endAt - Date.now()),
    };
  }

  /**
   * Jalankan satu Raid Entry (1 battle 120 detik).
   *
   * Semua state kritis — konsumsi entry harian, HP boss, kontribusi,
   * dan progression — diapply dalam SATU transaction:
   * - Entry tidak bisa melebihi kuota harian (konsumsi atomik).
   * - Boss di-lock (FOR UPDATE) supaya damage concurrent tidak hilang.
   * - Boss tidak bisa mati dua kali / progression tidak maju dua kali.
   * - Gagal di tengah jalan → rollback penuh: entry tetap utuh,
   *   kontribusi dan damage boss tidak tercatat dobel.
   *
   * Snapshot build player diambil SEBELUM transaction (saat Entry dimulai).
   */
  async attack(jid) {
    const periodConfig = getActivePeriod();
    if (!periodConfig) {
      const upcoming = getUpcomingPeriod();
      if (upcoming?.dailyWindow) {
        const w = upcoming.dailyWindow;
        throw new Error(
          `Raid sedang tutup. Dibuka lagi jam ${w.start} ${w.timeZone}.`
        );
      }
      throw new Error('Tidak ada Raid Period yang aktif.');
    }

    const snapshot = await buildRaidSnapshot(jid);
    const dayKey = raidDayKey();

    return sql.begin(async (t) => {
      const used = await raidModel.consumeRaidEntry(
        jid,
        dayKey,
        periodConfig.entriesPerDay,
        t
      );
      if (used === null) {
        throw new Error(
          `Entry Raid hari ini habis (maksimal ${periodConfig.entriesPerDay}/hari).`
        );
      }

      await raidModel.ensurePeriod(periodConfig, t);
      const period = await raidModel.lockPeriod(periodConfig.id, t);

      const bossIndex = period.current_boss;
      if (bossIndex >= periodConfig.bosses.length) {
        throw new Error(
          'Semua boss sudah dikalahkan. Tunggu Raid Period berikutnya.'
        );
      }
      if (period.status !== 'active' || Date.now() >= periodConfig.endAt) {
        throw new Error('Raid Period sudah selesai.');
      }

      const bossConfig = periodConfig.bosses[bossIndex];
      const bossState = await raidModel.getBossState(
        periodConfig.id,
        bossIndex,
        t
      );
      if (!bossState) {
        throw new Error('State boss tidak ditemukan. Hubungi owner.');
      }

      const bossFighter = {
        hp: bossState.remaining_hp,
        max_hp: bossConfig.maxHp,
        atk: bossConfig.atk,
        def: bossConfig.def,
        critRate: bossConfig.critRate ?? 0.05,
      };

      const battle = simulateRaidBattle(snapshot, bossFighter, {
        maxSeconds: RAID_MAX_SECONDS,
        gimmicks: bossConfig.gimmicks,
      });

      const bossHpBefore = bossState.remaining_hp;
      const bossHpAfter = Math.max(0, bossHpBefore - battle.totalDamage);

      await raidModel.setBossHp(periodConfig.id, bossIndex, bossHpAfter, t);
      await raidModel.addContribution(
        periodConfig.id,
        bossIndex,
        jid,
        battle.totalDamage,
        t
      );

      let defeated = false;
      let nextBoss = null;
      let periodCompleted = false;
      if (bossHpAfter <= 0) {
        const marked = await raidModel.markBossDefeated(
          periodConfig.id,
          bossIndex,
          t
        );
        if (marked) {
          defeated = true;
          nextBoss = periodConfig.bosses[bossIndex + 1] ?? null;
          const advanced = await raidModel.advanceProgression(
            periodConfig.id,
            bossIndex,
            t
          );
          periodCompleted = advanced?.status === 'completed';
        }
      }

      logger.info(
        {
          periodId: periodConfig.id,
          bossIndex,
          jid,
          damage: battle.totalDamage,
          rounds: battle.rounds,
          defeated,
        },
        '[Raid] entry selesai'
      );

      return {
        periodId: periodConfig.id,
        boss: bossConfig,
        bossIndex,
        bossHpBefore,
        bossHpAfter,
        battle,
        defeated,
        nextBoss,
        periodCompleted,
        entriesUsed: used,
        entriesLeft: Math.max(0, periodConfig.entriesPerDay - used),
        entriesMax: periodConfig.entriesPerDay,
      };
    });
  }

  /**
   * Statistik pribadi player di period aktif: damage per boss,
   * total damage, entry harian, dan status klaim reward.
   */
  async getMyStats(jid) {
    const periodConfig = getActivePeriod() || getLastEndedPeriod();
    if (!periodConfig) throw new Error('Tidak ada Raid Period.');

    await raidModel.ensurePeriod(periodConfig);
    const [contributions, bossStates, entriesUsed] = await Promise.all([
      raidModel.getContributionsByJid(periodConfig.id, jid),
      raidModel.getBossStates(periodConfig.id),
      raidModel.getRaidEntries(jid, raidDayKey()),
    ]);

    const bosses = contributions.map((contribution) => {
      const config = periodConfig.bosses[contribution.boss_index];
      const state = bossStates.find(
        (b) => b.boss_index === contribution.boss_index
      );
      const defeated = (state?.defeated_at ?? 0) > 0;
      return {
        boss: config,
        damage: contribution.damage,
        hits: contribution.hits,
        defeated,
        claimed: contribution.reward_claimed > 0,
        claimable: defeated && contribution.reward_claimed === 0,
      };
    });

    return {
      periodConfig,
      bosses,
      totalDamage: bosses.reduce((sum, b) => sum + b.damage, 0),
      entriesUsed,
      entriesLeft: Math.max(0, (periodConfig.entriesPerDay ?? 3) - entriesUsed),
    };
  }

  async getLeaderboard(limit = 10) {
    const periodConfig = getActivePeriod();
    if (!periodConfig) return [];
    return raidModel.getLeaderboard(periodConfig.id, limit);
  }

  /**
   * Klaim reward untuk semua boss yang sudah kalah dan belum diklaim.
   * Reward diskalakan berdasarkan share damage player terhadap maxHp boss.
   * Klaim bersifat idempotent + concurrency-safe: flag klaim di-set
   * secara atomik (UPDATE ... WHERE reward_claimed = 0).
   */
  async claim(jid) {
    const periodConfig = getActivePeriod() || getLastEndedPeriod();
    if (!periodConfig) throw new Error('Tidak ada Raid Period untuk diklaim.');

    return sql.begin(async (t) => {
      const contributions = await raidModel.getContributionsByJid(
        periodConfig.id,
        jid,
        t
      );
      if (contributions.length === 0) {
        throw new Error('Kamu belum berkontribusi di Raid Period ini.');
      }
      const bossStates = await raidModel.getBossStates(periodConfig.id, t);

      const claimed = [];
      let pending = 0;
      for (const contribution of contributions) {
        const state = bossStates.find(
          (b) => b.boss_index === contribution.boss_index
        );
        const defeated = (state?.defeated_at ?? 0) > 0;
        if (!defeated) {
          pending += 1;
          continue;
        }
        if (contribution.reward_claimed > 0) continue;

        const won = await raidModel.claimBossReward(
          periodConfig.id,
          contribution.boss_index,
          jid,
          t
        );
        if (!won) continue;

        const bossConfig = periodConfig.bosses[contribution.boss_index];
        const share = Math.max(
          0,
          Math.min(1, contribution.damage / Math.max(1, bossConfig.maxHp))
        );
        const cash = await cardService.coinRewardTotal(
          jid,
          Math.floor((bossConfig.rewards?.cash ?? 0) * share),
          t
        );
        const exp = Math.floor((bossConfig.rewards?.exp ?? 0) * share);
        const raidCoin = Math.max(
          1,
          Math.floor((bossConfig.rewards?.raidCoin ?? 0) * share)
        );

        await walletModel.reward(jid, cash, `raid ${periodConfig.id}`, t);
        await userModel.addExp(jid, exp, t);
        await raidModel.addRaidCoin(jid, raidCoin, t);

        claimed.push({
          boss: bossConfig,
          damage: contribution.damage,
          share,
          cash,
          exp,
          raidCoin,
        });
      }

      return { claimed, pending };
    });
  }

  /**
   * Maintenance berkala (dipanggil extension): buat row period baru saat
   * period config aktif pertama kali, finalisasi period yang massanya
   * sudah lewat, dan deteksi buka/tutup window harian (dailyWindow).
   * Return event untuk di-announce extension.
   *
   * Period dailyWindow TIDAK pernah difinalisasi lewat sini — window
   * tutup hanya berarti attack ditolak sementara; boss progression dan
   * kontribusi berlanjut saat window dibuka lagi.
   */
  async maintain() {
    const events = {
      activated: null,
      completed: null,
      windowOpened: null,
      windowClosed: null,
    };

    const activeConfig = getActivePeriod();
    if (activeConfig) {
      const row = await raidModel.getPeriod(activeConfig.id);
      if (!row) {
        await raidModel.ensurePeriod(activeConfig);
        events.activated = activeConfig;
        if (activeConfig.recurring) windowStates.set(activeConfig.id, 'open');
        return events;
      }
      if (
        activeConfig.recurring &&
        windowStates.get(activeConfig.id) !== 'open'
      ) {
        windowStates.set(activeConfig.id, 'open');
        events.windowOpened = activeConfig;
      }
      return events;
    }

    const endedConfig = getLastEndedPeriod();
    if (endedConfig?.recurring) {
      if (windowStates.get(endedConfig.id) !== 'closed') {
        windowStates.set(endedConfig.id, 'closed');
        events.windowClosed = endedConfig;
      }
      return events;
    }

    if (endedConfig) {
      const row = await raidModel.getPeriod(endedConfig.id);
      if (row && row.status === 'active') {
        await raidModel.finalizePeriod(endedConfig.id);
        events.completed = endedConfig;
      }
    }

    return events;
  }

  async getRaidCoin(jid) {
    return raidModel.getRaidCoin(jid);
  }

  /**
   * Broadcast teks ke semua group yang mengaktifkan raid.
   * Dipakai untuk pengumuman boss kalah / event period.
   */
  async broadcast(sock, text, { exclude = [], mentions = [] } = {}) {
    if (!sock) return [];
    const targets = (await groupModel.getRaidGroups()).filter(
      (jid) => !exclude.includes(jid)
    );
    for (const target of targets) {
      sock.sendMessage(target, { text, mentions }, {}).catch(() => {});
    }
    return targets;
  }

  /**
   * Teks pengumuman saat boss kalah: boss berikutnya / period selesai
   * + top kontributor boss tersebut.
   */
  async buildBossDefeatText(result) {
    const top = await raidModel.getBossContributions(
      result.periodId,
      result.bossIndex,
      5
    );
    const totalDamage = top.reduce((sum, c) => sum + c.damage, 0);
    const lines = [
      `⚔️ *BOSS RAID KALAH!*`,
      '',
      `${result.boss.emoji} *${result.boss.name}* telah dikalahkan!`,
      `Total damage: *${F.formatNumber(totalDamage)}*`,
      '',
      '*Top Kontribusi:*',
      ...top.map(
        (c, i) =>
          `${i + 1}. @${c.jid.split('@')[0]} — ${F.formatNumber(c.damage)}`
      ),
    ];

    if (result.periodCompleted) {
      lines.push('', '🏆 *Semua boss tumbang — Raid Period selesai!*');
    } else if (result.nextBoss) {
      lines.push(
        '',
        `➡️ Boss berikutnya: ${result.nextBoss.emoji} *${result.nextBoss.name}*`
      );
    }

    return {
      text: lines.join('\n'),
      mentions: top.map((c) => c.jid),
    };
  }
}

export const raidService = new RaidService();
