import { cardService as cards } from '#features/rpg/card.js';
import { userModel } from '#storage/models/index.js';
import { F } from '#helpers/index.js';

function typeName(type) {
  return type === 'main' ? 'Main Card' : 'Support Card';
}

function cardLine(card) {
  const stats = cards.calculateStats(card);
  const equipped = card.equipped ? ' *[Equipped]*' : '';
  const statText =
    card.type === 'main'
      ? ` | ❤️${stats.hp} ⚔️${stats.atk} 🛡️${stats.def}`
      : '';
  return `#${card.id}. *${card.name}* (${card.role}) Lv.${card.level}${statText}${equipped}`;
}

async function collectionText(jid, type) {
  const collection = await cards.getCards(jid, type);
  if (!collection.length) return `Kamu belum memiliki ${typeName(type)}.`;
  return [
    `*${typeName(type).toUpperCase()}* (${collection.length})`,
    '',
    ...collection.map(cardLine),
    '',
    'Gunakan `.card detail <id>` untuk melihat detail.',
  ].join('\n');
}

async function equippedText(jid) {
  const equipped = await cards.getEquipped(jid);
  const byType = Object.fromEntries(equipped.map((card) => [card.type, card]));
  return [
    `🃏 Main: ${byType.main ? `${byType.main.name} #${byType.main.id} Lv.${byType.main.level}` : '-'}`,
    `🎴 Support: ${byType.support ? `${byType.support.name} #${byType.support.id} Lv.1` : '-'}`,
  ].join('\n');
}

async function detailText(jid, id) {
  const card = await cards.getCard(jid, id);
  if (!card) throw new Error('Card tidak ditemukan.');
  const owned = await cards.getCards(jid, card.type);
  const current = owned.find((item) => item.id === card.id);
  const stats = cards.calculateStats(card);
  const passiveUnlocked = card.type === 'support' || card.level >= 50;
  const cost = card.type === 'main' ? cards.getUpgradeCost(card.level) : null;
  const lines = [
    `*${card.name}* #${card.id}`,
    `Type: ${typeName(card.type)}`,
    `Role: ${card.role}`,
    `Level: ${card.level}/${card.max_level}`,
  ];
  if (card.type === 'main') {
    lines.push(`HP: ${stats.hp}`, `ATK: ${stats.atk}`, `DEF: ${stats.def}`);
  }
  lines.push(
    `Passive: ${passiveUnlocked ? '*Unlocked*' : '*Locked sampai Lv.50*'}`,
    cards.passiveDescription(card),
    `Status: ${current?.equipped ? '*Equipped*' : 'Tidak dipasang'}`
  );
  if (cost) {
    lines.push(
      `Upgrade: 🪙${F.formatNumber(cost.coin)} + ${cost.material} Card Core`
    );
  } else if (card.type === 'main') {
    lines.push('Upgrade: MAX');
  } else {
    lines.push('Support Card tidak dapat di-upgrade.');
  }
  return lines.join('\n');
}

function parseId(value) {
  const id = Number.parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export default {
  name: 'card',
  aliases: ['cards', 'kartu'],
  category: 'rpg',
  description: 'Kelola Main Card dan Support Card',
  cooldown: 5_000,

  async execute(ctx) {
    const sub = ctx.args[0]?.toLowerCase() || '';
    try {
      await userModel.ensure(ctx.sender, { pushName: ctx.pushName });

      if (sub === 'main' || sub === 'support') {
        return ctx.reply(await collectionText(ctx.sender, sub));
      }

      if (sub === 'detail') {
        const id = parseId(ctx.args[1]);
        if (!id) return ctx.fail('Gunakan `.card detail <id>`.');
        return ctx.reply(await detailText(ctx.sender, id));
      }

      if (sub === 'equip') {
        const id = parseId(ctx.args[1]);
        if (!id) return ctx.fail('Gunakan `.card equip <id>`.');
        const card = await cards.equip(ctx.sender, id);
        return ctx.reply(
          `✅ ${typeName(card.type)} *${card.name}* berhasil dipasang.`
        );
      }

      if (sub === 'unequip') {
        const slot = ctx.args[1]?.toLowerCase();
        if (!['main', 'support'].includes(slot)) {
          return ctx.fail(
            'Gunakan `.card unequip main` atau `.card unequip support`.'
          );
        }
        const card = await cards.unequip(ctx.sender, slot);
        return ctx.reply(
          `✅ ${typeName(card.type)} *${card.name}* berhasil dilepas.`
        );
      }

      if (sub === 'levelup') {
        const id = parseId(ctx.args[1]);
        if (!id) {
          return ctx.reply(
            'Upgrade Main Card memakai Coin + Card Core.\nGunakan `.card upgrade <id>`.\nCard Core hanya tersedia di `.raidshop`.'
          );
        }
        const result = await cards.upgrade(ctx.sender, id);
        const next = cards.getUpgradeCost(result.card.level);
        return ctx.reply(
          [
            `✅ *${result.card.name}* naik ke *Lv.${result.card.level}*!`,
            `Terpakai: 🪙${F.formatNumber(result.cost.coin)} + ${result.cost.material} Card Core`,
            next
              ? `Berikutnya: 🪙${F.formatNumber(next.coin)} + ${next.material} Card Core`
              : 'Level maksimum tercapai.',
            result.card.level === 50 ? 'Passive berhasil dibuka!' : '',
          ]
            .filter(Boolean)
            .join('\n')
        );
      }

      const equipped = await equippedText(ctx.sender);
      return ctx.reply(
        [
          '╭──── 🃏 *CARD SYSTEM* ────╮',
          '',
          equipped,
          '',
          '*Perintah:*',
          '• `.card` main - Lihat koleksi Main Card',
          '• `.card` support - Lihat koleksi Support Card',
          '• `.card` detail <id> - Lihat detail Card',
          '• `.card` equip <id> - Pasang Card',
          '• `.card` unequip <main|support> - Lepas Card',
          '• `.card` levelup <id> - Upgrade Main Card',
        ].join('\n')
      );
    } catch (error) {
      return ctx.fail(error.message);
    }
  },
};
