import { userModel, walletModel } from '#storage/models/index.js';
import { F } from '#helpers/index.js';

const JOBS = [
  { name: 'kuli bangunan', reward: [100, 2000], exp: 10 },
  { name: 'tukang kebun', reward: [800, 1500], exp: 8 },
  { name: 'programmer freelance', reward: [4000, 5000], exp: 30 },
  { name: 'ojol', reward: [900, 1800], exp: 12 },
  { name: 'guru les', reward: [800, 2400], exp: 15 },
  { name: 'chef', reward: [900, 2800], exp: 18 },
];

export default {
  name: 'work',
  aliases: ['kerja', 'bekerja'],
  category: 'economy',
  description: 'Cari uang dengan bekerja',
  cooldown: 3 * 60 * 60 * 1000,

  async execute(ctx) {
    await userModel.ensure(ctx.sender, { pushName: ctx.pushName });
    const job = JOBS[Math.floor(Math.random() * JOBS.length)];
    const reward = Math.floor(
      job.reward[0] + Math.random() * (job.reward[1] - job.reward[0])
    );

    const [_, { leveledUp, newLevel }] = await Promise.all([
      walletModel.reward(ctx.sender, reward, `work: ${job.name}`),
      userModel.addExp(ctx.sender, job.exp),
    ]);

    let text = `💼 *Bekerja*\n\nKamu kerja sebagai *${job.name}*\n🪙 +${F.formatNumber(reward)} cash\n⭐ +${job.exp} EXP`;
    if (leveledUp)
      text += `\n\n🎉 *LEVEL UP!* Kamu sekarang level *${newLevel}*!`;
    await ctx.reply(text);
  },
};
