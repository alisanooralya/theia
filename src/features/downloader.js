import axios from 'axios';
import { logger } from '#helpers/logger.js';
import SETTINGS from '#environment/settings.js';

const TIKTOK_API = 'https://api.betabotz.eu.org/api/download/tiktok';
const YOUTUBE_API = 'https://api.betabotz.eu.org/api/download/yt';

function pickUrl(...candidates) {
  for (const c of candidates) {
    if (typeof c === 'string' && c.startsWith('http')) return c;
    if (Array.isArray(c)) {
      for (const item of c) {
        if (typeof item === 'string' && item.startsWith('http')) return item;
      }
    }
  }
  return '';
}

function parseDuration(raw) {
  if (typeof raw === 'number') return raw;
  if (typeof raw === 'string') {
    const parts = raw.split(':').map((p) => Number(p));
    if (parts.some((n) => Number.isNaN(n))) return 0;
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    return Number(raw) || 0;
  }
  return 0;
}

class DownloaderService {
  async toBuffer(url, { timeout = 30_000 } = {}) {
    try {
      const { data } = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout,
      });
      return Buffer.from(data);
    } catch (err) {
      logger.error({ err, url }, 'Downloader failed');
      throw new Error(`Gagal download dari ${url}`);
    }
  }

  async fetchJson(url, params = {}) {
    try {
      const { data } = await axios.get(url, { params, timeout: 15_000 });
      return data;
    } catch (err) {
      logger.error({ err, url }, 'Fetch JSON failed');
      throw new Error('Gagal fetch data');
    }
  }

  async tiktok(url) {
    const key = SETTINGS.tiktokApiKey;
    if (!key) throw new Error('tiktokApiKey belum dikonfigurasi di config.js.');

    let data;
    try {
      const { data: res } = await axios.get(TIKTOK_API, {
        params: { apikey: key, url },
        timeout: 30_000,
      });
      data = res;
    } catch (err) {
      logger.error({ err, url }, 'TikTok API request failed');
      throw new Error('Gagal memanggil API TikTok.');
    }

    if (data?.status === false) {
      throw new Error(data?.message || 'TikTok API menolak request.');
    }
    if (!data) throw new Error('TikTok API mengembalikan response kosong.');

    const res = data.result ?? data.data ?? data;

    const title = res?.title ?? res?.desc ?? res?.caption ?? '';
    const author =
      res?.author?.unique_id ??
      res?.author?.nickname ??
      res?.author ??
      res?.unique_id ??
      res?.username ??
      '';

    const videoUrl = pickUrl(
      res?.video,
      res?.video_no_watermark,
      res?.nowatermark,
      res?.no_watermark,
      res?.hd,
      res?.url,
      res?.video_url,
      res?.play
    );
    const audioUrl = pickUrl(
      res?.audio,
      res?.music,
      res?.audio_url,
      res?.audio_no_watermark
    );
    const images =
      Array.isArray(res?.images) && res.images.length > 0
        ? res.images.map((i) => (typeof i === 'string' ? i : i?.url)).filter(Boolean)
        : Array.isArray(res?.image_urls) && res.image_urls.length > 0
          ? res.image_urls
          : Array.isArray(res?.slides) && res.slides.length > 0
            ? res.slides
            : [];

    if (images.length > 0) {
      return { type: 'slideshow', images, title, author };
    }
    if (audioUrl && !videoUrl) {
      return {
        type: 'audio',
        url: audioUrl,
        title: res?.title_audio || title,
        author,
      };
    }
    if (videoUrl) {
      return { type: 'video', url: videoUrl, title, author };
    }

    throw new Error('Tidak ada media yang bisa diunduh dari respons API.');
  }

  async youtube(url) {
    const key = SETTINGS.tiktokApiKey;
    if (!key) throw new Error('tiktokApiKey belum dikonfigurasi di config.js.');

    let data;
    try {
      const { data: res } = await axios.get(YOUTUBE_API, {
        params: { apikey: key, url },
        timeout: 30_000,
      });
      data = res;
    } catch (err) {
      logger.error({ err, url }, 'YouTube API request failed');
      throw new Error('Gagal memanggil API YouTube.');
    }

    if (data?.status === false) {
      throw new Error(data?.message || 'YouTube API menolak request.');
    }
    if (!data) throw new Error('YouTube API mengembalikan response kosong.');

    const res = data.result ?? data.data ?? data;

    const title =
      res?.title ??
      res?.desc ??
      res?.description ??
      res?.metadata?.title ??
      '';
    const duration = parseDuration(
      res?.duration ?? res?.metadata?.duration ?? res?.durationLabel ?? 0
    );
    const quality =
      res?.quality ??
      res?.metadata?.quality ??
      res?.qualityLabel ??
      res?.video_quality ??
      '';

    const videoUrl = pickUrl(
      res?.download?.video,
      res?.download?.mp4,
      res?.video,
      res?.mp4,
      res?.url,
      res?.videoUrl,
      res?.download_url
    );
    const audioUrl = pickUrl(
      res?.download?.audio,
      res?.download?.mp3,
      res?.audio,
      res?.mp3,
      res?.audioUrl
    );

    if (!videoUrl && !audioUrl) {
      throw new Error('Tidak ada media yang bisa diunduh dari respons API.');
    }

    return { title, duration, quality, videoUrl, audioUrl };
  }
}

export const downloaderService = new DownloaderService();
