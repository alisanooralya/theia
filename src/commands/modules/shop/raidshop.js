import { raidService as raid } from '#features/rpg/raid.js';
import { userModel } from '#storage/models/index.js';
import { cardService, RAID_SHOP } from '#features/rpg/card.js';

export default {
  name: 'raidshop',
  aliases: ['raidershop', 'rs'],
  category: 'shop',
  description: 'Toko item Raid Coin',
  cooldown: 5_000,

  async execute(ctx) {
    try {
      await userModel.ensure(ctx.sender, { pushName: ctx.pushName });
      const sub = ctx.args[0]?.toLowerCase();
      if (sub === 'buy') {
        const productId = ctx.args[1]?.toLowerCase();
        const quantity = Number.parseInt(ctx.args[2] ?? '1', 10);
        const result = await cardService.buyRaidShop(
          ctx.sender,
          productId,
          quantity
        );
        return ctx.reply(
          `✅ Membeli *${result.product.name}* ×${result.quantity} seharga 💠${result.cost} Raid Coin.`
        );
      }
      const raidCoin = await raid.getRaidCoin(ctx.sender);
      const text = [
        '╭──── 🏪 *RAID SHOP* ────╮',
        '│',
        `│ 💠 Raid Coin: *${raidCoin}*`,
        '│',
        `│ 🧩 ${RAID_SHOP.card_core.name} ×1 — 💠${RAID_SHOP.card_core.price}`,
        '│ Material upgrade Main Card',
        '│ Beli: `.raidshop buy card_core [jumlah]`',
        '│',
        `│ 🎴 ${RAID_SHOP.raid_emblem.name} — 💠${RAID_SHOP.raid_emblem.price}`,
        '│ Support Card Lv.1',
        '│ Beli: `.raidshop buy raid_emblem`',
        '│',
        '╰──────────────────────╯',
      ].join('\n');
      return ctx.reply(text);
    } catch (error) {
      return ctx.fail(error.message);
    }
  },
};
