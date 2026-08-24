import { userModel, walletModel } from '#storage/models/index.js';
import { F } from '#helpers/index.js';

const FISH = [
  { name: 'Botol Plastik', reward: [5, 20], exp: 1, emoji: '🧴', rate: 18 },
  { name: 'Sepatu Bekas', reward: [10, 50], exp: 2, emoji: '👟', rate: 14 },
  { name: 'Ikan Lele', reward: [200, 500], exp: 8, emoji: '🐟', rate: 16 },
  { name: 'Ikan Mas', reward: [300, 700], exp: 10, emoji: '🐠', rate: 13 },
  { name: 'Ikan Nila', reward: [400, 900], exp: 12, emoji: '🐟', rate: 10 },
  { name: 'Ikan Cupang', reward: [500, 1000], exp: 15, emoji: '🐡', rate: 9 },
  { name: 'Ikan Gurame', reward: [800, 1800], exp: 20, emoji: '🐠', rate: 7 },
  { name: 'Ikan Tuna', reward: [1500, 3500], exp: 35, emoji: '🐟', rate: 5 },
  { name: 'Ikan Arwana', reward: [2000, 5000], exp: 40, emoji: '🐉', rate: 4 },
  { name: 'Ikan Hiu', reward: [3000, 7000], exp: 60, emoji: '🦈', rate: 2 },
  { name: 'Ikan Koi', reward: [4000, 9000], exp: 75, emoji: '🎏', rate: 1 },
  {
    name: 'Harta Karam',
    reward: [8000, 15000],
    exp: 100,
    emoji: '💰',
    rate: 1,
  },
];

function pickFish() {
  const total = FISH.reduce((s, m) => s + m.rate, 0);
  let roll = Math.random() * total;
  for (const m of FISH) {
    if ((roll -= m.rate) < 0) return m;
  }
  return FISH[FISH.length - 1];
}

const fishingUsers = new Set();

export default {
  name: 'fish',
  aliases: ['fishing', 'pancing', 'mancing'],
  category: 'rpg',
  description: 'Pancing ikan untuk dapat uang',
  cooldown: 120_000,

  async execute(ctx) {
    userModel.ensure(ctx.sender, { pushName: ctx.pushName });

    if (fishingUsers.has(ctx.sender)) {
      return ctx.fail('🎣 Kamu masih memancing, tunggu sampai selesai dulu!');
    }

    fishingUsers.add(ctx.sender);
    try {
      await ctx.reply('🎣 Kamu mulai memancing... sabar ya, tunggu sebentar~');

      const delay = 60_000 + Math.floor(Math.random() * 45_000);
      await new Promise((r) => setTimeout(r, delay));

      const catchResult = pickFish();
      const reward = Math.floor(
        catchResult.reward[0] +
          Math.random() * (catchResult.reward[1] - catchResult.reward[0])
      );

      walletModel.reward(ctx.sender, reward, `fish: ${catchResult.name}`);
      const { leveledUp, newLevel } = userModel.addExp(
        ctx.sender,
        catchResult.exp
      );

      let text = `🎣 *Fishing!*\n\n${catchResult.emoji} Kamu dapat: *${catchResult.name}*\n🪙 +${F.formatNumber(reward)}\n⭐ +${catchResult.exp} EXP`;
      if (leveledUp)
        text += `\n\n🎉 *LEVEL UP!* Kamu sekarang level *${newLevel}*!`;
      await ctx.reply(text);
    } finally {
      fishingUsers.delete(ctx.sender);
    }
  },
};
