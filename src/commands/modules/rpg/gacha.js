import { gachaService as gacha } from '#features/rpg/gacha.js';
import { userModel } from '#storage/models/index.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function formatResults(results) {
  const lines = results.map((r, i) => {
    if (r.type === 'zonk') return `${i + 1}. ❌ Zonk`;
    if (r.type === 'artifact')
      return `${i + 1}. 🧿 Artifact #${r.artifact.user_id}`;
    if (r.type === 'item') return `${i + 1}. 🎁 ${r.item.name}`;
    return `${i + 1}. ❓ Unknown`;
  });

  const summary = {};
  for (const r of results) {
    let key;
    if (r.type === 'zonk') key = '❌ Zonk';
    else if (r.type === 'artifact') key = '🧿 Artifact';
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

      const statusMsg = await ctx.reply('🌠 Sedang melakukan gacha...');

      await sleep(1200);

      const results = await gacha.pull(ctx.sender, count);
      const text = formatResults(results);

      await ctx.sock.sendMessage(ctx.jid, { text, edit: statusMsg.key });
    } catch (error) {
      return ctx.fail(error.message);
    }
  },
};
