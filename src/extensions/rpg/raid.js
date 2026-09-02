import { raidModel } from '#storage/models/index.js';
import {
  raidService,
  formatRaidClock,
  formatRaidSchedule,
} from '#features/rpg/raid.js';
import { getSocket } from '#helpers/shutdown.js';
import { logger } from '#helpers/logger.js';
import { F } from '#helpers/index.js';

const SCHEDULE_TICK_MS = 30_000;

let statusInterval = null;
let recoveryInterval = null;
let scheduleInterval = null;
let scheduleRunning = false;
let pendingAnnouncement = null;
let storedSock = null;
let storedChatId = null;

function resolveSock() {
  return getSocket() || storedSock;
}

async function announce(sock, text) {
  const sent = await raidService.broadcast(sock, text);
  if (sent.length === 0 && storedChatId) {
    sock.sendMessage(storedChatId, { text }).catch(() => {});
  }
}

async function runSchedule() {
  const sock = resolveSock();

  if (pendingAnnouncement && sock) {
    const text = pendingAnnouncement;
    pendingAnnouncement = null;
    await announce(sock, text);
  }

  const result = await raidService.processSchedule();

  if (result.activated) {
    const raid = result.activated;
    const text = [
      '⚔️ *RAID DIMULAI!*',
      '',
      `Boss: *${raid.boss_name}*`,
      `HP: *${F.formatNumber(raid.boss_hp)}*`,
      `Selesai: *${formatRaidClock(raid.end_at)}*`,
      '',
      'Ketik `.raid join` lalu `.raid attack` untuk ikut!',
    ].join('\n');
    logger.info(
      { raidId: raid.id, endAt: raid.end_at },
      '[RaidSchedule] raid activated'
    );
    if (sock) await announce(sock, text);
    else pendingAnnouncement = text;
    return;
  }

  if (result.ended) {
    await raidService.endRaid(sock, storedChatId);
    logger.info(
      { raidId: result.ended.id },
      '[RaidSchedule] raid ended due to time'
    );
  }
}

export default {
  name: 'raid-status',
  processMessage(parsed, sock) {
    if (sock) storedSock = sock;
    if (parsed?.jid) storedChatId = parsed.jid;
  },
  async init() {
    scheduleInterval = setInterval(async () => {
      if (scheduleRunning) return;
      scheduleRunning = true;
      try {
        await runSchedule();
      } catch (err) {
        logger.warn({ err: err.message }, '[RaidSchedule] failed');
      } finally {
        scheduleRunning = false;
      }
    }, SCHEDULE_TICK_MS);

    statusInterval = setInterval(
      async () => {
        try {
          const scheduled = await raidModel.getScheduled();
          if (scheduled) {
            logger.info(
              `[RaidStatus] Raid scheduled at ${formatRaidSchedule(scheduled.start_at)}`
            );
            return;
          }

          const raid = await raidModel.getActive();
          if (!raid) return;

          const participants = await raidModel.getParticipants(raid.id);
          logger.info(
            `[RaidStatus] Raid HP: ${raid.boss_hp}, Participants: ${participants.length}`
          );
        } catch (err) {
          logger.warn({ err: err.message }, '[RaidStatus] failed');
        }
      },
      60 * 60 * 1000
    );

    recoveryInterval = setInterval(async () => {
      try {
        const raid = await raidModel.getActive();
        if (!raid) return;

        const participants = await raidModel.getParticipants(raid.id);
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

            await raidModel.updateParticipant(raid.id, p.jid, {
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

    logger.info(
      '[Raid] Initialized — manual schedule tick 30s, status hourly, recovery every minute'
    );
  },
  async destroy() {
    if (scheduleInterval) clearInterval(scheduleInterval);
    if (statusInterval) clearInterval(statusInterval);
    if (recoveryInterval) clearInterval(recoveryInterval);
    scheduleInterval = null;
    statusInterval = null;
    recoveryInterval = null;
    scheduleRunning = false;
    pendingAnnouncement = null;
    storedSock = null;
    storedChatId = null;
  },
};
