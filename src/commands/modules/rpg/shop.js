import { F } from '#helpers/index.js';
import { shopService } from '#features/rpg/services/shop-service.js';

function formatShopList() {
  const items = shopService.getPurchasableItems();
  const lines = ['🛒 *RPG SHOP*', ''];

  for (const item of items) {
    lines.push(
      `${item.emoji} *${item.name}* (\`${item.id}\`)`,
      item.description,
      `Harga: ${F.formatNumber(item.price)} Coin`,
      ''
    );
  }

  return lines.join('\n');
}

export default {
  name: 'shop',
  aliases: ['toko'],
  category: 'rpg',
  description: 'Lihat dan beli item RPG Shop',
  cooldown: 5_000,

  async execute(ctx) {
    try {
      const [sub, itemId, qtyRaw] = ctx.args;
      if ((sub ?? '').toLowerCase() !== 'buy') {
        await ctx.fail(formatShopList());
        return;
      }

      const quantity = qtyRaw === undefined ? 1 : Number(qtyRaw);
      const result = await shopService.buyItem(
        ctx.sender,
        (itemId ?? '').toLowerCase(),
        quantity
      );

      if (result.card) {
        await ctx.reply(
          `✅ Mendapatkan *${result.card.definition.name}*!\nCek dengan \`.card sign\`.`
        );
        return;
      }
      await ctx.reply(`✅ Membeli *${result.item.name}* × ${result.quantity}`);
    } catch (err) {
      await ctx.fail(err.message);
    }
  },
};
