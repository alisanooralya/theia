import {
  userModel,
  walletModel,
  statsModel,
  artifactModel,
} from '#storage/models/index.js';
import { artifactService } from '#features/rpg/artifact.js';
import { cardService } from '#features/rpg/card.js';
import { cardArtPath } from '#features/rpg/card-config.js';
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
    const [user, wallet, stats] = await Promise.all([
      userModel.ensure(jid, { pushName: ctx.pushName }),
      walletModel.find(jid),
      statsModel.ensure(jid),
    ]);

    const [finalStats, equippedCards] = await Promise.all([
      artifactService.getPlayerStats(jid),
      cardService.getEquipped(jid),
    ]);
    const expNeeded = await userModel.expForLevel(user.level + 1);
    const expPct = Math.round((user.exp / expNeeded) * 100);

    const inv = await artifactService.getInventory(jid);
    const slotLines = await Promise.all(
      ['flower', 'feather', 'sands', 'goblet', 'circlet'].map(async (slot) => {
        const artifactId = inv?.[`${slot}_id`];
        if (!artifactId) return `${SLOT_EMOJI[slot]} -`;

        const a = await artifactModel.findById(artifactId);
        if (!a) return `${SLOT_EMOJI[slot]} -`;

        return `${SLOT_EMOJI[slot]} ${a.name}`;
      })
    );
    const cardsByType = Object.fromEntries(
      equippedCards.map((card) => [card.type, card])
    );

    const text = [
      ...slotLines,
      '',
      `🪙 ${F.formatNumber(wallet?.cash ?? 0)}  🏦 ${F.formatNumber(wallet?.bank ?? 0)}`,
      `🏆 ${stats.win}W / ${stats.loss}L  🔥 ${user.daily_streak || 0} hari`,
    ].join('\n');

    const cardPath = cardArtPath(cardsByType.main?.card_id);

    let cardImage;
    try {
      const { renderProfileCard } = await import('#features/rpg/profile.js');
      cardImage = await renderProfileCard({
        name: user.push_name || 'Unknown',
        level: user.level,
        exp: user.exp,
        expNeeded,
        hp: stats.hp,
        maxHp: finalStats.hp,
        atk: finalStats.atk,
        def: finalStats.def,
        critRate: Number(finalStats.critRate ?? 0),
        mainCard: cardsByType.main
          ? { name: cardsByType.main.name, level: cardsByType.main.level }
          : null,
        supportCard: cardsByType.support
          ? { name: cardsByType.support.name, level: cardsByType.support.level }
          : null,
        artPath: cardPath,
      });
    } catch {
      return ctx.reply(text);
    }

    return ctx.reply({ image: cardImage, caption: text });
  },
};
