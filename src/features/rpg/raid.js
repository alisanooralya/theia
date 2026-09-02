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
const BREAKTIME_DURATION = 60 * 60 * 1000;
const HP_RECOVERY_STOP = 80;
const HP_RECOVERY_BREAKTIME = 200;
const HP_LOW_RATIO = 0.15;
const HP_LOW_THRESHOLD = Math.floor(RAID_USER_HP * HP_LOW_RATIO);
const CRIT_MULT = 1.5;
const ATTACK_INTERVAL = 30_000;

const TZ = SETTINGS.timezone || 'Asia/Jakarta';
const START_GRACE_MS = 5 * 60 * 1000;

const activeAttacks = new Map();

const tzParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});

function zonedParts(ms) {
  return Object.fromEntries(
    tzParts
      .formatToParts(new Date(ms))
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)])
  );
}

function zonedOffset(ms) {
  const p = zonedParts(ms);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - ms;
}

function zonedToMs(year, month, day, hour, minute) {
  const wall = Date.UTC(year, month - 1, day, hour, minute, 0);
  const guess = wall - zonedOffset(wall);
  return wall - zonedOffset(guess);
}

const tzDate = new Intl.DateTimeFormat('id-ID', {
  timeZone: TZ,
  weekday: 'long',
  day: '2-digit',
  month: 'short',
});

function pad2(value) {
  return String(value).padStart(2, '0');
}

function parseRaidTime(input) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(input ?? '').trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

export function formatRaidClock(ms) {
  const p = zonedParts(Number(ms));
  return `${pad2(p.hour)}:${pad2(p.minute)}`;
}

export function formatRaidSchedule(ms) {
  const timestamp = Number(ms);
  return `${tzDate.format(new Date(timestamp))} ${formatRaidClock(timestamp)}`;
}

