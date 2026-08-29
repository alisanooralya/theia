import { db } from '#storage/connection.js';
import {
  raidModel,
  statsModel,
  artifactModel,
  walletModel,
  userModel,
} from '#storage/models/index.js';
import { artifactService } from '#features/rpg/artifact.js';
import { logger } from '#helpers/logger.js';

const RAID_BOSS_NAME = 'Raid Boss';
const RAID_BOSS_HP = 500_000;
const RAID_USER_HP = 2400;
const RAID_DURATION = 24 * 60 * 60 * 1000;
const BREAKTIME_DURATION = 60 * 1000;
const HP_RECOVERY_PER_MINUTE = 200;
const CRIT_MULT = 1.5;

function getWeekSunday() {
  const now = new Date();
  const day = now.getDay();
  const diff = day === 0 ? 0 : 7 - day;
  const sunday = new Date(now);
  sunday.setDate(now.getDate() + diff);
  sunday.setHours(0, 0, 0, 0);
  return sunday.getTime();
}

function getNextSunday() {
  const thisSunday = getWeekSunday();
  const now = Date.now();
  if (now < thisSunday) return thisSunday;
  return thisSunday + 7 * 24 * 60 * 60 * 1000;
}

function calcDamage(atk, critRate) {
  const isCrit = Math.random() * 100 < critRate;
  const baseDmg = Math.max(1, atk);
  return {
    dmg: Math.floor(isCrit ? baseDmg * CRIT_MULT : baseDmg),
    crit: isCrit,
  };
}

function simulateBattle(userStats, bossAtk) {
  let userHp = RAID_USER_HP;
  let bossHp = 0;
  const rounds = [];
  let totalUserDmg = 0;

  for (let i = 0; i < 100; i++) {
    const userDmg = calcDamage(userStats.atk, userStats.critRate);
    totalUserDmg += userDmg.dmg;
    rounds.push({ round: i + 1, userDmg: userDmg.dmg, crit: userDmg.crit });

    const bossDmg = calcDamage(bossAtk, 5);
    userHp = Math.max(0, userHp - bossDmg.dmg);

    if (userHp <= 0) break;
  }

  return { userHp, totalUserDmg, rounds, userDied: userHp <= 0 };
}

