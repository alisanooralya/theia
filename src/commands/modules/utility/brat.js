import { toStickerBuffer } from '#features/media/sticker.js';

const BRAT_API = 'https://aqul-brat.hf.space/?text=';
const MAX_TEXT = 300;

async function fetchBratImage(text) {
  const res = await fetch(BRAT_API + encodeURIComponent(text), {
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`API brat error (${res.status}).`);
  const type = res.headers.get('content-type') ?? '';
  if (!type.includes('image')) {
    throw new Error('API brat tidak mengembalikan gambar.');
  }
  return Buffer.from(await res.arrayBuffer());
}

export default {
  name: 'brat',
  aliases: ['bratsticker', 'stikerbrat'],
  category: 'utility',
  description: 'Buat sticker brat dari teks.',
  cooldown: 60_000,

  async execute(ctx) {
    const text = ctx.rawArgs?.trim() || ctx.quoted?.text?.trim();
    if (!text)
      return ctx.fail('Usage: `!brat <teks>` atau reply teks dengan `!brat`');
    if (text.length > MAX_TEXT)
      return ctx.fail(`Teks terlalu panjang (maks ${MAX_TEXT} karakter).`);

    try {
      const image = await fetchBratImage(text);
      const sticker = await toStickerBuffer(image);

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
