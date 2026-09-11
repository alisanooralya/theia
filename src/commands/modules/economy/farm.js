import { F } from '#helpers/index.js';
import { farmService } from '#features/economy/services/farm-service.js';
import { getFarmCrops } from '#features/economy/config/farm-config.js';

function cropChoices() {
  return getFarmCrops()
    .map((c) => `${c.aliases[0]}`)
    .join(', ');
}

function marketLines(market) {
  return market.map(
    (m) =>
      `${m.crop.emoji} *${m.crop.harvestName}* — ${m.demand.emoji} (F: ${m.forecast.label}) — ${F.formatNumber(m.price)}/pcs`
  );
}

function statusView(state) {
  const lines = ['🌾 *FARM*', ''];
  if (!state.plot) {
    lines.push(
      '🟫 Lahan kosong.',
      '',
      `Tanam: \`.farm\` plant <tanam> (${cropChoices()})`
    );
  } else {
    const p = state.plot;
    lines.push(
      `${p.crop.emoji} *${p.crop.harvestName}* ×${p.quantity}`,
      p.mature
        ? '✅ Siap panen! Ketik `.farm harvest`'
        : `⏳ Matang dalam ${F.formatDuration(p.remainingMs)}`
    );
  }
  lines.push('', '📊 *Farm Market*', ...marketLines(state.market));
  return lines.join('\n');
}

function marketView(market) {
  const lines = ['📊 *FARM MARKET*', ''];
  for (const m of market) {
    lines.push(
      `${m.crop.emoji} *${m.crop.harvestName}*`,
      `Demand: ${m.demand.emoji} ${m.demand.label}`,
      `Forecast: ${m.forecast.emoji} ${m.forecast.label}`,
      `Trend: ${m.trend}`,
      `Harga jual: ${F.formatNumber(m.price)} Coin/pcs`,
      ''
    );
  }
  lines.push('_Forecast tidak menjamin demand masa depan._');
  return lines.join('\n');
}

export default {
  name: 'farm',
  aliases: ['kebun'],
  category: 'economy',
  description: 'Berkebun: tanam, panen, dan jual hasil panen',
  cooldown: 0,

  async execute(ctx) {
    const [subRaw, arg1, arg2] = ctx.args ?? [];
    const sub = (subRaw ?? '').toLowerCase();
    try {
      if (sub === 'plant') {
        if (!arg1) return ctx.fail(`Pilih crop: ${cropChoices()}`);
        const result = await farmService.plant(ctx.sender, arg1.toLowerCase());
        return ctx.reply(
          `🌱 Menanam *${result.crop.harvestName}* ×${result.quantity}\n⏳ Matang dalam ${F.formatDuration(result.crop.growthMs)}`
        );
      }
      if (sub === 'harvest') {
        const result = await farmService.harvest(ctx.sender);
        return ctx.reply(
          `🧺 Panen *${result.crop.harvestName}* ×${result.quantity} masuk Inventory!`
        );
      }
      if (sub === 'sell') {
        if (!arg1) return ctx.fail(`Pilih crop: ${cropChoices()}`);
        const qty = arg2 === undefined ? 1 : Number(arg2);
        const result = await farmService.sell(
          ctx.sender,
          arg1.toLowerCase(),
          qty
        );
        return ctx.reply(
          `💰 Terjual *${result.crop.harvestName}* × ${result.quantity} @ ${F.formatNumber(result.price)} = 🪙 +${F.formatNumber(result.total)} Coin`
        );
      }
      if (sub === 'market') {
        const state = await farmService.status(ctx.sender);
        return ctx.reply(marketView(state.market));
      }
      if (sub && sub !== 'status') {
        return ctx.fail(
          `Pakai: \`.farm\`, \`.farm\` plant <tanam>, \`.farm\` harvest, \`.farm\` sell <tanam> <qty>, \`.farm\` market`
        );
      }
      const state = await farmService.status(ctx.sender);
      return ctx.reply(statusView(state));
    } catch (err) {
      if (err.code === 'NOT_MATURE') {
        return ctx.fail(
          `⏳ Belum matang. Sisa ${F.formatDuration(err.remainingMs ?? 0)}`
        );
      }
      await ctx.fail(err.message);
    }
  },
};
