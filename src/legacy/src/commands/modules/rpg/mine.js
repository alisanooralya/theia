import { meteorService as meteor } from '#features/rpg/meteor.js';
import { userModel } from '#storage/models/index.js';
import { F } from '#helpers/index.js';
import { Button } from '#messages/builder.js';

function meteorCard(ctx, state) {
  if (state.pointsLeft <= 0) {
    return ctx.reply(
      [
        meteor.formatStatus(state),
        '',
        'Mining Point habis. Reset jam 00:00.',
      ].join('\n')
    );
  }

  return new Button(ctx.sock)
    .setTitle('☄️ METEOR MINE')
    .setSubtitle('Target bersama — tambang sampai HP habis')
    .setBody(meteor.formatStatus(state))
    .addReply('⛏️ MINE', '.mine hit')
    .send(ctx.jid);
}

export default {
  name: 'mine',
  aliases: ['mining', 'tambang'],
  category: 'rpg',
  description: 'Tambang Meteor bersama user lain',
  cooldown: meteor.config.cooldownMs,
  manualCooldown: true,

  async execute(ctx) {
    await userModel.ensure(ctx.sender, { pushName: ctx.pushName });

    const sub = ctx.args[0]?.toLowerCase();

    if (sub === 'hit') {
      const result = await meteor.mine(ctx.sender);
      await ctx.applyCooldown();

      if (result.alreadyCleared) {
        return ctx.reply(
          [
            '☄️ Meteor keburu hancur.',
            '',
            `Bagian kamu: 🪙 +${F.formatNumber(result.coin)} • ⭐ +${F.formatNumber(result.exp)}`,
          ].join('\n')
        );
      }

      if (!result.cleared) {
        return ctx.reply(meteor.formatMineResult(result));
      }

      const { text, mentions } = meteor.formatCleared(result, ctx.sender);
      return ctx.reply({ text, mentions });
    }

    const state = await meteor.getState(ctx.sender);

    if (!state.meteor) {
      const lines = [
        '☄️ *METEOR MINE*',
        '',
        'Meteor hari ini sudah hancur.',
        'Meteor berikutnya muncul besok.',
        '',
        `🔋 Mining Point: ${state.pointsLeft}/${meteor.config.maxPointsPerDay}`,
      ];
      if (state.lastReward) {
        lines.push(
          '',
          `Bagian kamu: 🪙 +${F.formatNumber(state.lastReward.coin)} • ⭐ +${F.formatNumber(state.lastReward.exp)}`
        );
      }
      return ctx.reply(lines.join('\n'));
    }

    return meteorCard(ctx, state);
  },
};
