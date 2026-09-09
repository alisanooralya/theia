/**
 * Economy 2.0 — `.mine` command. Mirrors `.fish` (same UI/flow).
 * Thin layer over mineService: start message, random 3-5s wait, edit to
 * result. Cooldown (1h) guards concurrency.
 */
import { mineService } from '#features/economy/services/mine-service.js';
import { MINE_COOLDOWN_MS } from '#features/economy/config/mine-config.js';
import { F } from '#helpers/index.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  name: 'mine',
  aliases: ['mining', 'nambang', 'tambang'],
  category: 'economy',
  description: 'Menambang di tambang untuk dapat uang',
  cooldown: MINE_COOLDOWN_MS,

  async execute(ctx) {
    const statusMsg = await ctx.reply(
      '⛏️ Kamu mulai menambang... sabar ya, tunggu sebentar~'
    );

    const delay = 3000 + Math.floor(Math.random() * 2000);
    await sleep(delay);

    try {
      const result = await mineService.mine(ctx.sender, {
        pushName: ctx.pushName,
      });

      let text = `⛏️ *Mining!*\n\n${result.ore.emoji} Kamu dapat: *${result.ore.name}*\n🪙 +${F.formatNumber(result.coin)}\n⭐ +${result.exp} EXP`;
      if (result.level.leveledUp)
        text += `\n\n🎉 *LEVEL UP!* Kamu sekarang level *${result.level.newLevel}*!`;

      await ctx.sock.sendMessage(ctx.jid, { text, edit: statusMsg.key });
    } catch (err) {
      await ctx.fail(err.message);
    }
  },
};
