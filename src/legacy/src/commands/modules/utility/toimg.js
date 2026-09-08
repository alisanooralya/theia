import { webpToImage } from '#features/media/sticker.js';

export default {
  name: 'toimg',
  aliases: ['toimage', 'jpg', 'png'],
  category: 'utility',
  description: 'Convert sticker ke gambar',
  cooldown: 60_000,

  async execute(ctx) {
    const quoted = ctx.quoted;
    if (
      !quoted ||
      !quoted.isMedia ||
      !quoted.message.stickerMessage.mimetype?.includes('webp')
    )
      return ctx.fail('Reply sticker dengan `!toimg`');

    try {
      const buffer = await ctx.quoted.download();
      if (!buffer) return ctx.reply('Gagal download sticker.');

      const imgBuffer = await webpToImage(buffer);
      await ctx.sendMedia('image', imgBuffer, '', { mimetype: 'image/jpeg' });
    } catch (err) {
      return ctx.fail(err.message);
    }
  },
};
