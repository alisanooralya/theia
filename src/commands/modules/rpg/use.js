import {
  statsModel,
  inventoryModel,
  itemModel,
  walletModel,
  userModel
} from '#storage/models/index.js';

const BUFF_DURATION = 3_600_000;

export default {
  name: 'use',
  aliases: ['pakai', 'minum', 'consume'],
  category: 'rpg',
  description: 'Pakai item consumable (potion, booster)',
  cooldown: 3_000,

  async execute(ctx) {
    const query = ctx.args.join(' ').trim().toLowerCase();
    if (!query)
      ctx.fail(
        'Usage: `.use <id/nama item>`\nContoh: `.use potion_hp_sm` / `.use potion_atk`'
      );

    const owned = inventoryModel.getAll(ctx.sender);
    const item = owned.find(
      (i) =>
        i.item_id === query ||
        i.name.toLowerCase() === query ||
        i.name.toLowerCase().includes(query)
    );
    if (!item) ctx.fail('❌ Item tidak ditemukan di inventory kamu.');

    const def = itemModel.findById(item.item_id);
    const data = JSON.parse(def?.data ?? '{}');

    if (item.item_id === 'bank_upgrade') {
      const amount = Number(data.bankLimit) || 50000;
      walletModel.upgradeBankLimit(ctx.sender, amount);
      userModel.incrementBankUpgrade(ctx.sender);
      const w = walletModel.find(ctx.sender);
      inventoryModel.remove(ctx.sender, item.item_id, 1);
      await ctx.reply(
        `✅ Kamu menggunakan *${item.name}*!\n🏦 Limit bank +${amount} (sekarang ${w.bank_limit})`
      );
      return;
    }

    if (item.category !== 'consumable')
      ctx.fail('❌ Hanya item consumable yang bisa dipakai.');

    statsModel.ensure(ctx.sender);
    let msg;

    if (data.heal) {
      const stats = statsModel.find(ctx.sender);
      if (stats.hp >= stats.max_hp) ctx.fail('❤️ HP kamu sudah penuh!');
      const before = stats.hp;
      statsModel.addHp(ctx.sender, data.heal);
      const after = statsModel.find(ctx.sender).hp;
      msg = `❤️ HP +${after - before} (${after}/${stats.max_hp})`;
    } else if (data.atk) {
      statsModel.applyBuff(ctx.sender, {
        atk: data.atk,
        durationMs: BUFF_DURATION,
      });
      msg = `⚔️ ATK +${data.atk} selama 1 jam!`;
    } else if (data.def) {
      statsModel.applyBuff(ctx.sender, {
        def: data.def,
        durationMs: BUFF_DURATION,
      });
      msg = `🛡️ DEF +${data.def} selama 1 jam!`;
    } else if (data.mult) {
      statsModel.applyBuff(ctx.sender, {
        expMult: data.mult,
        durationMs: BUFF_DURATION,
      });
      msg = `✨ EXP x${data.mult} selama 1 jam!`;
    } else {
      ctx.fail('❓ Item ini belum punya efek yang bisa dipakai.');
    }

    inventoryModel.remove(ctx.sender, item.item_id, 1);
    await ctx.reply(`✅ Kamu menggunakan *${item.name}*!\n${msg}`);
  },
};
