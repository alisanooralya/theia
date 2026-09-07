import { raidService } from '#features/rpg/raid.js';
import { getSocket } from '#helpers/shutdown.js';
import { logger } from '#helpers/logger.js';
import { F } from '#helpers/index.js';

const MAINTAIN_TICK_MS = 60_000;
const STATUS_TICK_MS = 60 * 60 * 1000;

let maintainInterval = null;
let statusInterval = null;
let maintainRunning = false;
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

async function runMaintain() {
  const sock = resolveSock();
  const events = await raidService.maintain();

  if (events.activated) {
    const config = events.activated;
    const totalHp = config.bosses.reduce((sum, boss) => sum + boss.maxHp, 0);
    const text = [
      '⚔️ *RAID PERIOD DIMULAI!*',
      '',
      `Period: *${config.name}*`,
      `Boss: *${config.bosses.length}* | Total HP: *${F.formatNumber(totalHp)}*`,
      `${config.bosses[0].emoji} Boss pertama: *${config.bosses[0].name}*`,
      '',
      'Ketik `.raid` untuk lihat status, `.raid attack` untuk ikut!',
    ].join('\n');
    logger.info({ periodId: config.id }, '[Raid] period activated');
    if (sock) await announce(sock, text);
  }

  if (events.completed) {
    const config = events.completed;
    const text = [
      '🏁 *RAID PERIOD SELESAI!*',
      '',
      `Period: *${config.name}*`,
      '',
      'Terima kasih sudah ikut raid! Claim reward ketik `.raid claim`.',
    ].join('\n');
    logger.info({ periodId: config.id }, '[Raid] period ended');
    if (sock) await announce(sock, text);
  }
}

export default {
  name: 'raid-maintainer',
  processMessage(parsed, sock) {
    if (sock) storedSock = sock;
    if (parsed?.jid) storedChatId = parsed.jid;
  },
  async init() {
    try {
      await runMaintain();
    } catch (err) {
      logger.warn({ err: err.message }, '[Raid] initial maintain failed');
    }

    maintainInterval = setInterval(async () => {
      if (maintainRunning) return;
      maintainRunning = true;
      try {
        await runMaintain();
      } catch (err) {
        logger.warn({ err: err.message }, '[Raid] maintain failed');
      } finally {
        maintainRunning = false;
      }
    }, MAINTAIN_TICK_MS);

    statusInterval = setInterval(async () => {
      try {
        const overview = await raidService.getOverview(null);
        if (overview.phase !== 'active' || !overview.activeBoss) return;
        logger.info(
          `[RaidStatus] ${overview.activeBoss.config.name} HP: ${overview.activeBoss.state?.remaining_hp ?? '??'}`
        );
      } catch (err) {
        logger.warn({ err: err.message }, '[RaidStatus] failed');
      }
    }, STATUS_TICK_MS);

    logger.info('[Raid] Initialized — maintain tick 60s, status hourly');
  },
  async destroy() {
    if (maintainInterval) clearInterval(maintainInterval);
    if (statusInterval) clearInterval(statusInterval);
    maintainInterval = null;
    statusInterval = null;
    maintainRunning = false;
    storedSock = null;
    storedChatId = null;
  },
};
