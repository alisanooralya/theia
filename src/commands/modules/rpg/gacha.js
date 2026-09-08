import { F } from '#helpers/index.js';
import { GACHA_CONFIG } from '#features/rpg/config/gacha-config.js';
import {
  gachaService,
  makeRequestKey,
} from '#features/rpg/services/gacha-service.js';

export const GACHA_USAGE =
  '🎰 *GACHA*\n\nPenggunaan:\n`.gacha 1` (2.500 Coin)\n`.gacha 10` (25.000 Coin)';

/** Parse args to a pull count, or null when usage should be shown. */
export function parseGachaArgs(args) {
  if (!args || args.length === 0) return null;
  const count = Number(args[0]);
  if (!Number.isInteger(count)) throw new RangeError('Jumlah gacha harus 1 atau 10.');
  if (!(count in GACHA_CONFIG.costs)) {
    throw new RangeError('Jumlah gacha harus 1 atau 10.');
  }
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

/** Pure result renderer. No I/O, no services. */
export function formatGachaResult(outcome) {
  const lines = ['🎰 *GACHA RESULT*', ''];
  for (const result of outcome.results) lines.push(resultLine(result));
  const mains = {};
  const items = {};
  let zonk = 0;
  for (const result of outcome.results) {
    if (result.type === 'main') mains[result.cardName] = (mains[result.cardName] ?? 0) + 1;
    else if (result.type === 'shopItem') {
      items[result.itemName] = (items[result.itemName] ?? 0) + result.quantity;
    } else zonk += 1;
  }
  lines.push('', '🎁 *Total Reward:*');
  for (const [name, qty] of Object.entries(mains)) lines.push(`• ${name} ×${qty}`);
  for (const [name, qty] of Object.entries(items)) lines.push(`• ${name} ×${qty}`);
  if (zonk > 0) lines.push(`• Zonk ×${zonk}`);
  return lines.join('\n');
}

/**
 * Full command flow with injectable delay (tests assert one delay).
 * Animation sent once, single wait, pulls run once, result sent once.
 */
export async function executeGacha(ctx, { sleepFn = F.sleep, pullFn = null } = {}) {
  const count = parseGachaArgs(ctx.args);
  if (count === null) {
    await ctx.reply(GACHA_USAGE);
    return;
  }
  await ctx.reply('🎰 Sedang melakukan gacha...');
  await sleepFn(GACHA_CONFIG.animationDelayMs);
  const pull = pullFn ?? ((sender, n, opts) => gachaService.pull(sender, n, opts));
  const outcome = await pull(ctx.sender, count, {
    requestKey: makeRequestKey(ctx.sender),
  });
  await ctx.reply(
    `${formatGachaResult(outcome)}\n\n💰 Cost: ${F.formatNumber(outcome.total)} Coin`
  );
}

export default {
  name: 'gacha',
  aliases: ['gach', 'roll'],
  category: 'rpg',
  description: 'Gacha Main Card dan item (.gacha 1 / .gacha 10)',
  cooldown: 10_000,

  async execute(ctx) {
    try {
      await executeGacha(ctx);
    } catch (err) {
      await ctx.reply(`Gagal: ${err.message}`);
    }
  },
};
