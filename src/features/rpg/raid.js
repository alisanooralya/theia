import { db } from '#storage/connection.js';
import {
  raidModel,
  statsModel,
  artifactModel,
  walletModel,
  userModel,
} from '#storage/models/index.js';
import { logger } from '#helpers/logger.js';
import { F } from '#helpers/index.js';

const RAID_BOSS_NAME = 'Raid Boss';
const RAID_BOSS_HP = 500_000;
const RAID_USER_HP = 2400;
const RAID_DURATION = 24 * 60 * 60 * 1000;
const BREAKTIME_DURATION = 60 * 60 * 1000;
const HP_RECOVERY_STOP = 80;
const HP_RECOVERY_BREAKTIME = 200;
const CRIT_MULT = 1.5;
const ATTACK_INTERVAL = 30_000;

const activeAttacks = new Map();

function calcDamage(atk, critRate) {
  const isCrit = Math.random() * 100 < critRate;
  const baseDmg = Math.max(1, atk);
  return {
    dmg: Math.floor(isCrit ? baseDmg * CRIT_MULT : baseDmg),
    crit: isCrit,
  };
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

  startAttackLoop(jid, sock, jidChat) {
    if (activeAttacks.has(jid)) {
      throw new Error('Kamu sudah sedang menyerang!');
    }

    const raid = raidModel.getActive();
    if (!raid || raid.status !== 'active') {
      throw new Error('Tidak ada raid aktif.');
    }

    const participant = raidModel.getParticipant(raid.id, jid);
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

    const userStats = getUserRaidStats(jid);

    const interval = setInterval(async () => {
      try {
        const currentRaid = raidModel.getActive();
        if (!currentRaid || currentRaid.status !== 'active') {
          this.stopAttackLoop(jid);
          return;
        }

        const p = raidModel.getParticipant(currentRaid.id, jid);
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

        raidModel.updateBoss(currentRaid.id, newBossHp, newBossHp <= 0 ? 'cleared' : currentRaid.status);
        raidModel.updateParticipant(currentRaid.id, jid, {
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
        }

        if (newBossHp <= 0) {
          this.stopAttackLoop(jid);
          if (sock && jidChat) {
            const participants = raidModel.getParticipants(currentRaid.id);
            const mentionJid = participants.map(p => p.jid);
            const contributionList = participants
              .map((p, i) => `${i + 1}. @${p.jid.split('@')[0]} — *${F.formatNumber(p.damage)}* damage`)
              .join('\n');
            const totalDamage = participants.reduce((sum, p) => sum + p.damage, 0);

            await sock.sendMessage(jidChat, {
              text: [
                '🎉 *RAID BOSS MATI!*',
                '',
                `Total Damage: *${F.formatNumber(totalDamage)}*`,
                '',
                '*Kontribusi:*',
                contributionList,
                '',
                'Ketik `.raid claim` untuk klaim reward!',
              ].join('\n'),
              mentions: mentionJid,
            }).catch(() => {});
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

  stop(jid) {
    const raid = raidModel.getActive();
    if (!raid || raid.status !== 'active') {
      throw new Error('Tidak ada raid aktif.');
    }

    const participant = raidModel.getParticipant(raid.id, jid);
    if (!participant) {
      throw new Error('Kamu belum join raid.');
    }

    this.stopAttackLoop(jid);

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
      const newHp = Math.min(RAID_USER_HP, participant.hp + HP_RECOVERY_BREAKTIME);
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
      const newHp = Math.min(RAID_USER_HP, participant.hp + HP_RECOVERY_STOP);
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
    const raid = raidModel.getActive() || raidModel.getEnded();
    if (!raid) throw new Error('Tidak ada raid.');

    const participant = raidModel.getParticipant(raid.id, jid);
    if (!participant) throw new Error('Kamu tidak participate di raid ini.');
    if (participant.reward_claimed) throw new Error('Reward sudah diklaim.');
    if (participant.damage <= 0) throw new Error('Kamu tidak memberikan damage, tidak ada reward.');

    const totalDamage = raidModel.getParticipants(raid.id)
      .reduce((sum, p) => sum + p.damage, 0);
    const contributionRatio = participant.damage / Math.max(1, totalDamage);

    const baseCash = 4000;
    const baseExp = 60;
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

  async endRaid(sock, chatId) {
    const raid = raidModel.getActive();
    if (!raid) return null;

    for (const [jid] of activeAttacks) {
      this.stopAttackLoop(jid);
    }

    raidModel.updateBoss(raid.id, raid.boss_hp, 'ended');

    if (sock && chatId) {
      const participants = raidModel.getParticipants(raid.id);
      if (participants.length > 0) {
        const mentionJid = participants.map(p => p.jid);
        const contributionList = participants
          .map((p, i) => `${i + 1}. @${p.jid.split('@')[0]} — *${F.formatNumber(p.damage)}* damage`)
          .join('\n');
        const totalDamage = participants.reduce((sum, p) => sum + p.damage, 0);

        await sock.sendMessage(chatId, {
          text: [
            '🎉 *RAID BOSS MATI!*',
            '',
            `Total Damage: *${F.formatNumber(totalDamage)}*`,
            '',
            '*Kontribusi:*',
            contributionList,
            '',
            'Ketik `.raid claim` untuk klaim reward!',
          ].join('\n'),
          mentions: mentionJid,
        }).catch(() => {});
      }
    }

    return raid;
  }
}

export const raidService = new RaidService();
