import {
  statsModel,
  inventoryModel,
  itemModel,
} from '#storage/models/index.js';
import { artifactService } from '#features/rpg/artifact.js';

const BUFF_DURATION = 3_600_000;

export default {
  name: 'use',
  aliases: ['pakai', 'makan', 'consume'],
  category: 'rpg',
  description: 'Pakai item consumable (food, buff)',
  cooldown: 3_000,

  async execute(ctx) {
    const parts = [...ctx.args];
    let count = 1;
    if (parts.length > 1 && /^\d+$/.test(parts[parts.length - 1])) {
      count = Number(parts.pop());
    }
    if (count < 1)
      ctx.fail(
        'Usage: `.use <id/nama item> [jumlah]`\nContoh: `.use food_sm 5`'
      );

    const query = parts.join(' ').trim().toLowerCase();
    if (!query)
      ctx.fail(
        'Usage: `.use <id/nama item> [jumlah]`\nContoh: `.use food_sm 5` / `.use potion_atk`'
      );

    const owned = await inventoryModel.getAll(ctx.sender);
    const item = owned.find(
      (i) =>
        i.item_id === query ||
        i.name.toLowerCase() === query ||
        i.name.toLowerCase().includes(query)
    );
    if (!item) ctx.fail('❌ Item tidak ditemukan di inventory kamu.');
    if (item.quantity < count)
      ctx.fail(
        `❌ Stok tidak cukup: kamu hanya punya ${item.quantity}x *${item.name}*.`
      );

    const def = await itemModel.findById(item.item_id);
    const data = JSON.parse(def?.data ?? '{}');

    if (item.category !== 'consumable')
      ctx.fail('❌ Hanya item consumable yang bisa dipakai.');

    await statsModel.ensure(ctx.sender);
    let msg;

    if (data.heal) {
      const stats = await statsModel.find(ctx.sender);
      const pStats = await artifactService.getPlayerStats(ctx.sender);
      const maxHp = pStats.hp;
      if (stats.hp >= maxHp) ctx.fail('❤️ HP kamu sudah penuh!');
      const before = stats.hp;
      const after = Math.min(maxHp, before + data.heal * count);
      await statsModel.setHp(ctx.sender, after);
      msg = `❤️ HP +${after - before} (${after}/${maxHp})`;
    } else if (data.atk) {
      await statsModel.applyBuff(ctx.sender, {
        atk: data.atk * count,
        durationMs: BUFF_DURATION,
      });
      msg = `⚔️ ATK +${data.atk * count} selama 1 jam!`;
    } else if (data.def) {
      await statsModel.applyBuff(ctx.sender, {
        def: data.def * count,
        durationMs: BUFF_DURATION,
      });
      msg = `🛡️ DEF +${data.def * count} selama 1 jam!`;
    } else {
      ctx.fail('❓ Item ini belum punya efek yang bisa dipakai.');
    }

    await inventoryModel.remove(ctx.sender, item.item_id, count);
    const countLabel = count > 1 ? ` ${count}x` : '';
    await ctx.reply(`✅ Kamu menggunakan *${item.name}*${countLabel}!\n${msg}`);
  },
};
