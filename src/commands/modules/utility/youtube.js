import { downloaderService } from '#features/downloader.js';
import { F } from '#helpers/index.js';

export default {
  name: 'youtube',
  aliases: ['yt', 'ytdl', 'yta'],
  category: 'utility',
  description: 'Download video/audio YouTube',
  cooldown: 30_000,
  isProblem: true,

  async execute(ctx) {
    const sub = ctx.args[0]?.toLowerCase();
    const audioOnly = sub === 'audio' || sub === 'a' || sub === 'mp3';
    const url = ctx.args.find((a) => a.includes('youtu')) || ctx.args[0];

    if (!url) ctx.fail('Usage: `!youtube <url>` | `!youtube audio <url>`');

    await ctx.typing();

    try {
      const result = await downloaderService.youtube(url);
      const duration = F.formatDuration(result.duration * 1000);

      if (audioOnly) {
        if (!result.audioUrl)
          throw new Error('Audio tidak tersedia untuk video ini.');
        const buf = await downloaderService.toBuffer(result.audioUrl, {
          timeout: 90_000,
        });
        await ctx.sendMedia('audio', buf, `🎵 ${result.title}`, {
          mimetype: 'audio/mpeg',
          ptt: false,
        });
      } else {
        if (!result.videoUrl)
          throw new Error('Video tidak tersedia untuk video ini.');
        const buf = await downloaderService.toBuffer(result.videoUrl, {
          timeout: 90_000,
        });
        await ctx.sendMedia(
          'video',
          buf,
          `🎬 ${result.title}\n⏱ ${duration}${
            result.quality ? `\n📺 ${result.quality}` : ''
          }`,
          { mimetype: 'video/mp4' }
        );
      }
    } catch (err) {
      await ctx.reply(`❌ ${err.message}`);
    }
  },
};
