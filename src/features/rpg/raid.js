import { sql } from '#storage/connection.js';
import {
  raidModel,
  statsModel,
  artifactModel,
  walletModel,
  userModel,
  groupModel,
} from '#storage/models/index.js';
import { logger } from '#helpers/logger.js';
import { F } from '#helpers/index.js';
import SETTINGS from '#environment/settings.js';

const RAID_BOSS_NAME = 'Raid Boss';
const RAID_BOSS_HP = 500_000;
const RAID_USER_HP = 2400;
const RAID_DURATION = 24 * 60 * 60 * 1000;
const BREAKTIME_DURATION = 60 * 60 * 1000;
const HP_RECOVERY_STOP = 80;
const HP_RECOVERY_BREAKTIME = 200;
const HP_LOW_RATIO = 0.15;
const HP_LOW_THRESHOLD = Math.floor(RAID_USER_HP * HP_LOW_RATIO);
const CRIT_MULT = 1.5;
const ATTACK_INTERVAL = 30_000;

const TZ = SETTINGS.timezone || 'Asia/Jakarta';
const TZ_OFFSET_MS = 7 * 60 * 60 * 1000;
const RAID_START_WEEKDAY = 0;
const RAID_START_HOUR = 1;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

const activeAttacks = new Map();

function toZoned(ms) {
  return ms + TZ_OFFSET_MS;
}
function fromZoned(zms) {
  return zms - TZ_OFFSET_MS;
}

function getRaidStartForWeek(ms) {
  const z = toZoned(ms);
  const d = new Date(z);
  const day = d.getUTCDay();
  let candidate = Date.UTC(
    d.getUTCFullYear(),
    d.getUTCMonth(),
    d.getUTCDate() - day,
    RAID_START_HOUR,
    0,
    0
  );
  if (candidate > z) candidate -= WEEK_MS;
  return fromZoned(candidate);
}

function getNextRaidStart(ms) {
  const start = getRaidStartForWeek(ms);
  return start + WEEK_MS;
}

function isWithinRaidWindow(ms) {
  const start = getRaidStartForWeek(ms);
  return ms >= start && ms < start + RAID_DURATION;
}

function formatSchedule(ms) {
  return new Date(ms).toLocaleString('id-ID', {
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: TZ,
  });
}

function calcDamage(atk, critRate) {
  const isCrit = Math.random() * 100 < critRate;
  const baseDmg = Math.max(1, atk);
  return {
    dmg: Math.floor(isCrit ? baseDmg * CRIT_MULT : baseDmg),
    crit: isCrit,
  };
}

async function getUserRaidStats(jid) {
  const base = await statsModel.find(jid);
  const baseAtk = base?.atk ?? 30;
  const baseCritRate = base?.crit_rate ?? 5;

  let artifactAtk = 0;
  let artifactCritRate = 0;
  const inventory = await artifactModel.getInventory(jid);
  if (inventory) {
    const slots = ['flower', 'feather', 'sands', 'goblet', 'circlet'];
    for (const slot of slots) {
      const artifactId = inventory[`${slot}_id`];
      if (!artifactId) continue;
      const art = await artifactModel.findById(artifactId);
      if (!art) continue;
      switch (art.main_stat) {
        case 'atk': artifactAtk += art.main_value; break;
        case 'atk_percent': artifactAtk += Math.floor(baseAtk * art.main_value / 100); break;
        case 'crit_rate': artifactCritRate += art.main_value / 10; break;
      }
    }
  }

  return {
    atk: baseAtk + artifactAtk,
    critRate: baseCritRate + artifactCritRate,
  };
}

class RaidService {
  async getRaidInfo() {
    const active = await raidModel.getActive();
    if (active && active.status === 'active') {
      if (Date.now() >= active.end_at) {
        await this.endRaid(null, null);
        return null;
      }
      const now = Date.now();
      const remaining = Math.max(0, active.end_at - now);
      const participants = await raidModel.getParticipants(active.id);
      return {
        raid: active,
        participants,
        remaining,
        isLive: true,
      };
    }
    if (isWithinRaidWindow(Date.now())) {
      const raid = await this.createScheduledRaid();
      const participants = await raidModel.getParticipants(raid.id);
      return {
        raid,
        participants,
        remaining: Math.max(0, raid.end_at - Date.now()),
        isLive: true,
      };
    }
    return null;
  }

