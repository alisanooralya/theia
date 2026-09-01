import { youtubeService } from '#features/platforms/youtube.js';
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
    const url = ctx.args.find((a) => a.includes('youtu')) || ctx.args[0];

    if (!url) ctx.fail('Usage: `!youtube <url>` | `!youtube audio <url>`');

    await ctx.typing();

    try {
      const audioOnly = sub === 'audio' || sub === 'a' || sub === 'mp3';
      const result = await youtubeService.resolve(
        audioOnly ? ctx.args[1] || url : url,
        { audioOnly }
      );
      const duration = F.formatDuration(result.duration * 1000);

      if (audioOnly) {
        const buf = await youtubeService.toBuffer(result.url);
        await ctx.sendMedia('audio', buf, `🎵 ${result.title}`, {
          mimetype: 'audio/mpeg',
          ptt: false,
        });
      } else if (result.mode === 'progressive') {
        const buf = await youtubeService.toBuffer(result.url);
        await ctx.sendMedia(
          'video',
          buf,
          `🎬 ${result.title}\n⏱ ${duration}\n📺 ${result.quality}`,
          { mimetype: 'video/mp4' }
        );
      } else {
        const videoBuf = await youtubeService.toBuffer(result.videoUrl);
        await ctx.sendMedia(
          'video',
          videoBuf,
          `🎬 ${result.title}\n⏱ ${duration}\n📺 ${result.quality}\n_Adaptive — audio terpisah_`,
          { mimetype: 'video/mp4' }
        );
      }
    } catch (err) {
      await ctx.reply(`❌ ${err.message}`);
    }
  },
};
