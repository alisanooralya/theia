import { relicService as relic } from '#features/rpg/relic.js';
import { relicModel } from '#storage/models/index.js';
import { F } from '#helpers/index.js';

async function getRelicByIndex(jid, rawIndex) {
  const index = Number.parseInt(rawIndex, 10);
  if (!Number.isInteger(index) || index < 1) return null;
  const relics = await relic.getRelics(jid);
  return relics[index - 1] || null;
}

async function relicListText(jid) {
  const relics = await relic.getRelics(jid);
  if (!relics.length) return 'Kamu belum memiliki relic. Dapatkan dengan menyelesaikan Divergent Universe.';
  const lines = await Promise.all(relics.map(async (r, i) => {
    const formatted = relic.formatRelic(r);
    const equipped = (await relicModel.isEquipped(r.id)) ? ' *[Equipped]*' : '';
    const substats = formatted.substats.length ? '\n' + formatted.substats.join('\n') : '';
    return `${i + 1} *[${formatted.slot}]* Lv.${r.level} - ${formatted.mainStat}${equipped}${substats}`;
  }));
  return `⌁ *RELIC COLLECTION*\n\n${lines.join('\n')}`;
}

async function relicDetailText(relicData) {
  return relic.formatRelicFull(relicData);
}

async function inventoryText(jid) {
  const inv = await relic.getInventory(jid);
  const stats = await relic.getEquippedStats(jid);
  const lines = await Promise.all(['head', 'hands', 'body', 'feet'].map(async (slot) => {
    const relicId = inv?.[`${slot}_id`];
    if (!relicId) return `  ${slot}: *Kosong*`;
    const r = await relicModel.find(relicId);
    if (!r) return `  ${slot}: *Kosong*`;
    const formatted = relic.formatRelic(r);
    return `  ${slot}: *Lv.${r.level}* - ${formatted.mainStat}`;
  }));
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
    'Gunakan `.relic help` untuk bantuan.',
  ].filter((line) => line !== undefined).join('\n');
}

function helpText() {
  return [
    '⌁ *RELIC SYSTEM - BANTUAN*',
    '',
    '`.relic list` - lihat semua relic',
    '`.relic equip <nomor>` - pasang relic ke slot',
    '`.relic unequip <slot>` - lepas relic dari slot (head/hands/body/feet)',
    '`.relic detail <nomor>` - lihat detail relic',
    '`.relic levelup <nomor>` - naikkan level relic',
    '`.relic smelt <nomor>` - lebur relic untuk dapat koin/cerelia',
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
  description: 'Kelola relic Divergent Universe',
  cooldown: 5_000,

  async execute(ctx) {
    const sub = ctx.args[0]?.toLowerCase() || '';

    try {
      if (sub === 'help') {
        return ctx.reply(helpText());
      }

      if (sub === 'list') {
        return ctx.reply(await relicListText(ctx.sender));
      }

      if (sub === 'equip') {
        const target = await getRelicByIndex(ctx.sender, ctx.args[1]);
        if (!target) return ctx.fail('Nomor relic tidak valid. Gunakan `.relic list` untuk melihat nomor.');
        const equipped = await relic.equip(target.id, ctx.sender);
        const formatted = relic.formatRelic(equipped);
        return ctx.reply(`Relic *${formatted.slot}* Lv.${equipped.level} berhasil dipasang!`);
      }

      if (sub === 'unequip') {
        const slot = ctx.args[1]?.toLowerCase();
        if (!slot || !['head', 'hands', 'body', 'feet'].includes(slot)) {
          return ctx.fail('Masukkan slot: head, hands, body, atau feet.');
        }
        const removed = await relic.unequip(slot, ctx.sender);
        const formatted = relic.formatRelic(removed);
        return ctx.reply(`Relic *${formatted.slot}* Lv.${removed.level} berhasil dilepas!`);
      }

      if (sub === 'detail') {
        const target = await getRelicByIndex(ctx.sender, ctx.args[1]);
        if (!target) return ctx.fail('Nomor relic tidak valid. Gunakan `.relic list` untuk melihat nomor.');
        return ctx.reply(await relicDetailText(target));
      }

      if (sub === 'levelup') {
        const target = await getRelicByIndex(ctx.sender, ctx.args[1]);
        if (!target) return ctx.fail('Nomor relic tidak valid. Gunakan `.relic list` untuk melihat nomor.');
        const leveled = await relic.levelUp(target.id, ctx.sender);
        const formatted = relic.formatRelic(leveled);
        const cost = relic.getLevelUpCost(leveled);
        const nextCost = cost ? `\nNext: ${cost.coins} koin${cost.cerelia > 0 ? ` + ${cost.cerelia} Cerelia` : ''}${cost.userExp > 0 ? ` + ${cost.userExp} EXP` : ''}` : '\nMax level tercapai!';
        return ctx.reply(`Relic berhasil di-upgrade ke *Lv.${leveled.level}*!\n${formatted.mainStat}${nextCost}`);
      }

      if (sub === 'smelt') {
        const target = await getRelicByIndex(ctx.sender, ctx.args[1]);
        if (!target) return ctx.fail('Nomor relic tidak valid. Gunakan `.relic list` untuk melihat nomor.');
        const result = await relic.smelt(target.id, ctx.sender);
        const formatted = relic.formatRelic(result.relic);
        let text = `Relic *${formatted.slot}* Lv.${result.relic.level} berhasil dilebur!\n`;
        text += `+${result.coins} koin`;
        if (result.cerelia > 0) text += `\n+${result.cerelia} Cerelia`;
        return ctx.reply(text);
      }

      return ctx.reply(await inventoryText(ctx.sender));
    } catch (error) {
      return ctx.fail(error.message);
    }
  },
};
