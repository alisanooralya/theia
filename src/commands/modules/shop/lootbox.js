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
    const raw = ctx.args[0]?.toLowerCase();
    let lootboxId = 'lootbox_std';
    if (raw) {
      const alias = {
        std: 'lootbox_std',
        gold: 'lootbox_gold',
        legend: 'lootbox_legend',
        legendary: 'lootbox_legend',
        lootbox_legendary: 'lootbox_legend',
      };
      lootboxId =
        alias[raw] ?? (raw.startsWith('lootbox_') ? raw : `lootbox_${raw}`);
    }

    try {
      const result = lootboxService.open(ctx.sender, lootboxId);
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
