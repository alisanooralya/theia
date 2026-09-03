import { userModel, walletModel } from '#storage/models/index.js';
import { F } from '#helpers/index.js';

const DAILY_AMOUNT_MIN = 5_500;
const DAILY_AMOUNT_MAX = 6_000;
const DAILY_EXP_MIN = 30;
const DAILY_EXP_MAX = 50;
const WIB_OFFSET = 7;

function wibDayKey(tsSec) {
  const d = new Date(tsSec * 1000);
  const utc = d.getTime() + d.getTimezoneOffset() * 60_000;
  const wib = new Date(utc + WIB_OFFSET * 3_600_000);
  return wib.toISOString().slice(0, 10);
}

const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

export default {
  name: 'daily',
  aliases: ['claim', 'harian'],
  category: 'economy',
  description: 'Klaim reward harian kamu (reset jam 00:00 WIB)',
  cooldown: 0,

  async execute(ctx) {
    const user = await userModel.ensure(ctx.sender, { pushName: ctx.pushName });
    const todayKey = wibDayKey(Math.floor(Date.now() / 1000));
    const lastKey = user.last_daily ? wibDayKey(user.last_daily) : null;

    if (lastKey === todayKey) {
      return ctx.reply(
        '❌ Kamu sudah klaim daily hari ini. Reset berikutnya jam *00:00 WIB*.'
      );
    }

    const cash = randInt(DAILY_AMOUNT_MIN, DAILY_AMOUNT_MAX);
    const exp = randInt(DAILY_EXP_MIN, DAILY_EXP_MAX);
    const [, { leveledUp, newLevel }] = await Promise.all([
      walletModel.reward(ctx.sender, cash, 'daily reward'),
      userModel.addExp(ctx.sender, exp),
    ]);
    const streak = await userModel.recordDaily(ctx.sender);

    let text = `🎁 *Daily Reward!*\n\n🪙 +${F.formatNumber(cash)} coin\n⭐ +${exp} EXP\n🔥 Streak: *${streak} hari*`;
    if (leveledUp)
      text += `\n\n🎉 *LEVEL UP!* Kamu sekarang level *${newLevel}*!`;
    await ctx.reply(text);
  },
};
