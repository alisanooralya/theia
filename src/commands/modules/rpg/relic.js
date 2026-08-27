import { relicService as relic } from '#features/rpg/relic.js';
import { relicModel } from '#storage/models/index.js';
import { F } from '#helpers/index.js';

function relicListText(jid) {
  const relics = relic.getRelics(jid);
  if (!relics.length) return 'Kamu belum memiliki relic. Dapatkan dengan menyelesaikan Divergent Universe.';
  const lines = relics.map((r, i) => {
    const formatted = relic.formatRelic(r);
    const equipped = relicModel.isEquipped(r.id) ? ' *[Equipped]*' : '';
    const substats = formatted.substats.length ? '\n' + formatted.substats.join('\n') : '';
    return `${i + 1} *[${formatted.slot}]* Lv.${r.level} - ${formatted.mainStat}${equipped}${substats}`;
  });
  return `⌁ *RELIC COLLECTION*\n\n${lines.join('\n')}`;
}

function relicDetailText(relicData) {
  return relic.formatRelicFull(relicData);
}

function inventoryText(jid) {
  const inv = relic.getInventory(jid);
  const stats = relic.getEquippedStats(jid);
  const lines = ['head', 'hands', 'body', 'feet'].map((slot) => {
    const relicId = inv?.[`${slot}_id`];
    if (!relicId) return `  ${slot}: *Kosong*`;
    const r = relicModel.find(relicId);
    if (!r) return `  ${slot}: *Kosong*`;
    const formatted = relic.formatRelic(r);
    return `  ${slot}: *Lv.${r.level}* - ${formatted.mainStat}`;
  });
  const statLines = [];
  if (stats) {
    if (stats.hp_flat > 0) statLines.push(`  HP: +${stats.hp_flat}`);
    if (stats.atk_flat > 0) statLines.push(`  ATK: +${stats.atk_flat}`);
    if (stats.crit_rate > 0) statLines.push(`  Crit Rate: +${(stats.crit_rate / 10).toFixed(1)}%`);
    if (stats.hp_percent > 0) statLines.push(`  HP%: +${(stats.hp_percent / 10).toFixed(1)}%`);
    if (stats.def_percent > 0) statLines.push(`  DEF%: +${(stats.def_percent / 10).toFixed(1)}%`);
    if (stats.spd_flat > 0) statLines.push(`  SPD: +${stats.spd_flat}`);
  }
  return [
    '⌁ *EQUIPPED RELICS*',
    '',
    ...lines,
    '',
    statLines.length ? '*Total Stats:*' : '',
    ...statLines,
    statLines.length ? '' : '',
    'Gunakan `.relic equip <nomor>` untuk memasang relic.',
    'Gunakan `.relic unequip <slot>` untuk melepas relic.',
  ].filter((line) => line !== undefined).join('\n');
}

function helpText() {
  return [
    '⌁ *RELIC SYSTEM - BANTUAN*',
    '',
    '`.relic list` - lihat semua relic',
    '`.relic equip <nomor>` - pasang relic ke slot',
    '`.relic unequip <slot>` - lepas relic dari slot (head/hands/body/feet)',
    '`.relic inventory` - lihat relic terpasang dan stats',
    '`.relic detail <id>` - lihat detail relic',
    '`.relic levelup <id>` - naikkan level relic',
    '`.relic smelt <id>` - lebur relic untuk dapat koin/cerelia',
    '',
    '*Slot Relic:*',
    '- *Head:* HP flat (+5 Lv.1, +20 Lv.15)',
    '- *Hands:* ATK flat (+2 Lv.1, +8 Lv.15)',
    '- *Body:* Crit Rate / HP% / DEF%',
    '- *Feet:* SPD flat / DEF% / HP%',
    '',
    '*Leveling:*',
    '- Setiap level membutuhkan koin',
    '- Level 1-4, 6-9, 11-14: koin + Cerelia',
    '- Level 5, 10, 15: koin + EXP user (tanpa Cerelia)',
    '- Pada kelipatan 5, salah satu substat akan di-upgrade',
    '',
    '*Drop:*',
    '- Easy: 30% chance dapat 1 relic',
    '- Medium: garansi 1, 10% chance dapat 2',
    '- Hard: 50% chance dapat 2 relic',
    '',
    '*Lebur (Smelt):*',
    '- Lv.1-5: koin saja (Lv × 200)',
    '- Lv.6-14: koin + 1 Cerelia',
    '- Lv.15: koin + 2 Cerelia',
    '',
    '*Cerelia* adalah Divergent Universe Core yang didapat dari menyelesaikan DU.',
  ].join('\n');
}

