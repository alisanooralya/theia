import { F } from '#helpers/index.js';
import { cardService } from '#features/rpg/services/card-service.js';

function formatCooldown(ms) {
  return `${Number((ms / 1000).toFixed(2))}s`;
}

export function formatMainCards(cards) {
  const lines = ['🎴 *YOUR CARDS*', '', '*Main Card:*'];
  if (!cards.length) {
    lines.push('Belum ada Main Card. Dapatkan dari .gacha');
    return lines.join('\n');
  }
  cards.forEach((card, i) => {
    const active = card.definition.active;
    const passive = card.definition.passive;
    const activeStatus = !card.skills.active.unlocked
      ? `(*unlocks* at lv.${active.unlockLevel})`
      : card.skills.active.upgraded
        ? '(*upgrade*)'
        : '(*unlocked*)';
    const passiveStatus = !card.skills.passive.unlocked
      ? `(*unlocks* at lv.${passive.unlockLevel})`
      : card.skills.passive.upgraded
        ? '(*upgrade*)'
        : '(*unlocked*)';
    lines.push(
      '',
      `#${i + 1} *${card.definition.name}* - Lv.${card.level}`,
      `${card.equipped ? 'Equipped' : 'Not Equipped'}`,
      '',
      `⚡ Active ${active.name} (cd: ${formatCooldown(active.cooldownMs)})`,
      `${active.description} ${activeStatus}`,
      `✨ Passive ${passive.name}`,
      `${passive.description} ${passiveStatus}`
    );
  });
  return lines.join('\n');
}

export function formatSignCards(cards) {
  const lines = ['✨ *SIGN CARDS*', ''];
  if (!cards.length) {
    lines.push('Belum ada Sign Card.');
    return lines.join('\n');
  }
  cards.forEach((card, i) => {
    const passive = card.definition.passive;
    lines.push(
      '',
      `#${i + 1}. *${card.definition.name}* - Lv.${card.level}`,
      `${card.equipped ? 'Equipped' : 'Not Equipped'}`,
      `✨ Passive ${passive.name}`,
      `${passive.description} (${card.signCompatible ? '*active*' : '*inactive*'})`
    );
    if (card.equipped && !card.signCompatible) {
      lines.push('Reason: Incompatible with equipped Main Card');
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

export function formatLevelUp(result) {
  const lines = ['🎴 *CARD LEVEL UP*', '', result.name];
  if (result.maxed) {
    lines.push(
      `Lv.${result.level}`,
      '',
      '✨ Card sudah mencapai level maksimum.'
    );
    return lines.join('\n');
  }
  if (!result.leveled) {
    lines.push(
      `Lv.${result.level} → Lv.${result.level}`,
      '',
      '❌ Resource tidak cukup untuk level berikutnya.'
    );
    return lines.join('\n');
  }
  lines.push(
    `Lv.${result.fromLevel} → Lv.${result.toLevel}`,
    '',
    `💰 Coin: -${F.formatNumber(result.cost.coin)}`,
    `🔹 Cerelia: -${F.formatNumber(result.cost.cerelia)}`,
    '',
    '✨ Level Up berhasil!'
  );
  return lines.join('\n');
}

async function levelUpSlot(ctx, kind) {
  const result = await cardService.autoLevelUp(ctx.sender, kind);
  await ctx.reply(formatLevelUp(result));
}

export async function executeCard(ctx) {
  const [sub, ...rest] = (ctx.args ?? []).map((a) => a.toLowerCase());
  try {
    if (!sub) {
      await showMain(ctx);
      return;
    }
    if (sub === 'sign') {
      const [action, id, ...extra] = rest;
      if (!action) {
        await showSign(ctx);
        return;
      }
      if (action === 'levelup') {
        if (id ?? extra.length) {
          await ctx.fail('Usage: `.card` sign levelup');
          return;
        }
        await levelUpSlot(ctx, 'sign');
        return;
      }
      if (action === 'equip') {
        if (!id) {
          await ctx.fail('Usage: `.card` sign equip <sign_id>');
          return;
        }
        const card = await cardService.equipSignCard(ctx.sender, id);
        await ctx.reply(
          `✅ *${card.definition.name}* equipped.\n` +
            (card.signCompatible
              ? '✅ Passive: Active'
              : '⛔ Passive: Inactive')
        );
        return;
      }
      if (action === 'unequip') {
        const card = await cardService.unequip(ctx.sender, 'sign');
        await ctx.reply(
          card
            ? `✅ *${card.definition.name}* unequipped.`
            : 'Tidak ada Sign Card yang equipped.'
        );
        return;
      }
      await ctx.fail(
        'Usage:\n`.card` sign\n`.card` sign equip <id>\n`.card` sign unequip\n`.card` sign levelup'
      );
      return;
    }
    if (sub === 'levelup') {
      const [extra] = rest;
      if (extra) {
        await ctx.fail('Usage: `.card` levelup');
        return;
      }
      await levelUpSlot(ctx, 'main');
      return;
    }
    if (sub === 'equip') {
      const [id] = rest;
      if (!id) {
        await ctx.fail('Usage: `.card` equip <card_id>');
        return;
      }
      const card = await cardService.equipMainCard(ctx.sender, id);
      await ctx.reply(`✅ *${card.definition.name}* equipped.`);
      return;
    }
    if (sub === 'unequip') {
      const card = await cardService.unequip(ctx.sender, 'main');
      await ctx.reply(
        card
          ? `✅ *${card.definition.name}* unequipped.`
          : 'Tidak ada Main Card yang equipped.'
      );
      return;
    }
    await ctx.fail(
      'Usage:\n`.card`\n`.card` equip <id>\n`.card` unequip\n`.card` levelup\n`.card` sign\n`.card` sign equip <id>\n`.card` sign unequip\n`.card` sign levelup'
    );
  } catch (err) {
    await ctx.fail(err.message);
  }
}

export default {
  name: 'card',
  aliases: ['cards', 'kartu'],
  category: 'rpg',
  description: 'Lihat dan equip Main/Sign Card',
  cooldown: 5_000,

  async execute(ctx) {
    await executeCard(ctx);
  },
};
