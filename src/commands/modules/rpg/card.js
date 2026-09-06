import { cardService as cards } from '#features/rpg/card.js';
import { cardArtPath } from '#features/rpg/card-config.js';
import { userModel } from '#storage/models/index.js';
import { F } from '#helpers/index.js';

function typeName(type) {
  return type === 'main' ? 'Main Card' : 'Support Card';
}

function cardLine(card, index) {
  const stats = cards.calculateStats(card);
  const equipped = card.equipped ? ' *[Equipped]*' : '';

  if (card.type === 'support') {
    return `#${index + 1}. *${card.name}* (${card.role}) Lv.${card.level}${equipped}`;
  }
  return `*${card.name}* (${card.role}) Lv.${card.level}${equipped}`;
}

async function collectionText(jid) {
  const [mains, supports] = await Promise.all([
    cards.getCards(jid, 'main'),
    cards.getCards(jid, 'support'),
  ]);
  if (!mains.length && !supports.length) return 'Kamu belum memiliki Card.';
  const lines = [`*KOLEKSI CARD* (${mains.length + supports.length})`, ''];
  lines.push(`🃏 *MAIN CARD* (${mains.length})`, '');
  if (mains.length) lines.push(...mains.map((card) => cardLine(card)));
  else lines.push('-');
  lines.push('', `🎴 *SUPPORT CARD* (${supports.length})`, '');
  if (supports.length) {
    lines.push(...supports.map((card, i) => cardLine(card, i)));
  } else {
    lines.push('-');
  }
  lines.push(
    '',
    'Gunakan `.card` detail <nama|id> untuk melihat detail.',
    '(main pakai nama, support pakai id)'
  );
  return lines.join('\n');
}

async function equippedText(jid) {
  const [equipped, supports] = await Promise.all([
    cards.getEquipped(jid),
    cards.getCards(jid, 'support'),
  ]);
  const byType = Object.fromEntries(equipped.map((card) => [card.type, card]));
  const supportPos = byType.support
    ? supports.findIndex((c) => c.id === byType.support.id) + 1
    : 0;
  return [
    `🃏 Main: ${byType.main ? `${byType.main.name} Lv.${byType.main.level}` : '-'}`,
    `🎴 Support: ${byType.support ? `${byType.support.name} #${supportPos} Lv.1` : '-'}`,
  ].join('\n');
}

async function detailText(jid, query) {
  const card = await resolveCard(jid, query);
  if (!card) throw new Error('Card tidak ditemukan.');

  const owned = await cards.getCards(jid, card.type);
  const current = owned.find((item) => item.id === card.id);
  const stats = cards.calculateStats(card);
  const passiveUnlocked = card.type === 'support' || card.level >= 50;
  const cost = card.type === 'main' ? cards.getUpgradeCost(card.level) : null;
  const pos = owned.findIndex((item) => item.id === card.id) + 1;
  const title =
    card.type === 'support' ? `*${card.name}* #${pos}` : `*${card.name}*`;
  const lines = [
    title,
    '',
    `Type: ${typeName(card.type)}`,
    `Role: ${card.role}`,
    `Level: ${card.level}/${card.max_level}`,
    '',
  ];

  if (card.type === 'main') {
    lines.push(`HP: ${stats.hp}  ATK: ${stats.atk}  DEF: ${stats.def}`);
  }

  lines.push(
    `Passive: ${passiveUnlocked ? cards.passiveDescription(card) : '*Locked sampai Lv.50*'}`,
    '',
    `Status: ${current?.equipped ? '*Equipped*' : 'Tidak dipasang'}`
  );

  return { text: lines.join('\n'), card };
}

function parseId(value) {
  const id = Number.parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

async function resolveCard(jid, query) {
  const pos = parseId(query);
  if (pos) {
    const supports = await cards.getCards(jid, 'support');
    return supports[pos - 1] ?? null;
  }
  const q = String(query ?? '')
    .trim()
    .toLowerCase();
  if (!q) return null;
  const mains = await cards.getCards(jid, 'main');
  return (
    mains.find(
      (c) => c.card_id?.toLowerCase() === q || c.name?.toLowerCase() === q
    ) ?? null
  );
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

      if (sub === 'list') {
        return ctx.reply(await collectionText(ctx.sender));
      }

      if (sub === 'detail') {
        const query = ctx.args[1];
        if (!query) return ctx.fail('Gunakan `.card` detail <nama|id>');

        const { text, card } = await detailText(ctx.sender, query);
        const artPath = cardArtPath(card.card_id);

        if (!artPath) return ctx.reply(text);
        return ctx.reply({ image: { url: artPath }, caption: text });
      }

      if (sub === 'equip') {
        const query = ctx.args[1];
        if (!query) return ctx.fail('Gunakan `.card` equip <nama|id>');

        const target = await resolveCard(ctx.sender, query);
        if (!target) return ctx.fail('Card tidak ditemukan.');

        const card = await cards.equip(ctx.sender, target.id);
        return ctx.reply(
          `✅ ${typeName(card.type)} *${card.name}* berhasil dipasang.`
        );
      }

      if (sub === 'unequip') {
        const slot = ctx.args[1]?.toLowerCase();
        if (!['main', 'support'].includes(slot)) {
          return ctx.fail(
            'Gunakan `.card` unequip main atau `.card` unequip support.'
          );
        }
        const card = await cards.unequip(ctx.sender, slot);
        return ctx.reply(
          `✅ ${typeName(card.type)} *${card.name}* berhasil dilepas.`
        );
      }

      if (sub === 'levelup') {
        const query = ctx.args[1];
        if (!query) {
          return ctx.reply(
            'Upgrade Main Card memakai Coin + Card Core.\nGunakan `.card levelup <nama> [jumlah|max]`.\nCard Core hanya tersedia di `.raidshop`.'
          );
        }
        const target = await resolveCard(ctx.sender, query);
        if (!target) return ctx.fail('Card tidak ditemukan.');

        const rawCount = ctx.args[2]?.toLowerCase();
        const count =
          rawCount === 'max' || rawCount === 'all'
            ? 'max'
            : Math.max(1, Number.parseInt(rawCount, 10) || 1);
        const result = await cards.upgradeBulk(ctx.sender, target.id, count);
        const next = cards.getUpgradeCost(result.card.level);
        return ctx.reply(
          [
            `✅ *${result.card.name}* naik ${result.levels} level ke *Lv.${result.card.level}*!`,
            `Terpakai: 🪙${F.formatNumber(result.cost.coin)} + ${result.cost.material} Card Core`,
            next
              ? `Berikutnya: 🪙${F.formatNumber(next.coin)} + ${next.material} Card Core`
              : 'Level maksimum tercapai.',
            result.card.level >= 50 && result.card.level - result.levels < 50
              ? 'Passive berhasil dibuka!'
              : '',
          ]
            .filter(Boolean)
            .join('\n')
        );
      }

      const equipped = await equippedText(ctx.sender);
      return ctx.reply(
        [
          '╭──── 🃏 *CARD* ────╮',
          '',
          equipped,
          '',
          '*Perintah:*',
          '• `.card` list - Lihat semua koleksi Card',
          '• `.card` detail <nama|id> - Lihat detail (main: nama, support: id)',
          '• `.card` equip <nama|id> - Pasang (main: nama, support: id)',
          '• `.card` unequip <main|support> - Lepas Card',
          '• `.card` levelup <nama> [jumlah|max] - Upgrade Main Card',
        ].join('\n')
      );
    } catch (error) {
      return ctx.fail(error.message);
    }
  },
};