  async createScheduledRaid() {
    const now = Date.now();
    const startAt = getRaidStartForWeek(now);
    const endAt = startAt + RAID_DURATION;
    const raid = await raidModel.create(RAID_BOSS_NAME, RAID_BOSS_HP, startAt, endAt);
    logger.info({ startAt, endAt }, '[Raid] scheduled raid created');
    return raid;
  }

  async createRaid() {
    const existing = await raidModel.getActive();
    if (existing && existing.status === 'active' && Date.now() < existing.end_at) {
      return existing;
    }
    return this.createScheduledRaid();
  }

  async startRaid() {
    const existing = await raidModel.getActive();
    if (existing && existing.status === 'active' && Date.now() < existing.end_at) {
      return existing;
    }
    return this.createScheduledRaid();
  }

  async ensureScheduledRaid() {
    const existing = await raidModel.getActive();
    if (existing && existing.status === 'active') {
      if (Date.now() >= existing.end_at) {
        await this.endRaid(null, null);
        return { created: false, raid: null };
      }
      return { created: false, raid: existing };
    }
    if (isWithinRaidWindow(Date.now())) {
      const raid = await this.createScheduledRaid();
      return { created: true, raid };
    }
    return { created: false, raid: null };
  }

  getScheduleInfo() {
    const now = Date.now();
    const within = isWithinRaidWindow(now);
    const currentStart = getRaidStartForWeek(now);
    return {
      isLive: within,
      currentStart,
      currentEnd: currentStart + RAID_DURATION,
      nextStart: getNextRaidStart(now),
      duration: RAID_DURATION,
    };
  }

  async join(jid) {
    let raid = await raidModel.getActive();
    if (!raid || raid.status !== 'active' || Date.now() >= raid.end_at) {
      raid = await this.createScheduledRaid();
    }

    let participant = await raidModel.getParticipant(raid.id, jid);
    if (!participant) {
      participant = await raidModel.addParticipant(raid.id, jid);
    }

    return { raid, participant };
  }

