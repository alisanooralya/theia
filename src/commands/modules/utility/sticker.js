import { toStickerBuffer } from '#features/media/sticker.js';

export default {
  name: 'sticker',
  aliases: ['s', 'stiker', 'sgif'],
  category: 'utility',
  description: 'Buat sticker dari gambar/video',
  cooldown: 10_000,
  isProblem: true,

  async execute(ctx) {
    const isMedia = ctx.quoted?.isMedia || ctx.msg?.isMedia;
    if (!isMedia) return ctx.reply('Reply gambar/video dengan `!sticker`');

    await ctx.react('⏳');
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
      await ctx.react('✅');
    } catch (err) {
      await ctx.react('❌');
      await ctx.reply(`❌ ${err.message}`);
    }
  },
};
