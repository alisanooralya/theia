import { sql } from '#storage/connection.js';
import { marketNewsModel } from '../models/market-news.model.js';
import { groupModel } from '#storage/models/group.js';
import { broadcastService } from '../../broadcast.js';
import SETTINGS from '#environment/settings.js';
import { F } from '#helpers/index.js';
import { logger } from '#helpers/logger.js';
import { COMMODITIES } from '../config/market-config.js';
import {
  NEWS_TYPES,
  NEWS_ANNOUNCE_PER_RUN,
  NEWS_DELIVERY_DELAY_MS,
  NEWS_FEED_LIMIT,
} from '../config/market-news-config.js';
import { rollNews } from '../market-news-engine.js';

const FALLBACK_TYPE = NEWS_TYPES.news;

export function createMarketNewsService({
  news = marketNewsModel,
  groups = groupModel,
  broadcast = broadcastService,
  db = sql,
} = {}) {
  const newsRepo = news;
  const groupRepo = groups;
  const broadcastSvc = broadcast;

  function typeOf(item) {
    return NEWS_TYPES[item?.type] ?? FALLBACK_TYPE;
  }

  function commodityTags(item, bold = true) {
    const tags = (item?.targets ?? []).map((id) => {
      const meta = COMMODITIES[id];
      if (!meta) return id;
      return bold
        ? `${meta.emoji} *${meta.name}*`
        : `${meta.emoji} ${meta.name}`;
    });
    return tags.join(' • ');
  }

  function buildAnnouncement(item) {
    const type = typeOf(item);
    return [
      `${type.emoji} *${type.label}*`,
      '',
      commodityTags(item),
      '',
      item.message,
      '',
      type.footer,
      '',
      `Pantau harga: \`${SETTINGS.prefix}market\``,
    ].join('\n');
  }

  return {
    typeOf,
    commodityTags,
    buildAnnouncement,

    async feed(limit = NEWS_FEED_LIMIT) {
      const rows = await newsRepo.recent(limit);
      const nowSec = Math.floor(Date.now() / 1000);
      return rows.map((item) => {
        const type = typeOf(item);
        const ageSec = Math.max(0, nowSec - Number(item.created_at ?? nowSec));
        return {
          id: item.id,
          emoji: type.emoji,
          label: type.label,
          commodities: commodityTags(item, false),
          message: item.message,
          age: F.formatDuration(ageSec * 1000),
        };
      });
    },

    async maintain(tick) {
      return db.begin(async (t) => {
        const active = await newsRepo.activeForUpdate(t);
        const cooldown = await newsRepo.lastTicks(t);
        const rolled = rollNews({
          tick,
          active,
          lastAny: cooldown.any,
          lastByType: cooldown.byType,
        });
        let created = null;
        if (rolled) {
          created = await newsRepo.insert(rolled, t);
        }
        const expired = await newsRepo.expireDue(tick, t);
        const skipped = await newsRepo.skipStale(t);
        return {
          created,
          activeCount: active.length,
          expired,
          skipped,
          tick,
        };
      });
    },

    async announcePending(sock, limit = NEWS_ANNOUNCE_PER_RUN) {
      const pending = await newsRepo.pendingAnnouncements(limit);
      if (!pending.length) return { announced: 0, sent: 0, failed: 0 };

      if (!sock) return { announced: 0, sent: 0, failed: 0, waiting: true };

      const targets = await groupRepo.findNewsGroups();
      let announced = 0;
      let sent = 0;
      let failed = 0;

      if (!targets.length) {
        logger.warn(
          { pending: pending.length },
          '[Market] Berita dilewati: tidak ada grup dengan news aktif (`groupset news on`)'
        );
      }

      for (const item of pending) {
        if (!targets.length) {
          await newsRepo.markSkipped(item.id);
          continue;
        }

        const claimed = await newsRepo.claimAnnouncement(item.id);
        if (!claimed) continue;

        const result = await broadcastSvc.send(
          sock,
          targets,
          { text: buildAnnouncement(item) },
          { delayMs: NEWS_DELIVERY_DELAY_MS }
        );
        announced += 1;
        sent += result.sent;
        failed += result.failed;
      }

      return { announced, sent, failed, groups: targets.length };
    },
  };
}

export const marketNewsService = createMarketNewsService();
