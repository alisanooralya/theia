import { marketNewsModel } from '#storage/models/market-news.js';
import { groupModel } from '#storage/models/group.js';
import { broadcastService } from '#features/broadcast.js';
import SETTINGS from '#environment/settings.js';
import { F } from '#helpers/index.js';
import { COMMODITIES } from './market-config.js';
import {
  NEWS_TYPES,
  NEWS_ANNOUNCE_PER_RUN,
  NEWS_DELIVERY_DELAY_MS,
  NEWS_FEED_LIMIT,
} from './market-news-config.js';

const FALLBACK_TYPE = NEWS_TYPES.news;

class MarketNewsService {
  typeOf(news) {
    return NEWS_TYPES[news?.type] ?? FALLBACK_TYPE;
  }

  commodityTags(news, bold = true) {
    const tags = (news?.targets ?? []).map((id) => {
      const meta = COMMODITIES[id];
      if (!meta) return id;
      return bold
        ? `${meta.emoji} *${meta.name}*`
        : `${meta.emoji} ${meta.name}`;
    });
    return tags.join(' • ');
  }

  buildAnnouncement(news) {
    const type = this.typeOf(news);
    return [
      `${type.emoji} *${type.label}*`,
      '',
      this.commodityTags(news),
      '',
      news.message,
      '',
      type.footer,
      '',
      `Pantau harga: \`${SETTINGS.prefix}market\``,
    ].join('\n');
  }

  async feed(limit = NEWS_FEED_LIMIT) {
    const rows = await marketNewsModel.recent(limit);
    const nowSec = Math.floor(Date.now() / 1000);
    return rows.map((news) => {
      const type = this.typeOf(news);
      const ageSec = Math.max(0, nowSec - Number(news.created_at ?? nowSec));
      return {
        id: news.id,
        emoji: type.emoji,
        label: type.label,
        commodities: this.commodityTags(news, false),
        message: news.message,
        age: F.formatDuration(ageSec * 1000),
      };
    });
  }

  async announcePending(sock, limit = NEWS_ANNOUNCE_PER_RUN) {
    const pending = await marketNewsModel.pendingAnnouncements(limit);
    if (!pending.length) return { announced: 0, sent: 0, failed: 0 };

    if (!sock) return { announced: 0, sent: 0, failed: 0, waiting: true };

    const targets = await groupModel.findNewsGroups();
    let announced = 0;
    let sent = 0;
    let failed = 0;

    for (const news of pending) {
      if (!targets.length) {
        await marketNewsModel.markSkipped(news.id);
        continue;
      }

      const claimed = await marketNewsModel.claimAnnouncement(news.id);
      if (!claimed) continue;

      const result = await broadcastService.send(
        sock,
        targets,
        { text: this.buildAnnouncement(news) },
        { delayMs: NEWS_DELIVERY_DELAY_MS }
      );
      announced += 1;
      sent += result.sent;
      failed += result.failed;
    }

    return { announced, sent, failed, groups: targets.length };
  }
}

export const marketNewsService = new MarketNewsService();
