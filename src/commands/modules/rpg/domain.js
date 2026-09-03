import { domainService as domain } from '#features/rpg/domain.js';
import { userModel, statsModel } from '#storage/models/index.js';
import { F } from '#helpers/index.js';
import { ButtonV2 } from '#messages/builder.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function helpText() {
  return [
    '🏰 *DOMAIN*',
    '',
    'Farm Artifact dengan melawan Boss!',
    '',
    '`.domain <difficulty>` - mulai battle',
    '',
    '*Difficulty:*',
    '- Easy: Boss lemah, 1 artifact',
    '- Medium: Boss sedang, 1-2 artifact',
    '- Hard: Boss kuat, 1-2 artifact',
    '',
    '*Reward:*',
    '- Menang: Artifact + Coin + EXP',
    '- Kalah: Tidak ada reward',
  ].join('\n');
}

export default {
  name: 'domain',
  aliases: ['domains'],
  category: 'rpg',
  description: 'Farm Artifact dengan melawan Boss',
  cooldown: 3 * 60 * 60 * 1_000,

  async execute(ctx) {
    const sub = ctx.args[0]?.toLowerCase();

    try {
      if (!sub) {
        const builder = new ButtonV2(ctx.sock)
          .setBody(
            [
              '🏰 *DOMAIN*',
              '',
              'Farm Artifact dengan melawan Boss!',
              '',
              'Pilih difficulty untuk memulai:',
            ].join('\n')
          )
          .addButton('EASY', '.domain easy')
          .addButton('MEDIUM', '.domain medium')
          .addButton('HARD', '.domain hard');
        return builder.send(ctx.jid);
      }

      const config = domain.getDifficultyConfig(sub);
      if (!config)
        return ctx.fail(
          'Difficulty tidak valid. Pilih: easy, medium, atau hard.'
        );

      await userModel.ensure(ctx.sender, { pushName: ctx.pushName });
      await statsModel.ensure(ctx.sender);

      const statusMsg = await ctx.reply(
        [
          '╭─── ୨୧ ───╮',
          `│ 🏰 DOMAIN • ${config.name.toUpperCase()}`,
          '│',
          '│ ⚔️ Preparing battle...',
          '╰──────────╯',
        ].join('\n')
      );

      await sleep(3000);

      const result = await domain.simulateBattle(ctx.sender, sub);

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
      return ctx.fail(error.message);
    }
  },
};