  async startAttackLoop(jid, sock, jidChat) {
    if (activeAttacks.has(jid)) {
      throw new Error('Kamu sudah sedang menyerang!');
    }

    const raid = await raidModel.getActive();
    if (!raid || raid.status !== 'active') {
      throw new Error('Tidak ada raid aktif.');
    }

    const participant = await raidModel.getParticipant(raid.id, jid);
    if (!participant) {
      throw new Error('Kamu belum join raid. Ketik `.raid join` terlebih dahulu.');
    }

    if (participant.status === 'stopped') {
      throw new Error('Kamu sedang dalam mode Stop. Ketik `.raid attack` untuk melanjutkan.');
    }

    const now = Date.now();
    if (participant.breaktime_until > now) {
      const waitSec = Math.ceil((participant.breaktime_until - now) / 1000);
      throw new Error(`Kamu sedang dalam Breaktime. Tunggu ${waitSec} detik.`);
    }

    if (raid.boss_hp <= 0) {
      throw new Error('Raid Boss sudah mati!');
    }

    const userStats = await getUserRaidStats(jid);

    const interval = setInterval(async () => {
      try {
        const currentRaid = await raidModel.getActive();
        if (!currentRaid || currentRaid.status !== 'active') {
          this.stopAttackLoop(jid);
          return;
        }

        const p = await raidModel.getParticipant(currentRaid.id, jid);
        if (!p || p.status === 'stopped' || p.status === 'breaktime') {
          this.stopAttackLoop(jid);
          return;
        }

        if (currentRaid.boss_hp <= 0) {
          this.stopAttackLoop(jid);
          return;
        }

        const userDmg = calcDamage(userStats.atk, userStats.critRate);
        const bossDmg = calcDamage(120, 5);
        const actualDamage = Math.min(userDmg.dmg, currentRaid.boss_hp);
        const newBossHp = Math.max(0, currentRaid.boss_hp - actualDamage);
        const newHp = Math.max(0, p.hp - bossDmg.dmg);

        let newStatus = p.status;
        let breaktimeUntil = 0;

        if (newHp <= 0) {
          newStatus = 'breaktime';
          breaktimeUntil = Date.now() + BREAKTIME_DURATION;
        }

        await raidModel.updateBoss(currentRaid.id, newBossHp, newBossHp <= 0 ? 'cleared' : currentRaid.status);
        await raidModel.updateParticipant(currentRaid.id, jid, {
          hp: newHp,
          damage: p.damage + actualDamage,
          status: newStatus,
          breaktimeUntil,
        });

        if (newHp <= 0) {
          this.stopAttackLoop(jid);
          if (sock && jidChat) {
            const mentionJid = [jid];
            await sock.sendMessage(jidChat, {
              text: `💔 @${jid.split('@')[0]} HP habis! Masuk Breaktime 1 jam...`,
              mentions: mentionJid,
            }).catch(() => {});
          }
        } else if (newHp > 0 && newHp <= HP_LOW_THRESHOLD && p.hp > HP_LOW_THRESHOLD) {
          if (sock && jidChat) {
            const mentionJid = [jid];
            await sock.sendMessage(jidChat, {
              text: [
                `⚠️ @${jid.split('@')[0]} HP kamu tinggal *${newHp}/${RAID_USER_HP}* (≈15%)!`,
                '',
                'Saran: ketik `.raid stop` untuk berhenti menyerang dan pulihkan HP,',
                'tunggu beberapa menit, lalu lanjutkan lagi dengan `.raid attack`.',
              ].join('\n'),
              mentions: mentionJid,
            }).catch(() => {});
          }
        }

        if (newBossHp <= 0) {
          this.stopAttackLoop(jid);
          if (sock && jidChat) {
            const participants = await raidModel.getParticipants(currentRaid.id);
            const mentionJid = participants.map(p => p.jid);
            const contributionList = participants
              .map((p, i) => `${i + 1}. @${p.jid.split('@')[0]} — *${F.formatNumber(p.damage)}* damage`)
              .join('\n');
            const totalDamage = participants.reduce((sum, p) => sum + p.damage, 0);

            const text = [
              '🎉 *RAID BOSS MATI!*',
              '',
              `Total Damage: *${F.formatNumber(totalDamage)}*`,
              '',
              '*Kontribusi:*',
              contributionList,
              '',
              'Ketik `.raid claim` untuk klaim reward!',
            ].join('\n');

            await sock.sendMessage(jidChat, {
              text,
              mentions: mentionJid,
            }).catch(() => {});
            await this.broadcast(sock, text, { exclude: [jidChat] });
          }
        }
      } catch (err) {
        logger.warn({ err: err.message }, '[RaidAttackLoop] error');
        this.stopAttackLoop(jid);
      }
    }, ATTACK_INTERVAL);

    activeAttacks.set(jid, interval);
    return true;
  }

  stopAttackLoop(jid) {
    const interval = activeAttacks.get(jid);
    if (interval) {
      clearInterval(interval);
      activeAttacks.delete(jid);
    }
  }

  isAttacking(jid) {
    return activeAttacks.has(jid);
  }

  async stop(jid) {
    const raid = await raidModel.getActive();
    if (!raid || raid.status !== 'active') {
      throw new Error('Tidak ada raid aktif.');
    }

    const participant = await raidModel.getParticipant(raid.id, jid);
    if (!participant) {
      throw new Error('Kamu belum join raid.');
    }

    this.stopAttackLoop(jid);

    await raidModel.updateParticipant(raid.id, jid, {
      hp: participant.hp,
      damage: participant.damage,
      status: 'stopped',
      breaktimeUntil: 0,
    });

    return true;
  }

  async resume(jid) {
    const raid = await raidModel.getActive();
    if (!raid || raid.status !== 'active') {
      throw new Error('Tidak ada raid aktif.');
    }

    const participant = await raidModel.getParticipant(raid.id, jid);
    if (!participant) {
      throw new Error('Kamu belum join raid.');
    }

    await raidModel.updateParticipant(raid.id, jid, {
      hp: participant.hp,
      damage: participant.damage,
      status: 'active',
      breaktimeUntil: 0,
    });

    return true;
  }

