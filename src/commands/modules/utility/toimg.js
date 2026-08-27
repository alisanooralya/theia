import { webpToImage } from '#features/media/sticker.js';

export default {
  name: 'toimg',
  aliases: ['toimage', 'jpg', 'png'],
  category: 'utility',
  description: 'Convert sticker ke gambar',
  cooldown: 60_000,
  isProblem: true,

  async execute(ctx) {
    const quoted = ctx.quoted;
    if (!quoted || !quoted.isMedia || !quoted.message.stickerMessage.mimetype?.includes('webp'))
      return ctx.reply('Reply sticker dengan `!toimg`');

    await ctx.react('⏳');

    try {
      const buffer = await ctx.quoted.download();
      if (!buffer) return ctx.reply('Gagal download sticker.');

      const imgBuffer = await webpToImage(buffer);
      ctx.sendMedia('image', imgBuffer, '', { mimetype: 'image/jpeg' });
      ctx.react('✅');
    } catch (err) {
      await ctx.react('❌');
      await ctx.reply(`❌ ${err.message}`);
    }
  },
};
