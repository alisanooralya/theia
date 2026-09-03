import { marketService } from '#features/economy/market.js';
import { userModel } from '#storage/models/index.js';

function money(value) {
  return Number(value).toLocaleString('id-ID');
}

function signed(value) {
  const num = Number(value);
  return `${num >= 0 ? '+' : '-'}${money(Math.abs(num))}`;
}

function emptyView(cash) {
  return [
    '╭── 💼 PORTFOLIO ──╮',
    '',
    'Belum ada komoditas.',
    '',
    `🪙 Coin: ${money(cash)}`,
    '',
  ].join('\n');
}

export default {
  name: 'portfolio',
  aliases: ['porto', 'aset'],
  category: 'economy',
  description: 'Lihat aset & profit/loss kamu',
  cooldown: 5_000,

  async execute(ctx) {
    await userModel.ensure(ctx.sender, { pushName: ctx.pushName });
    const data = await marketService.portfolio(ctx.sender);

    if (!data.items.length) return ctx.reply(emptyView(data.cash));

    const lines = ['╭── 💼 PORTFOLIO ──╮', ''];

    for (const item of data.items) {
      const sign = item.profitPercent >= 0 ? '+' : '';
      const percent = `${sign}${item.profitPercent.toFixed(1)}%`;
      const label = item.profit >= 0 ? 'Profit' : 'Loss';
      lines.push(
        `${item.emoji} ${item.name} x${money(item.quantity)}`,
        `Avg: ${money(item.avgCost)}`,
        `Now: ${money(item.price)}`,
        `${label}: ${signed(item.profit)} (${percent})`,
        ''
      );
    }

    lines.push(
      'Modal',
      `🪙 ${money(data.invested)}`,
      '',
      `Unrealized P/L: ${signed(data.unrealized)}`,
      `Realized P/L: ${signed(data.realized)}`,
      '',
      'Total Asset',
      `🪙 ${money(data.marketValue)}`,
      '',
      `💰 Coin: ${money(data.cash)}`,
      `📊 Net worth: ${money(data.totalAsset)}`,
    );

    return ctx.reply(lines.join('\n'));
  },
};
