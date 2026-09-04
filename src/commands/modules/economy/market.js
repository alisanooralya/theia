import { marketService } from '#features/economy/market.js';
import { marketNewsService } from '#features/economy/market-news.js';
import { marketModel } from '#storage/models/market.js';
import { userModel, walletModel } from '#storage/models/index.js';
import { HISTORY_DISPLAY } from '#features/economy/market-config.js';
import { F } from '#helpers/index.js';

function money(value) {
  return Number(value).toLocaleString('id-ID');
}

function signed(value) {
  const num = Number(value);
  return `${num >= 0 ? '+' : '-'}${money(Math.abs(num))}`;
}

function changeLine(changePercent) {
  const pct = Number(changePercent);
  if (Math.abs(pct) < 1) return '➖ Stabil';
  return `${pct > 0 ? '📈' : '📉'} ${pct > 0 ? '+' : ''}${pct.toFixed(0)}%`;
}

function compact(value) {
  const num = Number(value);
  if (Math.abs(num) >= 1_000_000)
    return `${(num / 1_000_000).toFixed(num % 1_000_000 === 0 ? 0 : 1)}m`;
  if (Math.abs(num) >= 1_000)
    return `${(num / 1_000).toFixed(num % 1_000 === 0 ? 0 : 1)}k`;
  return String(num);
}

function eventLines(list) {
  const lines = [];
  const seen = new Set();
  for (const item of list) {
    if (!item.event || seen.has(item.event.id)) continue;
    seen.add(item.event.id);
    lines.push(
      `${item.event.emoji} ${item.event.title}`,
      `_${item.event.hint}_`,
      ''
    );
  }
  return lines;
}

function marketView(list, wallet) {
  const lines = ['╭── 📈 MARKET ──╮', ''];

  for (const item of list) {
    lines.push(
      `${item.emoji} ${item.name}`,
      `💰 ${money(item.price)} ` + changeLine(item.changePercent),
      ''
    );
  }

  lines.push(...eventLines(list));
  lines.push('');

  if (wallet) lines.push(`💰 Coin: *${money(wallet.cash)}*`);
  const countdown = F.formatDuration(marketService.nextUpdateIn());
  lines.push(`⏳ Update harga: ${countdown}`);
  lines.push(
    '',
    `Detail: \`market\` <barang>`,
    `Beli: \`.market\` buy <barang> <jumlah>`,
    `Jual: \`.market\` sell <barang> <jumlah>`,
    `Berita: \`.market\` news`,
    `Aset: \`.aset\``
  );
  return lines.join('\n');
}

function newsView(list) {
  if (!list.length) {
    return ['📰 *MARKET NEWS*', '', 'Belum ada berita pasar.'].join('\n');
  }

  const lines = ['📰 *MARKET NEWS*', ''];
  for (const item of list) {
    lines.push(`${item.emoji} *${item.label}* • ${item.age} lalu`);
    if (item.commodities) lines.push(item.commodities);
    lines.push(item.message, '');
  }
  lines.push('_Berita hanya informasi. Arah harga tetap ditentukan pasar._');
  return lines.join('\n');
}

function detailView(item, holding) {
  const recent = marketService
    .historyTail(item.history, HISTORY_DISPLAY)
    .map(compact)
    .join(' → ');

  const lines = [
    `${item.emoji} *${item.name.toUpperCase()}*`,
    `_${item.character}_`,
    '',
    'Harga: ' + money(item.price),
    'Perubahan: ' +
      `${item.changePercent >= 0 ? '+' : ''}${item.changePercent.toFixed(1)}%`,
    '',
    'Trend: ' + item.trend,
    'Demand ' + item.demand,
    'Supply: ' + item.supply,
  ];

  if (recent) lines.push('', 'Recent', recent);

  if (item.event) {
    lines.push(
      '',
      `${item.event.emoji} ${item.event.title}`,
      `_${item.event.hint}_`
    );
  }

  if (holding?.quantity > 0) {
    const avg = Math.round(holding.total_cost / holding.quantity);
    const profit = item.price * holding.quantity - holding.total_cost;
    lines.push(
      '',
      'Posisi kamu',
      `${money(holding.quantity)} unit • Avg ${money(avg)}`,
      `${profit >= 0 ? 'Profit' : 'Loss'}: ${signed(profit)}`
    );
  }

  lines.push('', `Beli: \`.market\` buy ${item.id} <jumlah>`);
  return lines.join('\n');
}

function tradeLine(result) {
  const { emoji } = result.commodity;
  return `${emoji} ${money(result.quantity)} unit`;
}

function buyView(result) {
  return [
    `✅ *BUY ${result.commodity.name.toUpperCase()}*`,
    '',
    tradeLine(result),
    `🪙 Total: -${money(result.total)}`,
    '',
    `📦 Stok: ${money(result.heldQty)} unit`,
    `📊 Avg cost: ${money(result.avgCost)}`,
    `💰 Sisa Coin: ${money(result.cashLeft)}`,
  ].join('\n');
}

function sellView(result) {
  const label = result.profit >= 0 ? '💚 Profit' : '❤️ Loss';
  return [
    `✅ *SELL ${result.commodity.name.toUpperCase()}*`,
    '',
    tradeLine(result),
    `🪙 Diterima: +${money(result.gross)}`,
    '',
    `📊 Avg cost: ${money(result.avgCost)}`,
    `${label}: ${signed(result.profit)}`,
    `📦 Sisa: ${money(result.remaining)} unit`,
    `💰 Coin: ${money(result.cashLeft)}`,
  ].join('\n');
}

const BUY_WORDS = new Set(['buy', 'beli']);
const SELL_WORDS = new Set(['sell', 'jual']);
const NEWS_WORDS = new Set(['news', 'berita']);
const LIST_WORDS = new Set(['', 'list', 'info']);

const UNKNOWN = `❌ Komoditas tidak dikenal. Lihat daftarnya: \`.market\`.`;

export default {
  name: 'market',
  aliases: ['pasar', 'mkt'],
  category: 'economy',
  description: 'Lihat harga & trading komoditas',
  cooldown: 5_000,

  async execute(ctx) {
    const sub = ctx.args[0]?.toLowerCase() ?? '';

    if (BUY_WORDS.has(sub) || SELL_WORDS.has(sub)) {
      const id = marketService.resolveId(ctx.args[1]);
      if (!id) return ctx.fail(UNKNOWN);

      await userModel.ensure(ctx.sender, { pushName: ctx.pushName });

      try {
        if (BUY_WORDS.has(sub)) {
          const result = await marketService.buy(ctx.sender, id, ctx.args[2]);
          return ctx.reply(buyView(result));
        }
        const result = await marketService.sell(ctx.sender, id, ctx.args[2]);
        return ctx.reply(sellView(result));
      } catch (err) {
        return ctx.fail(err.message);
      }
    }

    if (NEWS_WORDS.has(sub)) {
      const feed = await marketNewsService.feed();
      return ctx.reply(newsView(feed));
    }

    if (!LIST_WORDS.has(sub)) {
      const id = marketService.resolveId(sub);
      if (!id) return ctx.fail(UNKNOWN);
      const item = await marketService.detail(id);
      const holding = await marketModel.getHolding(ctx.sender, id);
      return ctx.reply(detailView(item, holding));
    }

    const list = await marketService.overview();
    const wallet = await walletModel.find(ctx.sender);
    return ctx.reply(marketView(list, wallet));
  },
};
