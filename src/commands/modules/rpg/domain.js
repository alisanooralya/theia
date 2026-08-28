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
    '`.domain` - lihat pilihan difficulty',
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

function selectionText() {
  return [
    '🏰 *DOMAIN - Pilih Difficulty*',
    '',
    '1. *Easy* — Boss: Slime (HP 500, ATK 50, DEF 20)',
    '2. *Medium* — Boss: Golem (HP 1000, ATK 100, DEF 50)',
    '3. *Hard* — Boss: Dragon (HP 2000, ATK 180, DEF 100)',
    '',
    'Ketik `.domain <difficulty>` untuk mulai.',
  ].join('\n');
}

export default {
  name: 'domain',
  aliases: ['domains'],
  category: 'rpg',
  description: 'Farm Artifact dengan melawan Boss',
  cooldown: 5_000,

  async execute(ctx) {
    const sub = ctx.args[0]?.toLowerCase();

    try {
      if (!sub) return ctx.reply(selectionText());

      if (sub === 'help' || sub === 'bantuan') return ctx.reply(helpText());

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

      await sleep(800);

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
