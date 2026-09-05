import { downloaderService } from '#features/downloader.js';

export default {
  name: 'tiktok',
  aliases: ['tt', 'tiktokdl'],
  category: 'utility',
  description: 'Download video TikTok (tanpa watermark)',
  cooldown: 300_000,

  async execute(ctx) {
    const url = ctx.args[0];
    if (!url) ctx.fail('Usage: `!tiktok <url>`');

    try {
      const result = await downloaderService.tiktok(url);
      await ctx.reply('Tunggu sebentar... prosess memakan waktu');

      if (result.type === 'video') {
        const buf = await downloaderService.toBuffer(result.url);
        await ctx.sendMedia(
          'video',
          buf,
          `🎵 ${result.title || ''}\n👤 ${result.author || ''}`,
          { mimetype: 'video/mp4' }
        );
      } else if (result.type === 'slideshow') {
        for (const imgUrl of result.images.slice(0, 10)) {
          const buf = await downloaderService.toBuffer(imgUrl);
          await ctx.sendMedia(
            'image',
            buf,
            `📸 ${result.title}\n👤 ${result.author}`
          );
        }
      } else if (result.type === 'audio') {
        const buf = await downloaderService.toBuffer(result.url);
        await ctx.sendMedia(
          'audio',
          buf,
          `🎵 ${result.title}\n👤 ${result.author}`,
          { mimetype: 'audio/mpeg', ptt: false }
        );
      }
    } catch (err) {
      return ctx.fail(err.message);
    }
  },
};