export default {
  name: 'relic',
  aliases: ['reliks', 'equipment'],
  category: 'rpg',
  description: 'Kelola relic untuk meningkatkan stat di Divergent Universe',
  cooldown: 2_000,

  async execute(ctx) {
    const sub = ctx.args[0]?.toLowerCase() || 'help';

    try {
      if (sub === 'help' || sub === 'bantuan') {
        return ctx.reply(helpText());
      }

      if (sub === 'list' || sub === 'listrik') {
        return ctx.reply(relicListText(ctx.sender));
      }

      if (sub === 'inventory' || sub === 'inv' || sub === 'equipped') {
        return ctx.reply(inventoryText(ctx.sender));
      }

      if (sub === 'equip' || sub === 'pasang') {
        const id = Number.parseInt(ctx.args[1], 10);
        if (!id) return ctx.fail('Masukkan ID relic. Gunakan `.relic list` untuk melihat ID.');
        const equipped = relic.equip(id, ctx.sender);
        const formatted = relic.formatRelic(equipped);
        return ctx.reply(`Relic *${formatted.slot}* Lv.${equipped.level} berhasil dipasang!`);
      }

      if (sub === 'unequip' || sub === 'lepas') {
        const slot = ctx.args[1]?.toLowerCase();
        if (!slot || !['head', 'hands', 'body', 'feet'].includes(slot)) {
          return ctx.fail('Masukkan slot: head, hands, body, atau feet.');
        }
        const removed = relic.unequip(slot, ctx.sender);
        const formatted = relic.formatRelic(removed);
        return ctx.reply(`Relic *${formatted.slot}* Lv.${removed.level} berhasil dilepas!`);
      }

      if (sub === 'detail' || sub === 'info') {
        const id = Number.parseInt(ctx.args[1], 10);
        if (!id) return ctx.fail('Masukkan ID relic.');
        const r = relicModel.find(id);
        if (!r) return ctx.fail('Relic tidak ditemukan.');
        if (r.owner_jid !== ctx.sender) return ctx.fail('Relic bukan milikmu.');
        return ctx.reply(relicDetailText(r));
      }

      if (sub === 'levelup' || sub === 'lvl' || sub === 'upgrade') {
        const id = Number.parseInt(ctx.args[1], 10);
        if (!id) return ctx.fail('Masukkan ID relic.');
        const r = relicModel.find(id);
        if (!r) return ctx.fail('Relic tidak ditemukan.');
        if (r.owner_jid !== ctx.sender) return ctx.fail('Relic bukan milikmu.');
        const leveled = relic.levelUp(id, ctx.sender);
        const formatted = relic.formatRelic(leveled);
        const cost = relic.getLevelUpCost(leveled);
        const nextCost = cost ? `\nNext level: ${cost.coins} koin${cost.cerelia > 0 ? ` + ${cost.cerelia} Cerelia` : ''}${cost.userExp > 0 ? ` + ${cost.userExp} EXP` : ''}` : '';
        return ctx.reply(`Relic berhasil di-upgrade ke *Lv.${leveled.level}*!\n${formatted.mainStat}${nextCost}`);
      }

      if (sub === 'smelt' || sub === 'lebur') {
        const id = Number.parseInt(ctx.args[1], 10);
        if (!id) return ctx.fail('Masukkan nomor relic. Gunakan `.relic list` untuk melihat nomor.');
        const result = relic.smelt(id, ctx.sender);
        const formatted = relic.formatRelic(result.relic);
        let text = `Relic *${formatted.slot}* Lv.${result.relic.level} berhasil dilebur!\n`;
        text += `+${result.coins} koin`;
        if (result.cerelia > 0) text += `\n+${result.cerelia} Cerelia`;
        return ctx.reply(text);
      }

      return ctx.reply('Subcommand tidak dikenal. Ketik `.relic` untuk bantuan.');
    } catch (error) {
      return ctx.fail(error.message);
    }
  },
};
