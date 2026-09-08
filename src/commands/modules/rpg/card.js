import { cardService } from '#features/rpg/services/card-service.js';

/**
 * `.card` — list/equip/unequip owned cards (thin UI over CardService).
 * Subcommands: (none) | equip <id> | unequip |
 *              sign | sign equip <id> | sign unequip
 */

/** Pure Main Card list renderer. */
export function formatMainCards(cards) {
  const lines = ['🎴 *YOUR CARDS*', '', '*Main Card:*'];
  if (!cards.length) {
    lines.push('Belum ada Main Card. Dapatkan dari `.gacha 1` / `.gacha 10`.');
    return lines.join('\n');
  }
  cards.forEach((card, i) => {
    lines.push(
      '',
      `${i + 1}. ${card.definition.name}`,
      `   Lv.${card.level}`,
      `   ${card.equipped ? '🟢 Equipped' : '⚪ Not Equipped'}`,
      `   Active: ${card.skills.active.unlocked ? (card.skills.active.upgraded ? 'Upgraded' : 'Unlocked') : 'Locked'}`,
      `   Passive: ${card.skills.passive.unlocked ? (card.skills.passive.upgraded ? 'Upgraded' : 'Unlocked') : 'Locked'}`
    );
  });
  return lines.join('\n');
}

/** Pure Sign Card list renderer. */
export function formatSignCards(cards) {
  const lines = ['✨ *SIGN CARDS*', ''];
  if (!cards.length) {
    lines.push('Belum ada Sign Card.');
    return lines.join('\n');
  }
  cards.forEach((card, i) => {
    lines.push(
      '',
      `${i + 1}. ${card.definition.name}`,
      `   Lv.${card.level}`,
      `   ${card.equipped ? '🟢 Equipped' : '⚪ Not Equipped'}`,
      `   Passive: ${card.signCompatible ? 'Active' : 'Inactive'}`
    );
    if (card.equipped && !card.signCompatible) {
      lines.push('   Reason: Incompatible with equipped Main Card');
    }
  });
  return lines.join('\n');
}

async function showMain(ctx) {
  const { main } = await cardService.getOwnedCards(ctx.sender);
  await ctx.reply(formatMainCards(main));
}

async function showSign(ctx) {
  const { sign } = await cardService.getOwnedCards(ctx.sender);
  const equipped = await cardService.getEquippedSignCard(ctx.sender);
  const enriched = sign.map((card) =>
    equipped && equipped.cardId === card.cardId
      ? equipped
      : { ...card, signCompatible: false }
  );
  await ctx.reply(formatSignCards(enriched));
}

export async function executeCard(ctx) {
  const [sub, ...rest] = (ctx.args ?? []).map((a) => a.toLowerCase());
  try {
    if (!sub) {
      await showMain(ctx);
      return;
    }
    if (sub === 'sign') {
      const [action, id] = rest;
      if (!action) {
        await showSign(ctx);
        return;
      }
      if (action === 'equip') {
        if (!id) {
          await ctx.reply('Usage: `.card sign equip <sign_id>`');
          return;
        }
        const card = await cardService.equipSignCard(ctx.sender, id);
        await ctx.reply(
          `✅ ${card.definition.name} Lv.${card.level} equipped.\n` +
            (card.signCompatible
              ? '✅ Passive: Active'
              : '⛔ Passive: Inactive (ATK/DEF tetap aktif)')
        );
        return;
      }
      if (action === 'unequip') {
        const card = await cardService.unequip(ctx.sender, 'sign');
        await ctx.reply(
          card ? `✅ ${card.definition.name} unequipped.` : 'Tidak ada Sign Card yang equipped.'
        );
        return;
      }
      await ctx.reply('Usage: `.card sign` | `.card sign equip <id>` | `.card sign unequip`');
      return;
    }
    if (sub === 'equip') {
      const [id] = rest;
      if (!id) {
        await ctx.reply('Usage: `.card equip <card_id>`');
        return;
      }
      const card = await cardService.equipMainCard(ctx.sender, id);
      await ctx.reply(`✅ ${card.definition.name} Lv.${card.level} equipped.`);
      return;
    }
    if (sub === 'unequip') {
      const card = await cardService.unequip(ctx.sender, 'main');
      await ctx.reply(
        card ? `✅ ${card.definition.name} unequipped.` : 'Tidak ada Main Card yang equipped.'
      );
      return;
    }
    await ctx.reply(
      'Usage: `.card` | `.card equip <id>` | `.card unequip` | `.card sign` | `.card sign equip <id>` | `.card sign unequip`'
    );
  } catch (err) {
    await ctx.reply(`Gagal: ${err.message}`);
  }
}

export default {
  name: 'card',
  aliases: ['cards', 'kartu'],
  category: 'rpg',
  description: 'Lihat dan equip Main/Sign Card',
  cooldown: 3_000,

  async execute(ctx) {
    await executeCard(ctx);
  },
};
