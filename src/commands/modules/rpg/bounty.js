import { bountyService as bounty } from '#features/rpg/bounty.js';
import { userModel, statsModel } from '#storage/models/index.js';
import { Button } from '#messages/builder.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Satu list untuk semua buronan: user langsung pilih target tanpa pesan kedua.
function bountyMenu(ctx) {
  const builder = new Button(ctx.sock)
    .setTitle('🎯 BOUNTY')
    .setSubtitle('Basmi buronan, kumpulkan Coin')
    .setBody('Pilih buronan yang ingin kamu kejar')
    .setFooter('Kalah = tanpa reward, HP tetap berkurang')
    .addSelection('🎯 Pilih Buronan');

  for (const [key, config] of Object.entries(bounty.difficulty)) {
    builder.makeSection(config.label, bounty.rewardRange(config));

    for (const target of config.targets) {
      builder.makeRow(
        config.label,
        `${target.emoji} ${target.name}`,
        `${bounty.targetStatLine(target)} • ${bounty.rewardRange(config)}`,
        `.bounty ${key} ${target.id}`
      );
    }
  }

  return builder.send(ctx.jid);
}

export default {
  name: 'bounty',
  aliases: ['buronan'],
  category: 'rpg',
  description: 'Kejar buronan untuk hadiah Coin',
  cooldown: 2 * 60 * 60 * 1_000,
  manualCooldown: true,

  async execute(ctx) {
    const sub = ctx.args[0]?.toLowerCase();
    const targetId = ctx.args[1]?.toLowerCase();

    if (!sub) {
      try {
        return await bountyMenu(ctx);
      } catch (error) {
        return ctx.fail(error.message);
      }
    }

    const config = bounty.getDifficultyConfig(sub);
    if (!config)
      return ctx.fail(
        'Difficulty tidak valid. Pilih: easy, medium, atau hard.'
      );

    if (!targetId)
      return ctx.fail(
        [
          `${config.label} — pilih buronannya:`,
          ...config.targets.map(
            (t) => `- \`.bounty ${sub} ${t.id}\` — ${t.name}`
          ),
          '',
          'Atau ketik `.bounty` untuk daftar lengkap.',
        ].join('\n')
      );

    const target = bounty.getTarget(sub, targetId);
    if (!target)
      return ctx.fail(
        [
          `Buronan tidak ditemukan untuk difficulty ${config.name}.`,
          '',
          'Pilihan yang tersedia:',
          ...config.targets.map((t) => `- \`${t.id}\` — ${t.name}`),
        ].join('\n')
      );

    await userModel.ensure(ctx.sender, { pushName: ctx.pushName });
    await statsModel.ensure(ctx.sender);

    try {
      await bounty.ensureAlive(ctx.sender);
    } catch (error) {
      return ctx.fail(error.message);
    }

    // Cooldown baru dipasang saat perburuan benar-benar dimulai, lalu dilepas
    // lagi kalau pertempuran gagal jalan.
    await ctx.applyCooldown();

    let battleDone = false;
    try {
      const statusMsg = await ctx.reply(
        [
          `🎯 BOUNTY • ${config.name.toUpperCase()}`,
          '',
          `${target.emoji} ${target.name}`,
          `⚔️ Melacak buronan...`,
        ].join('\n')
      );

      await sleep(3000);

      const result = await bounty.simulateBattle(ctx.sender, sub, target.id);
      battleDone = true;

      let finalText;
      if (result.won) {
        const reward = await bounty.grantReward(ctx.sender, sub, target);
        finalText = bounty.formatVictory(
          config,
          target,
          reward,
          result.rounds.length
        );
      } else {
        finalText = bounty.formatDefeat(config, target, result.rounds.length);
      }

      await ctx.sock.sendMessage(ctx.jid, {
        text: finalText,
        edit: statusMsg.key,
      });
    } catch (error) {
      if (!battleDone) await ctx.clearCooldown();
      return ctx.fail(error.message);
    }
  },
};
