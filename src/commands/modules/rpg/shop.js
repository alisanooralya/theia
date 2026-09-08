import { F } from '#helpers/index.js';
import { shopService } from '#features/rpg/services/shop-service.js';

function formatShopList() {
  const items = shopService.getPurchasableItems();
  const lines = ['🛒 *RPG SHOP*', ''];
  for (const item of items) {
    lines.push(
      `🧪 *${item.name}* (\`${item.id}\`)`,
      item.description,
      `💰 ${F.formatNumber(item.price)} Coin`,
      ''
    );
  }
  lines.push('Beli:', '`.shop buy cerelia 5`');
  return lines.join('\n');
}

export default {
  name: 'shop',
  aliases: ['toko', 'rpgshop'],
  category: 'rpg',
  description: 'Lihat dan beli item RPG Shop',
  cooldown: 3_000,

  async execute(ctx) {
    try {
      const [sub, itemId, qtyRaw] = ctx.args;
      if ((sub ?? '').toLowerCase() !== 'buy') {
        await ctx.reply(formatShopList());
        return;
      }
      const quantity = qtyRaw === undefined ? 1 : Number(qtyRaw);
      const result = await shopService.buyItem(ctx.sender, (itemId ?? '').toLowerCase(), quantity);
      await ctx.reply(
        [
          `✅ Membeli *${result.item.name}* × ${result.quantity}`,
          `💰 Total: ${F.formatNumber(result.total)} Coin`,
          `💰 Sisa: ${F.formatNumber(result.coinRemaining)} Coin`,
          `🎒 Inventory: ${result.item.name} × ${result.inventoryQuantity}`,
        ].join('\n')
      );
    } catch (err) {
      await ctx.reply(`Gagal: ${err.message}`);
    }
  },
};
