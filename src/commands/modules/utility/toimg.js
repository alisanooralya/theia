import { webpToImage } from '#features/media/sticker.js';

export default {
  name: 'toimg',
  aliases: ['toimage', 'jpg', 'png'],
  category: 'utility',
  description: 'Convert sticker ke gambar',
  cooldown: 10_000,
  isProblem: true,

  async execute(ctx) {
    const quoted = ctx.quoted;
    if (!quoted || !quoted.isMedia || !quoted.mimetype?.includes('webp'))
      return ctx.reply('Reply sticker dengan `!toimg`');

    await ctx.react('⏳');

    try {
      const buffer = await ctx.quoted.download();
      if (!buffer) return ctx.reply('Gagal download sticker.');

      const pngBuffer = await webpToImage(buffer);
      await ctx.sendMedia('image', pngBuffer, '', { mimetype: 'image/png' });
      await ctx.react('✅');
    } catch (err) {
      await ctx.react('❌');
      await ctx.reply(`❌ ${err.message}`);
    }
  },
};
