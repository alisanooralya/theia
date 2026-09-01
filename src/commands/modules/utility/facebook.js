import { facebookService } from '#features/platforms/facebook.js';

export default {
  name: 'facebook',
  aliases: ['fb', 'fbdl', 'facebookdl'],
  category: 'utility',
  description: 'Download video Facebook/reel',
  cooldown: 30_000,
  isProblem: true,

  async execute(ctx) {
    const url = ctx.args[0];
    if (!url) ctx.fail('Usage: `!facebook <url>`');

    await ctx.typing();

    try {
      const result = await facebookService.resolve(url);
      const buf = await facebookService.toBuffer(result.url);
      const caption = result.title
        ? `${result.title}\n${result.hasHd ? '📺 HD tersedia' : ''}`
        : '';
      await ctx.sendMedia('video', buf, caption, { mimetype: 'video/mp4' });
    } catch (err) {
      await ctx.reply(`❌ ${err.message}`);
    }
  },
};
