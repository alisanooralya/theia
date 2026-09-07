import { prepareWAMessageMedia } from 'baileys';
import { gachaService as gacha } from '#features/rpg/gacha.js';
import { renderGachaBanner } from '#features/rpg/gacha-banner.js';
import { cardArtPath, CARD_IMAGE_MAP } from '#features/rpg/card-config.js';
import { userModel } from '#storage/models/index.js';
import { ButtonV2 } from '#messages/builder.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function bannerData() {
  const testId = Object.keys(CARD_IMAGE_MAP)[1];
  return {
    name: 'Haruka',
    subtitle: 'Legendry Card',
    eraLabel: 'MYSTIC VIOLET',
    rateUpText: 'RATE UP',
    description:
      "It's hard sometimes, but I'm glad I can help others. I'm going to keep protecting everyone's hopes and dreams. T-That's why I hope you keep cheering me on...!",
    artPath: cardArtPath(testId),
  };
}

async function sendGachaMenu(ctx) {
  const text = ['🎰 *GACHA*', '', 'Pilih jumlah pull:'].join('\n');
  try {
    const banner = await renderGachaBanner(bannerData());
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
  manualCooldown: true,
  isProblem: true,

  async execute(ctx) {
    const rawCount = ctx.args[0];
    const count = Number.parseInt(rawCount, 10);

    try {
      await userModel.ensure(ctx.sender, { pushName: ctx.pushName });

      if (!rawCount) {
        return sendGachaMenu(ctx);
      }

      if (!Number.isInteger(count) || (count !== 1 && count !== 10)) {
        return ctx.fail(
          'Masukkan jumlah gacha: 1 atau 10.\nContoh: `.gacha 1` atau `.gacha 10`'
        );
      }

      const statusMsg = await ctx.reply('🌠 Sedang melakukan gacha...');
      await ctx.applyCooldown();
      await sleep(1200);

      const requestKey = ctx.raw?.key?.id
        ? `gacha:${ctx.sender}:${ctx.raw.key.id}`
        : null;
      const results = await gacha.pull(ctx.sender, count, requestKey);
      const text = formatResults(results);

      await ctx.sock.sendMessage(ctx.jid, { text, edit: statusMsg.key });
    } catch (error) {
      return ctx.fail(error.message);
    }
  },
};
