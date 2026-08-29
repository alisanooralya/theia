import { raidModel } from '#storage/models/index.js';
import { raidService } from '#features/rpg/raid.js';
import { logger } from '#helpers/logger.js';
import { F } from '#helpers/index.js';

let statusInterval = null;
let recoveryInterval = null;
let storedSock = null;
let storedChatId = null;

function bar(value, max, size = 10) {
  const filled = Math.max(0, Math.min(size, Math.round((value / max) * size)));
  return '█'.repeat(filled) + '░'.repeat(size - filled);
}

function formatTime(ms) {
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  return `${hours}j ${minutes}m`;
}

function buildStatusText(raid, participants) {
  const totalDamage = participants.reduce((sum, p) => sum + p.damage, 0);
  const remaining = Math.max(0, raid.end_at - Date.now());
  const activeCount = participants.filter((p) => p.status === 'active').length;
  const breaktimeCount = participants.filter((p) => p.status === 'breaktime').length;
  const stoppedCount = participants.filter((p) => p.status === 'stopped').length;

  return [
    '⚔️ *RAID STATUS (Auto)*',
    '',
    `Boss: *${raid.boss_name}*`,
    `HP: ${bar(raid.boss_hp, raid.boss_max_hp, 15)} *${F.formatNumber(raid.boss_hp)} / ${F.formatNumber(raid.boss_max_hp)}*`,
    '',
    `Participant: *${participants.length}*`,
    `Active: *${activeCount}* | Breaktime: *${breaktimeCount}* | Stopped: *${stoppedCount}*`,
    `Total Damage: *${F.formatNumber(totalDamage)}*`,
    `Sisa Waktu: *${formatTime(remaining)}*`,
  ].join('\n');
}

export default {
  name: 'raid-status',
  processMessage(parsed, sock) {
    if (sock) storedSock = sock;
    if (parsed?.jid) storedChatId = parsed.jid;
  },
  async init() {
    statusInterval = setInterval(() => {
      try {
        const raid = raidModel.getActive();
        if (!raid || raid.status !== 'active') return;

        if (Date.now() >= raid.end_at) {
          raidService.endRaid(storedSock, storedChatId);
          logger.info('[RaidStatus] Raid ended due to time');
          return;
        }

        const participants = raidModel.getParticipants(raid.id);
        if (participants.length === 0) return;

        logger.info(`[RaidStatus] Raid HP: ${raid.boss_hp}, Participants: ${participants.length}`);
      } catch (err) {
        logger.warn({ err: err.message }, '[RaidStatus] failed');
      }
    }, 60 * 60 * 1000);

    recoveryInterval = setInterval(() => {
      try {
        const raid = raidModel.getActive();
        if (!raid || raid.status !== 'active') return;

        const participants = raidModel.getParticipants(raid.id);
        for (const p of participants) {
          if (p.status === 'breaktime' || p.status === 'stopped') {
            const now = Date.now();
            const recoveryRate = p.status === 'breaktime' ? 200 : 80;
            let newHp = Math.min(2400, p.hp + recoveryRate);
            let newStatus = p.status;
            let breaktimeUntil = p.breaktime_until;

            if (p.status === 'breaktime' && p.breaktime_until <= now) {
              newHp = Math.min(2400, p.hp + recoveryRate);
              if (newHp >= 2400) {
                newStatus = 'active';
                breaktimeUntil = 0;
                newHp = 2400;
              }
            }

            raidModel.updateParticipant(raid.id, p.jid, {
              hp: newHp,
              damage: p.damage,
              status: newStatus,
              breaktimeUntil,
            });
          }
        }
      } catch (err) {
        logger.warn({ err: err.message }, '[RaidRecovery] failed');
      }
    }, 60 * 1000);

    logger.info('[Raid] Initialized — status hourly, recovery every minute');
  },
  async destroy() {
    if (statusInterval) clearInterval(statusInterval);
    if (recoveryInterval) clearInterval(recoveryInterval);
    statusInterval = null;
    recoveryInterval = null;
    storedSock = null;
    storedChatId = null;
  },
};
