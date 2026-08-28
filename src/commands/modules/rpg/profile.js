import {
  userModel,
  walletModel,
  statsModel,
  artifactModel,
} from '#storage/models/index.js';
import { artifactService } from '#features/rpg/artifact.js';
import { F } from '#helpers/index.js';

const SLOT_EMOJI = {
  flower: '🌸',
  feather: '🪶',
  sands: '⏳',
  goblet: '🏆',
  circlet: '👑',
};

export default {
  name: 'profile',
  aliases: ['profil', 'rpg', 'char', 'character'],
  category: 'rpg',
  description: 'Lihat profil RPG kamu',
  cooldown: 5_000,

  async execute(ctx) {
    const jid = ctx.mentions[0] ?? ctx.sender;
    const user = userModel.ensure(jid, { pushName: ctx.pushName });
    const wallet = walletModel.find(jid);
    const stats = statsModel.ensure(jid);
    userModel.checkPremiumExpiry(jid);

    const finalStats = artifactService.getPlayerStats(jid);
    const expNeeded = userModel.expForLevel(user.level + 1);
    const expPct = Math.round((user.exp / expNeeded) * 100);
    const winrate = statsModel.winrate(jid);
    const premiumBadge = user.premium ? ' 👑' : '';

    const inv = artifactService.getInventory(jid);
    const slotLines = ['flower', 'feather', 'sands', 'goblet', 'circlet'].map((slot) => {
      const artifactId = inv?.[`${slot}_id`];
      if (!artifactId) return `│• ${SLOT_EMOJI[slot]} -`;
      const a = artifactModel.find(artifactId);
      if (!a) return `│• ${SLOT_EMOJI[slot]} -`;
      return `│• ${SLOT_EMOJI[slot]} ${a.name}`;
    });

    const text = [
      `╭──┄  *${user.push_name || 'Unknown'}*${premiumBadge}  ┄──`,
      `│• ⭐ Lv. ${user.level} - ${user.exp}/${expNeeded} (${expPct}%)`,
      '│',
      `│• ❤️ ${finalStats.hp}`,
      `│• ⚔️ ${finalStats.atk}  🛡️ ${finalStats.def}  💥 ${finalStats.critRate.toFixed(0)}%`,
      '│',
      ...slotLines,
      '│',
      `│• 🪙 ${F.formatNumber(wallet?.cash ?? 0)}  🏦 ${F.formatNumber(wallet?.bank ?? 0)}`,
      `│• 🏆 ${stats.win}W / ${stats.loss}L  🔥 ${user.daily_streak || 0} hari`,
      '╰─────── ୨୧ ───────┘',
    ].join('\n');

    await ctx.reply(text);
  },
};