function resolveRaidWindow(start, end, now = Date.now()) {
  const today = zonedParts(now);
  const at = (dayOffset, clock) =>
    zonedToMs(
      today.year,
      today.month,
      today.day + dayOffset,
      clock.hour,
      clock.minute
    );

  let dayOffset = 0;
  let startAt = at(0, start);
  if (startAt + START_GRACE_MS <= now) {
    dayOffset = 1;
    startAt = at(1, start);
  }

  let endAt = at(dayOffset, end);
  if (endAt <= startAt) endAt = at(dayOffset + 1, end);

  return { startAt, endAt };
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
        case 'atk':
          artifactAtk += art.main_value;
          break;
        case 'atk_percent':
          artifactAtk += Math.floor((baseAtk * art.main_value) / 100);
          break;
        case 'crit_rate':
          artifactCritRate += art.main_value / 10;
          break;
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
    if (!active) return null;
    if (Date.now() >= active.end_at) {
      await this.endRaid(null, null);
      return null;
    }
    const participants = await raidModel.getParticipants(active.id);
    return {
      raid: active,
      participants,
      remaining: Math.max(0, active.end_at - Date.now()),
      isLive: true,
    };
  }

  async scheduleRaid(startInput, endInput) {
    const start = parseRaidTime(startInput);
    const end = parseRaidTime(endInput);
    if (!start || !end) {
      throw new Error(
        'Format waktu salah. Gunakan `HH:MM`, contoh: `.raidstart 19:00 22:00`'
      );
    }
    if (start.hour === end.hour && start.minute === end.minute) {
      throw new Error('Jam selesai tidak boleh sama dengan jam mulai.');
    }

    const existing = await raidModel.getCurrent();
    if (existing) {
      if (existing.status === 'active') {
        throw new Error(
          `Masih ada raid yang *active* sampai ${formatRaidSchedule(existing.end_at)}. Tunggu raid selesai dulu.`
        );
      }
      throw new Error(
        `Sudah ada raid *scheduled* pada ${formatRaidSchedule(existing.start_at)} - ${formatRaidClock(existing.end_at)}. Gunakan \`.raidstart cancel\` untuk membatalkannya.`
      );
    }

    const { startAt, endAt } = resolveRaidWindow(start, end);
    const raid = await raidModel.create(
      RAID_BOSS_NAME,
      RAID_BOSS_HP,
      startAt,
      endAt,
      'scheduled'
    );
    logger.info(
      { raidId: raid.id, startAt, endAt },
      '[Raid] raid scheduled manually'
    );
    return raid;
  }

  async cancelScheduledRaid() {
    const scheduled = await raidModel.getScheduled();
    if (!scheduled) return null;
    await raidModel.updateStatus(scheduled.id, 'cancelled');
    logger.info({ raidId: scheduled.id }, '[Raid] scheduled raid cancelled');
    return scheduled;
  }

  async processSchedule() {
    const now = Date.now();
    const result = { activated: null, ended: null };

    const active = await raidModel.getActive();
    if (active && now >= active.end_at) {
      result.ended = active;
      return result;
    }
    if (active) return result;

    const due = await raidModel.getDueScheduled(now);
    for (const raid of due) {
      if (now >= raid.end_at) {
        await raidModel.updateStatus(raid.id, 'cancelled');
        logger.info(
          { raidId: raid.id },
          '[Raid] scheduled raid expired before start'
        );
        continue;
      }
      await raidModel.updateStatus(raid.id, 'active');
      logger.info({ raidId: raid.id }, '[Raid] scheduled raid activated');
      result.activated = await raidModel.getById(raid.id);
      break;
    }

    return result;
  }

  async getScheduleInfo() {
    const raid = await raidModel.getCurrent();
    if (!raid) return { status: 'none', raid: null };
    return {
      status: raid.status,
      raid,
      startAt: raid.start_at,
      endAt: raid.end_at,
      remaining:
        raid.status === 'active'
          ? Math.max(0, raid.end_at - Date.now())
          : Math.max(0, raid.start_at - Date.now()),
    };
  }

  async join(jid) {
    const raid = await raidModel.getActive();
    if (!raid || Date.now() >= raid.end_at) {
      throw new Error('Tidak ada raid aktif.');
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
      throw new Error(
        'Kamu belum join raid. Ketik `.raid join` terlebih dahulu.'
      );
    }

    if (participant.status === 'stopped') {
      throw new Error(
        'Kamu sedang dalam mode Stop. Ketik `.raid attack` untuk melanjutkan.'
      );
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

        await raidModel.updateBoss(
          currentRaid.id,
          newBossHp,
          newBossHp <= 0 ? 'cleared' : currentRaid.status
        );
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
            await sock
              .sendMessage(jidChat, {
                text: `💔 @${jid.split('@')[0]} HP habis! Masuk Breaktime 1 jam...`,
                mentions: mentionJid,
              })
              .catch(() => {});
          }
        } else if (
          newHp > 0 &&
          newHp <= HP_LOW_THRESHOLD &&
          p.hp > HP_LOW_THRESHOLD
        ) {
          if (sock && jidChat) {
            const mentionJid = [jid];
            await sock
              .sendMessage(jidChat, {
                text: [
                  `⚠️ @${jid.split('@')[0]} HP kamu tinggal *${newHp}/${RAID_USER_HP}* (≈15%)!`,
                  '',
                  'Saran: ketik `.raid stop` untuk berhenti menyerang dan pulihkan HP,',
                  'tunggu beberapa menit, lalu lanjutkan lagi dengan `.raid attack`.',
                ].join('\n'),
                mentions: mentionJid,
              })
              .catch(() => {});
          }
        }

        if (newBossHp <= 0) {
          this.stopAttackLoop(jid);
          if (sock && jidChat) {
            const participants = await raidModel.getParticipants(
              currentRaid.id
            );
            const mentionJid = participants.map((p) => p.jid);
            const contributionList = participants
              .map(
                (p, i) =>
                  `${i + 1}. @${p.jid.split('@')[0]} — *${F.formatNumber(p.damage)}* damage`
              )
              .join('\n');
            const totalDamage = participants.reduce(
              (sum, p) => sum + p.damage,
              0
            );

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

            await sock
              .sendMessage(jidChat, {
                text,
                mentions: mentionJid,
              })
              .catch(() => {});
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

    if (
      participant.status === 'breaktime' &&
      participant.breaktime_until <= now
    ) {
      const newHp = Math.min(
        RAID_USER_HP,
        participant.hp + HP_RECOVERY_BREAKTIME
      );
      const fullyHealed = newHp >= RAID_USER_HP;
      await raidModel.updateParticipant(raid.id, jid, {
        hp: fullyHealed ? RAID_USER_HP : newHp,
        damage: participant.damage,
        status: fullyHealed ? 'active' : 'breaktime',
        breaktimeUntil: fullyHealed ? 0 : participant.breaktime_until,
      });
      return {
        hp: fullyHealed ? RAID_USER_HP : newHp,
        status: fullyHealed ? 'active' : 'breaktime',
      };
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
    if (participant.damage <= 0)
      throw new Error('Kamu tidak memberikan damage, tidak ada reward.');

    const totalDamage = (await raidModel.getParticipants(raid.id)).reduce(
      (sum, p) => sum + p.damage,
      0
    );
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
        const mentionJid = participants.map((p) => p.jid);
        const contributionList = participants
          .map(
            (p, i) =>
              `${i + 1}. @${p.jid.split('@')[0]} — *${F.formatNumber(p.damage)}* damage`
          )
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
