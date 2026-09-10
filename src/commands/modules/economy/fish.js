import { fishService } from '#features/economy/services/fish-service.js';
import { FISH_COOLDOWN_MS } from '#features/economy/config/fish-config.js';
import { F } from '#helpers/index.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  name: 'fish',
  aliases: ['fishing', 'pancing', 'mancing'],
  category: 'economy',
  description: 'Pancing ikan untuk dapat uang',
  cooldown: FISH_COOLDOWN_MS,

  async execute(ctx) {
    const statusMsg = await ctx.reply(
      '🎣 Kamu mulai memancing... sabar ya, tunggu sebentar~'
    );

    const delay = 3000 + Math.floor(Math.random() * 2000);
    await sleep(delay);

    try {
      const result = await fishService.fish(ctx.sender, {
        pushName: ctx.pushName,
      });

      let text = `🎣 *Fishing!*\n\n${result.fish.emoji} Kamu dapat: *${result.fish.name}*\n🪙 +${F.formatNumber(result.coin)}\n⭐ +${result.exp} EXP`;
      if (result.level.leveledUp)
        text += `\n\n🎉 *LEVEL UP!* Kamu sekarang level *${result.level.newLevel}*!`;

      await ctx.sock.sendMessage(ctx.jid, { text, edit: statusMsg.key });
    } catch (err) {
      await ctx.fail(err.message);
    }
  },
};
