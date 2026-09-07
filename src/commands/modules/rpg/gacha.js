import { prepareWAMessageMedia } from 'baileys';
import { gachaService as gacha } from '#features/rpg/gacha.js';
import { renderGachaBanner } from '#features/rpg/gacha-banner.js';
import { cardService } from '#features/rpg/card.js';
import { cardArtPath, CARD_IMAGE_MAP } from '#features/rpg/card-config.js';
import { userModel } from '#storage/models/index.js';
import { ButtonV2 } from '#messages/builder.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function bannerData(results) {
  const pulled = results.find((r) => r.type === 'card');
  if (pulled) {
    return {
      name: pulled.card.name,
      subtitle: pulled.card.role || 'Main Card',
      eraLabel: 'FEATURED PULL',
      rateUpText: 'RATE UP  ·  1%',
      description: cardService.passiveDescription(pulled.card),
      artPath: cardArtPath(pulled.card.card_id),
    };
  }
  const fallbackId = Object.keys(CARD_IMAGE_MAP)[0];
  return {
    name: 'GACHA',
    subtitle: 'Standard Banner',
    eraLabel: 'MYSTIC VIOLET',
    rateUpText: 'RATE UP  ·  1%',
    description: 'Pull untuk mendapatkan Main Card dan Support Card.',
    artPath: cardArtPath(fallbackId),
  };
}

async function sendGachaResult(ctx, results) {
  const text = formatResults(results);
  try {
    const banner = await renderGachaBanner(bannerData(results));
    const { imageMessage } = await prepareWAMessageMedia(
      { image: banner },
      { upload: ctx.sock.waUploadToServer }
    );
    const builder = new ButtonV2(ctx.sock)
      .setBody(text)
      .setFooter('Rate card 1% • artifact 8%')
      .setMedia({ headerType: 4, imageMessage })
      .addButton('🎰 GACHA 1', '.gacha 1')
      .addButton('🎰 GACHA 10', '.gacha 10');
    return builder.send(ctx.jid);
  } catch {
    return ctx.reply(text);
  }
}

function formatResults(results) {
  const lines = results.map((r, i) => {
    if (r.type === 'zonk') return `${i + 1}. ❌ Zonk`;
    if (r.type === 'artifact')
      return `${i + 1}. 🧿 Artifact #${r.artifact.user_id}`;
    if (r.type === 'card')
      return `${i + 1}. 🃏 Main Card *${r.card.name}* (Lv.5)`;
    if (r.type === 'item') return `${i + 1}. 🎁 ${r.item.name}`;
    return `${i + 1}. ❓ Unknown`;
  });

  const summary = {};
  for (const r of results) {
    let key;
    if (r.type === 'zonk') key = '❌ Zonk';
    else if (r.type === 'artifact') key = '🧿 Artifact';
    else if (r.type === 'card') key = `🃏 Main Card ${r.card.name}`;
    else if (r.type === 'item') key = `🎁 ${r.item.name}`;
    else key = '❓ Unknown';
    summary[key] = (summary[key] || 0) + 1;
  }

  const summaryLines = Object.entries(summary).map(
    ([name, qty]) => `• ${name} ×${qty}`
  );

  return [
    '🎰 *GACHA RESULT*',
    '',
    ...lines,
    '',
    '🎁 *Total Reward:*',
    ...summaryLines,
  ].join('\n');
}

export default {
  name: 'gacha',
  aliases: ['gacha'],
  category: 'rpg',
  description: 'Gacha item dan artifact',
  cooldown: 60_000,

  async execute(ctx) {
    const rawCount = ctx.args[0];
    const count = Number.parseInt(rawCount, 10);

    try {
      await userModel.ensure(ctx.sender, { pushName: ctx.pushName });

      if (
        !rawCount ||
        !Number.isInteger(count) ||
        (count !== 1 && count !== 10)
      ) {
        return ctx.fail(
          'Masukkan jumlah gacha: 1 atau 10.\nContoh: `.gacha 1` atau `.gacha 10`'
        );
      }

      await ctx.reply('🌠 Sedang melakukan gacha...');

      await sleep(1200);

      const requestKey = ctx.raw?.key?.id
        ? `gacha:${ctx.sender}:${ctx.raw.key.id}`
        : null;
      const results = await gacha.pull(ctx.sender, count, requestKey);
      return sendGachaResult(ctx, results);
    } catch (error) {
      return ctx.fail(error.message);
    }
  },
};
