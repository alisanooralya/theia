import axios from 'axios';
import { logger } from '#helpers/logger.js';
import SETTINGS from '#environment/settings.js';

const TIKTOK_API = 'https://api.betabotz.eu.org/api/download/tiktok';

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

    const title =
      res?.title ?? res?.desc ?? res?.caption ?? res?.description ?? '';
    const author =
      res?.author?.unique_id ??
      res?.author?.nickname ??
      res?.author ??
      res?.unique_id ??
      res?.username ??
      '';

    const videoUrl =
      res?.video ??
      res?.video_no_watermark ??
      res?.nowatermark ??
      res?.no_watermark ??
      res?.hd ??
      res?.url ??
      res?.video_url ??
      res?.play ??
      '';
    const audioUrl =
      res?.audio ?? res?.music ?? res?.audio_url ?? res?.audio_no_watermark ?? '';
    const images =
      Array.isArray(res?.images) && res.images.length > 0
        ? res.images
        : Array.isArray(res?.image_urls) && res.image_urls.length > 0
          ? res.image_urls
          : Array.isArray(res?.slides) && res.slides.length > 0
            ? res.slides
            : [];

    if (images.length > 0) {
      return { type: 'slideshow', images, title, author };
    }
    if (audioUrl && !videoUrl) {
      return { type: 'audio', url: audioUrl, title, author };
    }
    if (videoUrl) {
      return { type: 'video', url: videoUrl, title, author };
    }

    throw new Error('Tidak ada media yang bisa diunduh dari respons API.');
  }
}

export const downloaderService = new DownloaderService();
