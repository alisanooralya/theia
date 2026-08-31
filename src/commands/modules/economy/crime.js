import { userModel, walletModel } from '#storage/models/index.js';
import { F } from '#helpers/index.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const CRIMES = [
  {
    name: 'jambret',
    emoji: '👜',
    reward: [3000, 5000],
    penalty: [1000, 3000],
    exp: 25,
    successChance: 0.55,
    caughtChance: 0.3,
    prisonMs: 4 * 60 * 60 * 1000,
  },
  {
    name: 'hacker',
    emoji: '💻',
    reward: [5000, 8000],
    penalty: [2000, 6000],
    exp: 35,
    successChance: 0.4,
    caughtChance: 0.45,
    prisonMs: 12 * 60 * 60 * 1000,
  },
  {
    name: 'copet',
    emoji: '👛',
    reward: [2000, 3000],
    penalty: [500, 1500],
    exp: 15,
    successChance: 0.75,
    caughtChance: 0.15,
    prisonMs: 4 * 60 * 60 * 1000,
  },
  {
    name: 'judi online',
    emoji: '🎰',
    reward: [2500, 4000],
    penalty: [500, 2000],
    exp: 20,
    gamble: true,
    jackpotChance: 0.06,
    winChance: 0.34,
    caughtChance: 0.18,
    jackpotReward: [15000, 30000],
    loseCost: [500, 2000],
    prisonMs: 12 * 60 * 60 * 1000,
  },
  {
    name: 'skimming ATM',
    emoji: '💳',
    reward: [8000, 10000],
    penalty: [3000, 8000],
    exp: 40,
    successChance: 0.35,
    caughtChance: 0.5,
    prisonMs: 24 * 60 * 60 * 1000,
  },
];

function randInt(min, max) {
  return Math.floor(min + Math.random() * (max - min + 1));
}

function rollOutcome(crime) {
  const roll = Math.random();
  if (crime.gamble) {
    if (roll < crime.jackpotChance) return 'jackpot';
    if (roll < crime.jackpotChance + crime.winChance) return 'success';
    if (roll < crime.jackpotChance + crime.winChance + crime.caughtChance)
      return 'caught';
    return 'lose';
  }
  if (roll < crime.successChance) return 'success';
  if (roll < crime.successChance + crime.caughtChance) return 'caught';
  return 'fail';
}

function formatRemaining(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

async function sendResult(ctx, key, text) {
  try {
    await ctx.sock.sendMessage(ctx.jid, { text, edit: key });
  } catch {
    await ctx.reply(text);
  }
}

export default {
  name: 'crime',
  aliases: ['kejahatan', 'jahat'],
  category: 'economy',
  description: 'Lakukan kejahatan (resiko tinggi)',
  cooldown: 60 * 60 * 1000,

  async execute(ctx) {
    await userModel.ensure(ctx.sender, { pushName: ctx.pushName });

    const nowSec = Math.floor(Date.now() / 1000);
    const user = await userModel.findById(ctx.sender);
    const prisonLeft = (user?.prison_until ?? 0) - nowSec;

    if (prisonLeft > 0) {
      return ctx.reply(
        `🔒 Kamu masih berada di penjara!\n\n⏱️ Sisa hukuman: ${formatRemaining(prisonLeft)}`
      );
    }

    const crime = CRIMES[Math.floor(Math.random() * CRIMES.length)];
    const firstMsg = await ctx.reply('Kamu sedang mencoba kriminal !!');
    await sleep(2500);

    const outcome = rollOutcome(crime);
    const title = `${crime.emoji} *${crime.name.toUpperCase()}*`;

    if (outcome === 'success' || outcome === 'jackpot') {
      const range = outcome === 'jackpot' ? crime.jackpotReward : crime.reward;
      const reward = randInt(range[0], range[1]);

      await walletModel.reward(ctx.sender, reward, `crime: ${crime.name}`);
      const { leveledUp, newLevel } = await userModel.addExp(ctx.sender, crime.exp);
      const label = outcome === 'jackpot' ? 'JACKPOT!' : 'Berhasil!';
      let text = `${title}\n\n${label} Kamu mendapatkan\n🪙 +${F.formatNumber(reward)} Coin`;
      if (outcome === 'jackpot')
        text += `\n🎰 *JACKPOT!* Keberuntungan besar!`;
      text += `\n⭐ +${crime.exp} EXP`;
      if (leveledUp)
        text += `\n\n🎉 *LEVEL UP!* Kamu sekarang level *${newLevel}*!`;
      await sendResult(ctx, firstMsg.key, text);
      return;
    }

    if (outcome === 'lose') {
      const lose = randInt(crime.loseCost[0], crime.loseCost[1]);
      const wallet = await walletModel.find(ctx.sender);
      const actualLose = Math.min(lose, wallet?.cash ?? 0);

      if (actualLose > 0) await walletModel.addCash(ctx.sender, -actualLose);
      let text = `${title}\n\nKalah dalam judi online!\n🪙 -${F.formatNumber(actualLose)} Coin`;
      if (actualLose === 0) text += `\nUntungnya kamu tidak punya uang untuk dibawa kalah. 😅`;
      await sendResult(ctx, firstMsg.key, text);
      return;
    }

    if (outcome === 'caught') {
      const penalty = randInt(crime.penalty[0], crime.penalty[1]);
      const wallet = await walletModel.find(ctx.sender);
      const actualPenalty = Math.min(penalty, wallet?.cash ?? 0);
      if (actualPenalty > 0) await walletModel.addCash(ctx.sender, -actualPenalty);

      const prisonUntil = nowSec + Math.floor(crime.prisonMs / 1000);
      await userModel.setPrisonUntil(ctx.sender, prisonUntil);

      const lines = [
        '🚔 *CAUGHT!*',
        '',
        'Kamu tertangkap polisi!',
        '',
        `🪙 Denda: ${F.formatNumber(actualPenalty)}`,
        `🔒 Penjara: ${Math.floor(crime.prisonMs / 60000)} menit`,
      ];
      await sendResult(ctx, firstMsg.key, lines.join('\n'));
      return;
    }

    const text = `${title}\n\nGagal melakukan aksi.\nUntungnya kamu berhasil kabur. 💨`;
    await sendResult(ctx, firstMsg.key, text);
  },
};