  async recoverHp(jid) {
    const raid = await raidModel.getActive();
    if (!raid || raid.status !== 'active') return null;

    const participant = await raidModel.getParticipant(raid.id, jid);
    if (!participant) return null;

    const now = Date.now();

    if (participant.status === 'breaktime' && participant.breaktime_until <= now) {
      const newHp = Math.min(RAID_USER_HP, participant.hp + HP_RECOVERY_BREAKTIME);
      const fullyHealed = newHp >= RAID_USER_HP;
      await raidModel.updateParticipant(raid.id, jid, {
        hp: fullyHealed ? RAID_USER_HP : newHp,
        damage: participant.damage,
        status: fullyHealed ? 'active' : 'breaktime',
        breaktimeUntil: fullyHealed ? 0 : participant.breaktime_until,
      });
      return { hp: fullyHealed ? RAID_USER_HP : newHp, status: fullyHealed ? 'active' : 'breaktime' };
    }

    if (participant.status === 'stopped') {
      const newHp = Math.min(RAID_USER_HP, participant.hp + HP_RECOVERY_STOP);
      await raidModel.updateParticipant(raid.id, jid, {
        hp: newHp,
        damage: participant.damage,
        status: 'stopped',
        breaktimeUntil: 0,
      });
      return { hp: newHp, status: 'stopped' };
    }

    return null;
  }

  async claimReward(jid) {
    const raid = (await raidModel.getActive()) || (await raidModel.getEnded());
    if (!raid) throw new Error('Tidak ada raid.');

    const participant = await raidModel.getParticipant(raid.id, jid);
    if (!participant) throw new Error('Kamu tidak participate di raid ini.');
    if (participant.reward_claimed) throw new Error('Reward sudah diklaim.');
    if (participant.damage <= 0) throw new Error('Kamu tidak memberikan damage, tidak ada reward.');

    const totalDamage = (await raidModel.getParticipants(raid.id))
      .reduce((sum, p) => sum + p.damage, 0);
    const contributionRatio = participant.damage / Math.max(1, totalDamage);

    const baseCash = 4000;
    const baseExp = 60;
    const cashReward = Math.floor(baseCash * contributionRatio * 10);
    const expReward = Math.floor(baseExp * contributionRatio * 10);
    const raidCoinReward = Math.max(1, Math.floor(contributionRatio * 20));

    await sql.begin(async (t) => {
      await walletModel.addCash(jid, cashReward, t);
      await userModel.addExp(jid, expReward, t);
      await raidModel.addRaidCoin(jid, raidCoinReward, t);
      await raidModel.claimReward(raid.id, jid, t);
    });

    return {
      cash: cashReward,
      exp: expReward,
      raidCoin: raidCoinReward,
      contribution: participant.damage,
    };
  }

  async getRaidCoin(jid) {
    return raidModel.getRaidCoin(jid);
  }

  async broadcast(sock, text, { exclude = [] } = {}) {
    if (!sock) return [];
    const targets = (await groupModel.getRaidGroups()).filter(
      (jid) => !exclude.includes(jid)
    );
    for (const target of targets) {
      sock.sendMessage(target, { text }).catch(() => {});
    }
    return targets;
  }

  async endRaid(sock, chatId) {
    const raid = await raidModel.getActive();
    if (!raid) return null;

    for (const [jid] of activeAttacks) {
      this.stopAttackLoop(jid);
    }

    await raidModel.updateBoss(raid.id, raid.boss_hp, 'ended');

    if (sock) {
      const participants = await raidModel.getParticipants(raid.id);
      if (participants.length > 0) {
        const mentionJid = participants.map(p => p.jid);
        const contributionList = participants
          .map((p, i) => `${i + 1}. @${p.jid.split('@')[0]} — *${F.formatNumber(p.damage)}* damage`)
          .join('\n');
        const totalDamage = participants.reduce((sum, p) => sum + p.damage, 0);

        const text = [
          '🎉 *RAID BOSS MATI!*',
          '',
          `Total Damage: *${F.formatNumber(totalDamage)}*`,
          '',
          '*Kontribusi:*',
          contributionList,
          '',
          'Ketik `.raid claim` untuk klaim reward!',
        ].join('\n');

        const targets = await groupModel.getRaidGroups();
        const chats = targets.length > 0 ? targets : chatId ? [chatId] : [];
        for (const chat of chats) {
          await sock
            .sendMessage(chat, { text, mentions: mentionJid })
            .catch(() => {});
        }
      }
    }

    return raid;
  }
}

export const raidService = new RaidService();
