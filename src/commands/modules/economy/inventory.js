import { inventoryModel } from '#storage/models/index.js';
import { F } from '#helpers/index.js';

const RARITY_EMOJI = {
  common: '⬜',
  uncommon: '🟩',
  rare: '🟦',
  epic: '🟪',
  legendary: '🟨',
};

export default {
  name: 'inventory',
  aliases: ['inv', 'item', 'items'],
  category: 'economy',
  description: 'Lihat item yang kamu punya',
  cooldown: 5_000,

  async execute(ctx) {
    const items = await inventoryModel.getAll(ctx.sender);
    if (!items.length) return ctx.reply('📦 Inventory kosong.');

    const catOrder = [
      'consumable',
      'material',
      'special',
    ];
    const grouped = items.reduce((acc, i) => {
      const cat = i.category || 'misc';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(i);
      return acc;
    }, {});

    let text = `📦 *Inventory* (${items.length} item)\n\n`;
    for (const cat of catOrder) {
      if (!grouped[cat]) continue;
      text += `*[${cat.toUpperCase()}]*\n`;
      for (const i of grouped[cat]) {
        const emoji = RARITY_EMOJI[i.rarity] ?? '⬜';
        text += `  ${emoji} *${i.name}* ×${i.quantity} \`${i.item_id}\`\n`;
      }
      text += '\n';
    }

    for (const [cat, list] of Object.entries(grouped)) {
      if (catOrder.includes(cat)) continue;
      text += `*[${cat.toUpperCase()}]*\n`;
      for (const i of list) text += `  *${i.name}* ×${i.quantity} \`${i.item_id}\`\n`;
    }

    await ctx.reply(text.trimEnd());
  },
};
