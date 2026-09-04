import { bountyService as bounty } from '#features/rpg/bounty.js';
import { userModel, statsModel } from '#storage/models/index.js';
import { Button } from '#messages/builder.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function difficultyMenu(ctx) {
  const builder = new Button(ctx.sock)
    .setTitle('🎯 BOUNTY')
    .setSubtitle('Basmi buronan, kumpulkan Coin')
    .setBody(
      [
        'Pilih tingkat kesulitan buronan:',
        '',
        ...Object.values(bounty.difficulty).map(
          (config) => `- ${config.name}: ${bounty.rewardRange(config)}`
        ),
        '',
        'Kalah = tanpa reward, HP tetap berkurang.',
      ].join('\n')
    )
    .setFooter('Pilih difficulty untuk lihat daftar buronan');

  for (const [key, config] of Object.entries(bounty.difficulty)) {
    builder.addReply(config.name.toUpperCase(), `.bounty ${key}`);
  }

  return builder.send(ctx.jid);
}

function targetMenu(ctx, difficulty, config) {
  const builder = new Button(ctx.sock)
    .setTitle(`🎯 BOUNTY • ${config.name.toUpperCase()}`)
    .setSubtitle(`Hadiah: ${bounty.rewardRange(config)}`)
    .setBody('Pilih buronan yang ingin kamu kejar:')
    .setFooter('Statistik buronan tertera di tiap pilihan')
    .addSelection('PILIH BURONAN')
    .makeSection(`Target ${config.name}`);

  for (const target of config.targets) {
    builder.makeRow(
      target.emoji,
      target.name,
      bounty.targetStatLine(target),
      `.bounty ${difficulty} ${target.id}`
    );
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
        return await difficultyMenu(ctx);
      } catch (error) {
        return ctx.fail(error.message);
      }
    }

    const config = bounty.getDifficultyConfig(sub);
    if (!config)
      return ctx.fail(
        'Difficulty tidak valid. Pilih: easy, medium, atau hard.'
      );

    if (!targetId) {
      try {
        return await targetMenu(ctx, sub, config);
      } catch (error) {
        return ctx.fail(error.message);
      }
    }

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
