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
    const a = artifactModel.find(artifactId);
    if (!a) return `│• ${SLOT_EMOJI[slot]} -`;
    return `│• ${SLOT_EMOJI[slot]} ${a.name}`;
  });
  return lines.join('\n');
}

function artifactListText(jid) {
  const artifacts = artifact.getArtifacts(jid);
  if (!artifacts.length) return 'Kamu belum memiliki artifact.';
  const lines = artifacts.map((a, i) => {
    const equipped = artifactModel.isEquipped(a.id) ? ' *[Equipped]*' : '';
    const substatCount = Object.keys(a.substats).length;
    return `${i + 1}. *${a.name}* (${a.slot}) Lv.${a.level} - ID: ${a.id}${equipped}${substatCount > 0 ? ` [${substatCount} sub]` : ''}`;
  });
  return lines.join('\n');
}

function helpText() {
  return [
    '*ARTIFACT SYSTEM*',
    '',
    '`.artifact` - Lihat artifact terpasang & inventory',
    '`.artifact list` - Lihat semua artifact di inventory',
    '`.artifact detail <id>` - Lihat detail artifact',
    '`.artifact equip <id>` - Pasang artifact berdasarkan ID',
    '`.artifact unequip <slot>` - Lepas artifact dari slot',
    '`.artifact upgrade <id>` - Naikkan level artifact',
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
  cooldown: 3_000,

  async execute(ctx) {
    const sub = ctx.args[0]?.toLowerCase() || 'info';

    try {
      userModel.ensure(ctx.sender, { pushName: ctx.pushName });

      if (sub === 'help' || sub === 'bantuan') {
        return ctx.reply(helpText());
      }

      if (sub === 'list' || sub === 'inventory' || sub === 'inv') {
        const list = artifactListText(ctx.sender);
        const artifacts = artifact.getArtifacts(ctx.sender);
        const header = `*ARTIFACT INVENTORY* (${artifacts.length})`;
        return ctx.reply(`${header}\n\n${list}`);
      }

      if (sub === 'detail' || sub === 'info') {
        const id = Number.parseInt(ctx.args[1], 10);
        if (!Number.isInteger(id) || id < 1) {
          return ctx.fail('Masukkan ID artifact yang valid. Gunakan `.artifact list` untuk melihat ID.');
        }
        const a = artifact.getArtifact(id);
        if (!a) return ctx.fail('Artifact tidak ditemukan.');
        if (a.owner_jid !== ctx.sender) return ctx.fail('Artifact bukan milikmu.');
        const full = artifact.formatArtifactFull(a);
        const cost = artifact.getUpgradeCost(a);
        const costText = cost ? `\nUpgrade: ${cost.coins} koin${cost.exp > 0 ? ` + ${cost.exp} EXP` : ''}` : '\nArtifact sudah max level!';
        return ctx.reply(full + costText);
      }

      if (sub === 'equip' || sub === 'pasang') {
        const id = Number.parseInt(ctx.args[1], 10);
        if (!Number.isInteger(id) || id < 1) {
          return ctx.fail('Masukkan ID artifact yang valid. Gunakan `.artifact list` untuk melihat ID.');
        }
        const equipped = artifact.equip(id, ctx.sender);
        return ctx.reply(`✅ *${equipped.name}* (${equipped.slot}) Lv.${equipped.level} berhasil dipasang!`);
      }

      if (sub === 'unequip' || sub === 'lepas') {
        const slot = ctx.args[1]?.toLowerCase();
        if (!slot || !SLOTS.includes(slot)) {
          return ctx.fail(`Masukkan slot: ${SLOTS.join(', ')}`);
        }
        const removed = artifact.unequip(slot, ctx.sender);
        return ctx.reply(`✅ *${removed.name}* (${removed.slot}) Lv.${removed.level} berhasil dilepas!`);
      }

      if (sub === 'upgrade' || sub === 'lvl' || sub === 'levelup') {
        const id = Number.parseInt(ctx.args[1], 10);
        if (!Number.isInteger(id) || id < 1) {
          return ctx.fail('Masukkan ID artifact yang valid. Gunakan `.artifact list` untuk melihat ID.');
        }
        const upgraded = artifact.upgrade(id, ctx.sender);
        const cost = artifact.getUpgradeCost(upgraded);
        const nextCost = cost ? `\nNext: ${cost.coins} koin${cost.exp > 0 ? ` + ${cost.exp} EXP` : ''}` : '\nMax level tercapai!';
        return ctx.reply(`✅ *${upgraded.name}* berhasil di-upgrade ke *Lv.${upgraded.level}*!${nextCost}`);
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
        '│ Ketik `.artifact list` untuk melihat semua artifact.',
        '│ Ketik `.artifact detail <id>` untuk detail.',
        '╰─────── ୨୧ ───────┘',
      ].join('\n');

      return ctx.reply(text);
    } catch (error) {
      return ctx.fail(error.message);
    }
  },
};
