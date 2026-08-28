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
    '   Reward: 100-200 🪙, 20-40 ⭐, 1 🧿 Artifact',
    '',
    '2. *Medium* — Boss: Golem (HP 1000, ATK 100, DEF 50)',
    '   Reward: 300-500 🪙, 50-80 ⭐, 1-2 🧿 Artifact',
    '',
    '3. *Hard* — Boss: Dragon (HP 2000, ATK 180, DEF 100)',
    '   Reward: 700-1000 🪙, 100-150 ⭐, 1-2 🧿 Artifact',
    '',
    'Ketik `.domain <difficulty>` untuk mulai.',
    'Contoh: `.domain easy`',
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

      for (const round of result.rounds) {
        const text = domain.formatRoundPlayer(ctx.sender, round, config);
        try {
          await ctx.sock.sendMessage(ctx.jid, { text }, { edit: statusMsg.key });
        } catch {
          break;
        }
        await sleep(600);
      }

      await sleep(500);

      let finalText;
      if (result.won) {
        const rewards = domain.grantRewards(ctx.sender, sub);
        finalText = domain.formatVictory(config, rewards);
      } else {
        finalText = domain.formatDefeat(config);
      }

      await ctx.sock.sendMessage(ctx.jid, { text: finalText }, { edit: statusMsg.key });
    } catch (error) {
      return ctx.fail(error.message);
    }
  },
};
