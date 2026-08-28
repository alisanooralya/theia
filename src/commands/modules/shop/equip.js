import { shopService } from '#features/economy/shop.js';
import { userModel } from '#storage/models/index.js';

export default {
  name: 'equip',
  aliases: ['pakai', 'unequip', 'lepas'],
  category: 'shop',
  description: 'Equip/unequip weapon atau armor',
  cooldown: 5_000,
  isProblem: true,

  async execute(ctx) {
    const first = ctx.args[0]?.toLowerCase();

    userModel.ensure(ctx.sender, { pushName: ctx.pushName });
    const user = userModel.findById(ctx.sender);

    try {
      if (first === 'unequip' || first === 'lepas') {
        const slot = ctx.args[1]?.toLowerCase();
        if (!slot)
          ctx.fail(
            'Usage: `.equip unequip <weapon/armor>`\nContoh: `.equip unequip weapon`'
          );
        const result = shopService.unequip(ctx.sender, slot, user.level);
        await ctx.reply(
          `✅ *${slot}* dilepas. ATK: ${result.atk}, DEF: ${result.def}, HP: ${result.maxHp}`
        );
      } else {
        if (!first)
          ctx.fail(
            'Usage: `.equip <item_id>` | `.equip unequip <weapon/armor>`'
          );
        const result = shopService.equip(ctx.sender, first, user.level);
        await ctx.reply(
          `✅ *${result.item.name}* dipasang! ATK: ${result.atk}, DEF: ${result.def}, HP: ${result.maxHp}`
        );
      }
    } catch (err) {
      await ctx.reply(`❌ ${err.message}`);
    }
  },
};
