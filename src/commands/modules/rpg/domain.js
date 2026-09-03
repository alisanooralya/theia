import { readFile } from 'fs/promises';
import { domainService as domain } from '#features/rpg/domain.js';
import { userModel, statsModel } from '#storage/models/index.js';
import { F } from '#helpers/index.js';
import { ButtonV2 } from '#messages/builder.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  name: 'domain',
  aliases: ['domains'],
  category: 'rpg',
  description: 'Farm Artifact dengan melawan Boss',
  cooldown: 3 * 60 * 60 * 1_000,
  manualCooldown: true,

  async execute(ctx) {
    const sub = ctx.args[0]?.toLowerCase();

    if (!sub) {
      try {
        const image = await readFile('temp/domain.jpg');
        const builder = new ButtonV2(ctx.sock)
          .setThumbnail(image)
          .setBody(
            [
              '🏰 *DOMAIN*',
              '',
              '*Difficulty:*',
              '- Easy: Boss lemah, 1 artifact',
              '- Medium: Boss sedang, 1-2 artifact',
              '- Hard: Boss kuat, 1-2 artifact',
              '',
              'Pilih difficulty untuk memulai:',
            ].join('\n')
          )
          .addButton('EASY', '.domain easy')
          .addButton('MEDIUM', '.domain medium')
          .addButton('HARD', '.domain hard');
        return builder.send(ctx.jid);
      } catch (error) {
        return ctx.fail(error.message);
      }
    }

    const config = domain.getDifficultyConfig(sub);
    if (!config)
      return ctx.fail(
        'Difficulty tidak valid. Pilih: easy, medium, atau hard.'
      );

    await userModel.ensure(ctx.sender, { pushName: ctx.pushName });
    await statsModel.ensure(ctx.sender);

    // Cooldown dipasang sebelum pertempuran supaya tidak bisa dipakai dua kali,
    // lalu dilepas lagi kalau pertempuran gagal jalan.
    await ctx.applyCooldown();

    let battleDone = false;
    try {
      const statusMsg = await ctx.reply(
        [
          `🏰 DOMAIN • ${config.name.toUpperCase()}`,
          '',
          '⚔️ Preparing battle...',
        ].join('\n')
      );

      await sleep(3000);

      const result = await domain.simulateBattle(ctx.sender, sub);
      battleDone = true;

      let finalText;
      if (result.won) {
        const rewards = await domain.grantRewards(ctx.sender, sub);
        finalText = await domain.formatVictory(
          config,
          rewards,
          result.rounds.length
        );
      } else {
        finalText = domain.formatDefeat(config, result.rounds.length);
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
