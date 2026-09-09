import { F } from '#helpers/index.js';
import { Button } from '#messages/builder.js';
import { renderGachaBanner } from '#features/rpg/gacha-banner.js';
import { GACHA_CONFIG } from '#features/rpg/config/gacha-config.js';
import {
  cardArtPath,
  CARD_IMAGE_MAP,
} from '#features/rpg/config/card-config.js';
import {
  gachaService,
  makeRequestKey,
} from '#features/rpg/services/gacha-service.js';

function bannerData() {
  const testId = Object.keys(CARD_IMAGE_MAP)[1];
  return {
    name: 'Lena',
    subtitle: 'Archer',
    eraLabel: 'Star Cluster Chief Scrivener',
    rateUpText: 'NEW CARD RELEASED',
    description:
      "Nice to meet you! The captain has told me a lot about you. Apparently, you're an incredibly awesome mate. I have a feeling that we'll experience amazing things together beyond what I've read in books! Looking forward to working with you from now on, f-friend!",
    artPath: cardArtPath(testId),
  };
}

export function parseGachaArgs(args) {
  if (!args || args.length === 0) return null;
  const count = Number(args[0]);
  if (!Number.isInteger(count) || !(count in GACHA_CONFIG.costs))
    throw new RangeError('Jumlah gacha harus 1 atau 10.');

  return count;
}

function resultLine(result) {
  if (result.type === 'main') return `${result.index}. 🃏 ${result.cardName}`;
  if (result.type === 'shopItem') {
    const qty = result.quantity > 1 ? ` ×${result.quantity}` : '';
    return `${result.index}. 🧪 ${result.itemName}${qty}`;
  }

  return `${result.index}. ❌ Zonk`;
}

export function formatGachaResult(outcome) {
  const lines = ['🎰 *GACHA RESULT*', ''];
  for (const result of outcome.results) lines.push(resultLine(result));
  const mains = {};
  const items = {};
  let zonk = 0;
  for (const result of outcome.results) {
    if (result.type === 'main')
      mains[result.cardName] = (mains[result.cardName] ?? 0) + 1;
    else if (result.type === 'shopItem') {
      items[result.itemName] = (items[result.itemName] ?? 0) + result.quantity;
    } else zonk += 1;
  }
  lines.push('', '🎁 *Total Reward:*');
  for (const [name, qty] of Object.entries(mains))
    lines.push(`• ${name} ×${qty}`);
  for (const [name, qty] of Object.entries(items))
    lines.push(`• ${name} ×${qty}`);
  if (zonk > 0) lines.push(`• Zonk ×${zonk}`);
  return lines.join('\n');
}

async function sendGachaMenu(ctx) {
  const text = ['🎰 *GACHA*', '', 'Pilih jumlah pull:'].join('\n');
  try {
    const banner = await renderGachaBanner(bannerData());
    const builder = new Button(ctx.sock)
      .setBody(text)
      .setImage(banner)
      .setFooter('Rate card 1% • item shop 49%')
      .addReply('🎰 GACHA 1', '.gacha 1')
      .addReply('🎰 GACHA 10', '.gacha 10');
    return builder.send(ctx.jid);
  } catch {
    return ctx.reply(text);
  }
}

export async function executeGacha(
  ctx,
  { sleepFn = F.sleep, pullFn = null } = {}
) {
  const count = parseGachaArgs(ctx.args);
  if (count === null) {
    return sendGachaMenu(ctx);
  }

  const animMsg = await ctx.reply('🎰 Sedang melakukan gacha...');
  const msgKey = animMsg?.key;
  await ctx.applyCooldown();
  await sleepFn(GACHA_CONFIG.animationDelayMs);

  const pull =
    pullFn ?? ((sender, n, opts) => gachaService.pull(sender, n, opts));
  const outcome = await pull(ctx.sender, count, {
    requestKey: makeRequestKey(ctx.sender),
  });

  const text = `${formatGachaResult(outcome)}\n\n💰 Cost: ${F.formatNumber(outcome.total)} Coin`;
  await ctx.sock.sendMessage(ctx.jid, { text, edit: msgKey });
}

export default {
  name: 'gacha',
  aliases: ['roll'],
  category: 'rpg',
  description: 'Gacha Main Card dan item',
  cooldown: 5_000,
  manualCooldown: true,

  async execute(ctx) {
    try {
      await executeGacha(ctx);
    } catch (err) {
      await ctx.fail(err.message);
    }
  },
};
