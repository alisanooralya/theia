import { lootboxService } from '#features/economy/lootbox.js';

const RARITY_EMOJI = {
  common: '⬜',
  uncommon: '🟩',
  rare: '🟦',
  epic: '🟪',
  legendary: '🟨',
};

export default {
  name: 'lootbox',
  aliases: ['loot', 'gacha', 'buka'],
  category: 'shop',
  description: 'Buka lootbox untuk dapat item random',
  cooldown: 5_000,

  async execute(ctx) {
    try {
      const result = lootboxService.open(ctx.sender);
      const emoji = RARITY_EMOJI[result.rarity] ?? '🎁';
      const newBadge = result.isNew ? ' 🆕' : '';
      await ctx.reply(
        `🎉 *Lootbox Opened!*\n\n` +
          `${emoji} *${result.item.name}* (${result.rarity})${newBadge}\n` +
          `🪙 +${result.coin} cash\n` +
          `⭐ +${result.exp} EXP`
      );
    } catch (err) {
      await ctx.reply(`❌ ${err.message}`);
    }
  },
};
