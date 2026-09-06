import {
  userModel,
  walletModel,
  statsModel,
  artifactModel,
} from '#storage/models/index.js';
import { artifactService } from '#features/rpg/artifact.js';
import { cardService } from '#features/rpg/card.js';
import { AIRich } from '#messages/builder.js';
import { F } from '#helpers/index.js';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CARD_DIR = join(__dirname, '..', '..', '..', '..', 'temp', 'card');

const CARD_IMAGE_MAP = {
  girgas: 'girgas.webp',
  lena: 'lena.webp',
  ameris: 'ameris.webp',
  daisy: 'daisy.webp',
};

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
        if (!artifactId) return `│  ${SLOT_EMOJI[slot]}  ·  -`;
        const a = await artifactModel.findById(artifactId);
        if (!a) return `│  ${SLOT_EMOJI[slot]}  ·  -`;
        return `│  ${SLOT_EMOJI[slot]}  ·  ${a.name}`;
      })
    );
    const cardsByType = Object.fromEntries(
      equippedCards.map((card) => [card.type, card])
    );

    const mainCardName = cardsByType.main?.name ?? '-';
    const mainCardLv = cardsByType.main?.level ?? '-';
    const supportCardName = cardsByType.support?.name ?? '-';
    const winRate =
      stats.win + stats.loss > 0
        ? Math.round((stats.win / (stats.win + stats.loss)) * 100)
        : 0;

    const title = `❖ ${user.push_name || 'Unknown'} ❖`;
    const body = [
      `✧  *PROFIL KARAKTER*  ✧`,
      ``,
      `┌─────────────────────────┐`,
      `│  ⭐  Lv. ${user.level}`,
      `│  📊  EXP  ${user.exp} / ${expNeeded}  (${expPct}%)`,
      `└─────────────────────────┘`,
      ``,
      `┌─────────────────────────┐`,
      `│  ❤️  HP      ${stats.hp} / ${finalStats.hp}`,
      `│  ⚔️  ATK     ${finalStats.atk}`,
      `│  🛡️  DEF     ${finalStats.def}`,
      `│  💥  CRIT    ${finalStats.critRate.toFixed(0)}%`,
      `└─────────────────────────┘`,
      ``,
      `┌─────────────────────────┐`,
      `│  ══════ *ARTIFAK* ══════`,
      ...slotLines.map((l) => `│  ${l}`),
      `└─────────────────────────┘`,
      ``,
      `┌─────────────────────────┐`,
      `│  🃏  Main      ${mainCardName}  Lv.${mainCardLv}`,
      `│  🎴  Support   ${supportCardName}`,
      `└─────────────────────────┘`,
      ``,
      `┌─────────────────────────┐`,
      `│  🪙  Wallet    ${F.formatNumber(wallet?.cash ?? 0)}`,
      `│  🏦  Bank      ${F.formatNumber(wallet?.bank ?? 0)}`,
      `│  🏆  Record    ${stats.win}W / ${stats.loss}L  (${winRate}%)`,
      `│  🔥  Streak    ${user.daily_streak || 0} hari`,
      `└─────────────────────────┘`,
      ``,
      `✧  ${user.push_name || 'Unknown'}  ✧`,
    ].join('\n');

    const footer = `⏱️  ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`;

    const cardFileName =
      CARD_IMAGE_MAP[cardsByType.main?.card_id] ?? 'girgas.webp';
    const cardPath = join(CARD_DIR, cardFileName);

    try {
      const msg = new AIRich(ctx.sock)
        .setTitle(title)
        .setBody(body)
        .setFooter(footer)
        .setImage(cardPath)
        .addButton({ id: 'inventory', text: '📦 Inventory' })
        .addButton({ id: 'cards', text: '🃏 Kartu' })
        .addButton({ id: 'stats', text: '📊 Statistik' });
      return msg.send(ctx.jid);
    } catch {
      return ctx.reply(body);
    }
  },
};
