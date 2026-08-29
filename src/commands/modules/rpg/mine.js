import { userModel, walletModel } from '#storage/models/index.js';
import { F } from '#helpers/index.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const MINERALS = [
  { name: 'Batu Bara', reward: [100, 300], exp: 5, emoji: '🪨', rate: 40 },
  { name: 'Bijih Besi', reward: [300, 700], exp: 10, emoji: '⛏️', rate: 28 },
  { name: 'Tembaga', reward: [500, 1200], exp: 15, emoji: '🟤', rate: 18 },
  { name: 'Perak', reward: [1000, 2500], exp: 25, emoji: '🥈', rate: 9 },
  { name: 'Emas', reward: [3000, 6000], exp: 50, emoji: '🥇', rate: 4 },
  { name: 'Berlian', reward: [5000, 10000], exp: 80, emoji: '💎', rate: 1 },
];

function pickMineral() {
  const total = MINERALS.reduce((s, m) => s + m.rate, 0);
  let roll = Math.random() * total;
  for (const m of MINERALS) {
    if ((roll -= m.rate) < 0) return m;
  }
  return MINERALS[MINERALS.length - 1];
}

const miningUsers = new Set();

export default {
  name: 'mine',
  aliases: ['mining', 'tambang'],
  category: 'rpg',
  description: 'Menambang mineral untuk dapat uang',
  cooldown: 3 * 60 * 60 * 1000,

  async execute(ctx) {
    userModel.ensure(ctx.sender, { pushName: ctx.pushName });

    if (miningUsers.has(ctx.sender)) {
      return ctx.fail('⛏️ Kamu masih menambang, tunggu sampai selesai dulu!');
    }

    miningUsers.add(ctx.sender);
    try {
      const statusMsg = await ctx.reply('⛏️ Kamu mulai menambang... sabar ya, tunggu sebentar~');

      const delay = 5000 + Math.floor(Math.random() * 3000);
      await sleep(delay);

      const mineral = pickMineral();
      const reward = Math.floor(
        mineral.reward[0] +
          Math.random() * (mineral.reward[1] - mineral.reward[0])
      );

      walletModel.reward(ctx.sender, reward, `mine: ${mineral.name}`);
      const { leveledUp, newLevel } = userModel.addExp(ctx.sender, mineral.exp);

      let text = `⛏️ *Mining!*\n\n${mineral.emoji} Kamu dapat: *${mineral.name}*\n🪙 +${F.formatNumber(reward)}\n⭐ +${mineral.exp} EXP`;
      if (leveledUp)
        text += `\n\n🎉 *LEVEL UP!* Kamu sekarang level *${newLevel}*!`;

      await ctx.sock.sendMessage(ctx.jid, { text, edit: statusMsg.key });
    } finally {
      miningUsers.delete(ctx.sender);
    }
  },
};
