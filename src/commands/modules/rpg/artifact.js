import { artifactService as artifact } from '#features/rpg/artifact.js';
import { artifactModel, userModel } from '#storage/models/index.js';
import { F } from '#helpers/index.js';

const SLOT_EMOJI = artifact.slotEmoji;
const SLOTS = ['flower', 'feather', 'sands', 'goblet', 'circlet'];

function equippedText(jid) {
  const inventory = artifact.getInventory(jid);
  const lines = SLOTS.map((slot) => {
    const artifactId = inventory?.[`${slot}_id`];
    if (!artifactId) return `│• ${SLOT_EMOJI[slot]} -`;
    const a = artifactModel.findById(artifactId);
    if (!a) return `│• ${SLOT_EMOJI[slot]} -`;
    return `│• ${SLOT_EMOJI[slot]} ${a.name}`;
  });
  return lines.join('\n');
}

function artifactListText(jid) {
  const artifacts = artifact.getArtifacts(jid);
  if (!artifacts.length) return 'Kamu belum memiliki artifact.';
  const lines = artifacts.map((a) => {
    const equipped = artifactModel.isEquipped(a.id) ? ' *[Equipped]*' : '';
    const mainFormatted = artifact.getStatFormat(a.main_stat)(a.main_value);
    const subEntries = Object.entries(a.substats || {});
    const subLine = subEntries.length ? '\n' + subEntries.map(([stat, value]) => `${artifact.statNames[stat]} +${value}`).join('\n') : '';
    return `#${a.user_id}. *${a.name}* (${a.slot}) Lv.${a.level} - ${mainFormatted}${equipped}${subLine}\n`;
  });
  return lines.join('\n');
}

function helpText() {
  return [
    '*ARTIFACT SYSTEM*',
    '',
    '`.artifact` - Lihat artifact terpasang & inventory',
    '`.artifact list` - Lihat semua artifact di inventory',
    '`.artifact equip <id>` - Pasang artifact berdasarkan ID',
    '`.artifact unequip <slot>` - Lepas artifact dari slot',
    '`.artifact levelup <id>` - Naikkan level artifact',
    '`.artifact smelt <id>` - Lebur artifact untuk dapat koin',
    '',
    '*Slot:* 🌸 Flower | 🪶 Feather | ⏳ Sands | 🏆 Goblet | 👑 Circlet',
    '*Level Max:* 20',
    '*Substat:* Hanya Sands, Goblet, Circlet',
  ].join('\n');
}

export default {
  name: 'artifact',
  aliases: ['artifacts'],
  category: 'rpg',
  description: 'Kelola artifact RPG',
  cooldown: 5_000,

  async execute(ctx) {
    const sub = ctx.args[0]?.toLowerCase() || '';

    try {
      userModel.ensure(ctx.sender, { pushName: ctx.pushName });

      if (sub === 'help') {
        return ctx.reply(helpText());
      }

      if (sub === 'list') {
        const list = artifactListText(ctx.sender);
        const artifacts = artifact.getArtifacts(ctx.sender);
        const header = `*ARTIFACT INVENTORY* (${artifacts.length})`;
        return ctx.reply(`${header}\n\n${list}`);
      }

      if (sub === 'equip') {
        const userId = Number.parseInt(ctx.args[1], 10);
        if (!Number.isInteger(userId) || userId < 1) {
          return ctx.fail('Masukkan ID artifact yang valid. Gunakan `.artifact list` untuk melihat ID.');
        }
        const equipped = artifact.equip(ctx.sender, userId);
        return ctx.reply(`✅ *${equipped.name}* (${equipped.slot}) Lv.${equipped.level} berhasil dipasang!`);
      }

      if (sub === 'unequip') {
        const slot = ctx.args[1]?.toLowerCase();
        if (!slot || !SLOTS.includes(slot)) {
          return ctx.fail(`Masukkan slot: ${SLOTS.join(', ')}`);
        }
        const removed = artifact.unequip(slot, ctx.sender);
        return ctx.reply(`✅ *${removed.name}* (${removed.slot}) Lv.${removed.level} berhasil dilepas!`);
      }

      if (sub === 'levelup') {
        const userId = Number.parseInt(ctx.args[1], 10);
        if (!Number.isInteger(userId) || userId < 1) {
          return ctx.fail('Masukkan ID artifact yang valid. Gunakan `.artifact list` untuk melihat ID.');
        }
        const upgraded = artifact.upgrade(ctx.sender, userId);
        const cost = artifact.getUpgradeCost(upgraded);
        const nextCost = cost ? `\nNext: ${cost.coins} koin${cost.exp > 0 ? ` + ${cost.exp} EXP` : ''}` : '\nMax level tercapai!';
        return ctx.reply(`✅ *${upgraded.name}* berhasil di-upgrade ke *Lv.${upgraded.level}*!${nextCost}`);
      }

      if (sub === 'smelt') {
        const userId = Number.parseInt(ctx.args[1], 10);
        if (!Number.isInteger(userId) || userId < 1) {
          return ctx.fail('Masukkan ID artifact yang valid. Gunakan `.artifact list` untuk melihat ID.');
        }
        const result = artifact.smelt(ctx.sender, userId);
        return ctx.reply(`🔥 Artifact *${result.artifact.name}* (${result.artifact.slot}) Lv.${result.artifact.level} berhasil dilebur!\n+${result.coinsEarned} koin`);
      }

      const equippedLines = equippedText(ctx.sender);
      const artifacts = artifact.getArtifacts(ctx.sender);
      const stats = artifact.getPlayerStats(ctx.sender);

      const text = [
        '╭──┄  *ARTIFACT*  ┄──',
        equippedLines,
        '│',
        `│• ⚔️ ATK: ${stats.atk}  🛡️ DEF: ${stats.def}`,
        `│• ❤️ HP: ${stats.hp}  💥 CRIT: ${stats.critRate.toFixed(1)}%`,
        '│',
        `│• 📦 Total: ${artifacts.length} artifact`,
        '│',
        '│ Ketik `.artifact help` untuk bantuan.',
        '╰─────── ୨୧ ───────┘',
      ].join('\n');

      return ctx.reply(text);
    } catch (error) {
      return ctx.fail(error.message);
    }
  },
};
