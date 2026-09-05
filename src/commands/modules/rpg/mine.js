import { meteorService as meteor } from '#features/rpg/meteor.js';
import { userModel } from '#storage/models/index.js';
import { Button } from '#messages/builder.js';

function meteorCard(ctx, state) {
  // Tanpa Mining Point tidak ada tombol yang bisa ditawarkan, dan interactive
  // message tanpa button tidak dirender konsisten — jadi kirim teks biasa.
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
    .setFooter('Tap MINE untuk menambang (1 Mining Point)')
    .addReply('⛏️ MINE', '.mine hit')
    .send(ctx.jid);
}

export default {
  name: 'mine',
  aliases: ['mining', 'tambang', 'meteor'],
  category: 'rpg',
  description: 'Tambang Meteor bersama user lain',
  cooldown: 5_000,

  async execute(ctx) {
    await userModel.ensure(ctx.sender, { pushName: ctx.pushName });

    const sub = ctx.args[0]?.toLowerCase();

    if (sub === 'hit' || sub === 'mine') {
      const result = await meteor.mine(ctx.sender);

      if (!result.cleared) {
        return ctx.reply(meteor.formatMineResult(result));
      }

      const { text, mentions } = meteor.formatCleared(result, ctx.sender);
      return ctx.reply({ text, mentions });
    }

    const state = await meteor.getState(ctx.sender);

    if (!state.meteor) {
      return ctx.reply(
        [
          '☄️ *METEOR MINE*',
          '',
          'Meteor hari ini sudah hancur.',
          'Meteor berikutnya muncul besok.',
          '',
          `🔋 Mining Point: ${state.pointsLeft}/${meteor.config.maxPointsPerDay}`,
        ].join('\n')
      );
    }

    return meteorCard(ctx, state);
  },
};