function getUserRaidStats(jid) {
  const base = statsModel.find(jid);
  const baseAtk = base?.atk ?? 30;
  const baseCritRate = base?.crit_rate ?? 5;

  let artifactAtk = 0;
  let artifactCritRate = 0;
  const inventory = artifactModel.getInventory(jid);
  if (inventory) {
    const slots = ['flower', 'feather', 'sands', 'goblet', 'circlet'];
    for (const slot of slots) {
      const artifactId = inventory[`${slot}_id`];
      if (!artifactId) continue;
      const art = artifactModel.findById(artifactId);
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
    def: base?.def ?? 20,
  };
}

class RaidService {
  getRaidInfo() {
    const active = raidModel.getActive();
    if (active && active.status === 'active') {
      const now = Date.now();
      const remaining = Math.max(0, active.end_at - now);
      const participants = raidModel.getParticipants(active.id);
      return {
        raid: active,
        participants,
        remaining,
        isLive: true,
      };
    }
    return null;
  }

  createRaid() {
    const now = Date.now();
    const endAt = now + RAID_DURATION;
    const raid = raidModel.create(RAID_BOSS_NAME, RAID_BOSS_HP, now, endAt);
    return raid;
  }

  startRaid() {
    const existing = raidModel.getActive();
    if (existing && existing.status === 'active') {
      return existing;
    }
    return this.createRaid();
  }

  join(jid) {
    let raid = raidModel.getActive();
    if (!raid || raid.status !== 'active') {
      raid = this.createRaid();
    }

    let participant = raidModel.getParticipant(raid.id, jid);
    if (!participant) {
      participant = raidModel.addParticipant(raid.id, jid);
    }

    return { raid, participant };
  }

  attack(jid) {
    const raid = raidModel.getActive();
    if (!raid || raid.status !== 'active') {
      throw new Error('Tidak ada raid aktif.');
    }

    const participant = raidModel.getParticipant(raid.id, jid);
    if (!participant) {
      throw new Error('Kamu belum join raid. Ketik `.raid join` terlebih dahulu.');
    }

    if (participant.status === 'stopped') {
      throw new Error('Kamu sedang dalam mode Stop. Ketik `.raid resume` untuk melanjutkan.');
    }

    const now = Date.now();
    if (participant.breaktime_until > now) {
      const waitSec = Math.ceil((participant.breaktime_until - now) / 1000);
      throw new Error(`Kamu sedang dalam Breaktime. Tunggu ${waitSec} detik.`);
    }

    if (raid.boss_hp <= 0) {
      throw new Error('Raid Boss sudah mati!');
    }

    const userStats = getUserRaidStats(jid);
    const bossAtk = 150;
    const battleResult = simulateBattle(userStats, bossAtk);

    const damageDealt = battleResult.totalUserDmg;
    const actualDamage = Math.min(damageDealt, raid.boss_hp);
    const newBossHp = Math.max(0, raid.boss_hp - actualDamage);
    const newParticipantHp = battleResult.userHp;

    let newStatus = participant.status;
    let breaktimeUntil = 0;

    if (battleResult.userDied) {
      newStatus = 'breaktime';
      breaktimeUntil = now + BREAKTIME_DURATION;
    }

    raidModel.updateBoss(raid.id, newBossHp, newBossHp <= 0 ? 'cleared' : raid.status);
    raidModel.updateParticipant(raid.id, jid, {
      hp: newParticipantHp,
      damage: participant.damage + actualDamage,
      status: newStatus,
      breaktimeUntil,
    });

    return {
      damage: actualDamage,
      totalDamage: participant.damage + actualDamage,
      userHp: newParticipantHp,
      bossHp: newBossHp,
      userDied: battleResult.userDied,
      bossDied: newBossHp <= 0,
      rounds: battleResult.rounds,
    };
  }

  stop(jid) {
    const raid = raidModel.getActive();
    if (!raid || raid.status !== 'active') {
      throw new Error('Tidak ada raid aktif.');
    }

    const participant = raidModel.getParticipant(raid.id, jid);
    if (!participant) {
      throw new Error('Kamu belum join raid.');
    }

    raidModel.updateParticipant(raid.id, jid, {
      hp: participant.hp,
      damage: participant.damage,
      status: 'stopped',
      breaktimeUntil: 0,
    });

    return true;
  }

  resume(jid) {
    const raid = raidModel.getActive();
    if (!raid || raid.status !== 'active') {
      throw new Error('Tidak ada raid aktif.');
    }

    const participant = raidModel.getParticipant(raid.id, jid);
    if (!participant) {
      throw new Error('Kamu belum join raid.');
    }

    raidModel.updateParticipant(raid.id, jid, {
      hp: participant.hp,
      damage: participant.damage,
      status: 'active',
      breaktimeUntil: 0,
    });

    return true;
  }

  recoverHp(jid) {
    const raid = raidModel.getActive();
    if (!raid || raid.status !== 'active') return null;

    const participant = raidModel.getParticipant(raid.id, jid);
    if (!participant) return null;

    const now = Date.now();

    if (participant.status === 'breaktime' && participant.breaktime_until <= now) {
      const newHp = Math.min(RAID_USER_HP, participant.hp + HP_RECOVERY_PER_MINUTE);
      const fullyHealed = newHp >= RAID_USER_HP;
      raidModel.updateParticipant(raid.id, jid, {
        hp: fullyHealed ? RAID_USER_HP : newHp,
        damage: participant.damage,
        status: fullyHealed ? 'active' : 'breaktime',
        breaktimeUntil: fullyHealed ? 0 : participant.breaktime_until,
      });
      return { hp: fullyHealed ? RAID_USER_HP : newHp, status: fullyHealed ? 'active' : 'breaktime' };
    }

    if (participant.status === 'stopped') {
      const newHp = Math.min(RAID_USER_HP, participant.hp + HP_RECOVERY_PER_MINUTE);
      raidModel.updateParticipant(raid.id, jid, {
        hp: newHp,
        damage: participant.damage,
        status: 'stopped',
        breaktimeUntil: 0,
      });
      return { hp: newHp, status: 'stopped' };
    }

    return null;
  }

  claimReward(jid) {
    const raid = raidModel.getActive();
    if (!raid) throw new Error('Tidak ada raid.');

    const participant = raidModel.getParticipant(raid.id, jid);
    if (!participant) throw new Error('Kamu tidak participate di raid ini.');
    if (participant.reward_claimed) throw new Error('Reward sudah diklaim.');
    if (participant.damage <= 0) throw new Error('Kamu tidak memberikan damage, tidak ada reward.');

    const totalDamage = raidModel.getParticipants(raid.id)
      .reduce((sum, p) => sum + p.damage, 0);
    const contributionRatio = participant.damage / Math.max(1, totalDamage);

    const baseCash = 5000;
    const baseExp = 100;
    const cashReward = Math.floor(baseCash * contributionRatio * 10);
    const expReward = Math.floor(baseExp * contributionRatio * 10);
    const raidCoinReward = Math.max(1, Math.floor(contributionRatio * 20));

    db.transaction(() => {
      walletModel.addCash(jid, cashReward, `raid reward`);
      userModel.addExp(jid, expReward);
      raidModel.addRaidCoin(jid, raidCoinReward);
      raidModel.claimReward(raid.id, jid);
    })();

    return {
      cash: cashReward,
      exp: expReward,
      raidCoin: raidCoinReward,
      contribution: participant.damage,
    };
  }

  getRaidCoin(jid) {
    return raidModel.getRaidCoin(jid);
  }

  endRaid() {
    const raid = raidModel.getActive();
    if (!raid) return null;
    raidModel.updateBoss(raid.id, raid.boss_hp, 'ended');
    return raid;
  }
}

export const raidService = new RaidService();
