import { toStickerBuffer } from '#features/media/sticker.js';

export default {
  name: 'sticker',
  aliases: ['s', 'stiker', 'sgif'],
  category: 'utility',
  description: 'Buat sticker dari gambar/video',
  cooldown: 60_000,

  async execute(ctx) {
    const isMedia = ctx.quoted?.isMedia || ctx.msg?.isMedia;
    if (!isMedia) return ctx.reply('Reply gambar/video dengan `!sticker`');

    await ctx.typing();

    try {
      let buffer;
      if (ctx.quoted?.isMedia) buffer = await ctx.quoted.download();
      if (!buffer) buffer = await ctx.downloadMedia();
      if (!buffer) return ctx.reply('Gagal download media.');

      const meta = ctx.rawArgs?.trim()
        ? {
            packName: ctx.rawArgs.trim(),
            packPublish: ctx.pushName || 'Theia',
            emojis: ['🤖'],
          }
        : {};
      const sticker = await toStickerBuffer(buffer, meta);

      await ctx.send({
        sticker,
        mimetype: 'image/webp',
        ptt: false,
        contextInfo: { forwardingScore: 0, isForwarded: false },
      });
    } catch (err) {
      await ctx.reply(`❌ ${err.message}`);
    }
  },
};
