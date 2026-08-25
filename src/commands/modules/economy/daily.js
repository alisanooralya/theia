import { userModel, walletModel } from '#storage/models/index.js';
import { F } from '#helpers/index.js';

const DAILY_AMOUNT_MIN = 4_500;
const DAILY_AMOUNT_MAX = 5_000;
const DAILY_EXP_MIN = 30;
const DAILY_EXP_MAX = 50;
const DAILY_COOLDOWN = 20 * 60 * 60 * 1000;

const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

export default {
  name: 'daily',
  aliases: ['claim', 'harian'],
  category: 'economy',
  description: 'Klaim reward harian kamu',
  cooldown: DAILY_COOLDOWN,

  async execute(ctx) {
    const user = userModel.ensure(ctx.sender, { pushName: ctx.pushName });
    const cash = randInt(DAILY_AMOUNT_MIN, DAILY_AMOUNT_MAX);
    const exp = randInt(DAILY_EXP_MIN, DAILY_EXP_MAX);
    walletModel.reward(ctx.sender, cash, 'daily reward');
    const { leveledUp, newLevel } = userModel.addExp(ctx.sender, exp);
    const streak = userModel.recordDaily(ctx.sender);

    let text = `🎁 *Daily Reward!*\n\n🪙 +${F.formatNumber(cash)} cash\n⭐ +${exp} EXP\n🔥 Streak: *${streak} hari*`;
    if (leveledUp)
      text += `\n\n🎉 *LEVEL UP!* Kamu sekarang level *${newLevel}*!`;
    await ctx.reply(text);
  },
};
