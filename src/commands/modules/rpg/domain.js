import { domainService as domain } from '#features/rpg/domain.js';
import { userModel, statsModel } from '#storage/models/index.js';
import { F } from '#helpers/index.js';

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
  cooldown: 9 * 60 * 60 * 1_000,

  async execute(ctx) {
    const sub = ctx.args[0]?.toLowerCase();

    try {
      if (!sub) return ctx.fail(helpText());

      const config = domain.getDifficultyConfig(sub);
      if (!config) return ctx.fail('Difficulty tidak valid. Pilih: easy, medium, atau hard.');

      userModel.ensure(ctx.sender, { pushName: ctx.pushName });
      statsModel.ensure(ctx.sender);

      await ctx.react('⚔️');

      const statusMsg = await ctx.reply(
        [
          '╭─── ୨୧ ───╮',
          `│ 🏰 DOMAIN • ${config.name.toUpperCase()}`,
          '│',
          '│ ⚔️ Preparing battle...',
          '╰──────────╯',
        ].join('\n')
      );

      await sleep(6000);

      const result = domain.simulateBattle(ctx.sender, sub);

      let finalText;
      if (result.won) {
        const rewards = domain.grantRewards(ctx.sender, sub);
        finalText = domain.formatVictory(config, rewards, result.rounds.length);
      } else {
        finalText = domain.formatDefeat(config, result.rounds.length);
      }

      await ctx.sock.sendMessage(ctx.jid, { text: finalText, edit: statusMsg.key });
    } catch (error) {
      return ctx.fail(error.message);
    }
  },
};
