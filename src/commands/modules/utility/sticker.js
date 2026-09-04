import { toStickerBuffer } from '#features/media/sticker.js';
import { uploadToUguu } from '#uploader';

async function addTextToImage(buffer, text) {
  const url = await uploadToUguu(buffer);
  const [atas, bawah] = text.includes('*')
    ? text.split('*').map((v) => v.trim())
    : [text, ''];
  const memeUrl = `https://api.memegen.link/images/custom/${encodeURIComponent(atas)}/${encodeURIComponent(bawah)}.png?background=${url}`;
  const res = await fetch(memeUrl);
  if (!res.ok) throw new Error('Gagal membuat meme.');
  return Buffer.from(await res.arrayBuffer());
}

export default {
  name: 'sticker',
  aliases: ['s', 'stiker', 'sgif'],
  category: 'utility',
  description: 'Buat sticker dari gambar/video. Tambah teks: !sticker teks atau !sticker atas * bawah',
  cooldown: 60_000,

  async execute(ctx) {
    const isMedia = ctx.quoted?.isMedia || ctx.msg?.isMedia;
    if (!isMedia) return ctx.fail('Reply gambar/video dengan `!sticker`');

    try {
      let buffer;
      if (ctx.quoted?.isMedia) buffer = await ctx.quoted.download();
      if (!buffer) buffer = await ctx.downloadMedia();
      if (!buffer) return ctx.fail('Gagal download media.');

      const text = ctx.rawArgs?.trim();
      if (text) buffer = await addTextToImage(buffer, text);

      const meta = text
        ? {}
        : ctx.rawArgs?.trim()
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
      return ctx.fail(err.message);
    }
  },
};
