import { inventoryService } from '#features/rpg/services/inventory-service.js';
import { shopService } from '#features/rpg/services/shop-service.js';

export function formatInventory(rows) {
  if (!rows.length) return '🎒 *INVENTORY*\n\nInventory kosong.';
  const lines = ['🎒 *INVENTORY*', ''];
  for (const row of rows) {
    const item = shopService.getShopItem(row.item_id);
    const name = item ? item.name : `Unknown Item (${row.item_id})`;
    lines.push(`🧪 ${name} × ${row.quantity}`);
  }
  return lines.join('\n');
}

export default {
  name: 'inventory',
  aliases: ['inv', 'tas'],
  category: 'rpg',
  description: 'Lihat inventory RPG kamu',
  cooldown: 3_000,

  async execute(ctx) {
    try {
      const rows = await inventoryService.getInventory(ctx.sender);
      await ctx.reply(formatInventory(rows));
    } catch (err) {
      await ctx.reply(`Gagal membuka inventory: ${err.message}`);
    }
  },
};
