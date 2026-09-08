import { expeditionService as expedition } from '#features/rpg/expedition.js';
import { userModel } from '#storage/models/index.js';
import { Button } from '#messages/builder.js';
import { F } from '#helpers/index.js';

const COOLDOWN_MS = 12 * 60 * 60 * 1000;

function expeditionMenu(ctx) {
  const builder = new Button(ctx.sock)
    .setTitle('🧭 EXPEDITION')
    .setSubtitle('Kirim ekspedisi, tunggu, lalu klaim')
    .setBody('Pilih jenis expedition dan durasinya')
    .setFooter('Reward hanya cair setelah di-claim')
    .addSelection('🧭 Pilih Expedition');

  for (const [type, category] of Object.entries(expedition.categories)) {
    builder.makeSection(category.label, category.hint);

    for (const [key, option] of Object.entries(category.options)) {
      builder.makeRow(
        '',
        `${category.emoji} ${option.name}`,
        expedition.optionLine(option),
        `.expedition ${type} ${key}`
      );
    }
  }

  return builder.send(ctx.jid);
}

function statusMessage(ctx, state) {
  const text = expedition.formatStatus(state);
  if (!state.finished) return ctx.reply(text);

  return new Button(ctx.sock)
    .setTitle('🧭 EXPEDITION')
    .setSubtitle('Expedition selesai')
    .setBody(text)
    .setFooter('Tap CLAIM untuk mencairkan reward')
    .addReply('✅ CLAIM', '.expedition claim')
    .send(ctx.jid);
}

export default {
  name: 'expedition',
  aliases: ['expe', 'ekspedisi'],
  category: 'rpg',
  description: 'Kirim ekspedisi pasif untuk Coin atau EXP',
  cooldown: COOLDOWN_MS,
  manualCooldown: true,

  async execute(ctx) {
    await userModel.ensure(ctx.sender, { pushName: ctx.pushName });

    const sub = ctx.args[0]?.toLowerCase();
    const durationKey = ctx.args[1]?.toLowerCase();
    const state = await expedition.getState(ctx.sender);

    if (sub === 'claim') {
      if (!state.active)
        return ctx.fail(
          'Tidak ada expedition yang bisa diklaim. Ketik `.expedition` dulu.'
        );
      if (!state.finished) return statusMessage(ctx, state);

      const result = await expedition.claim(ctx.sender);
      await ctx.applyCooldown();

      return ctx.reply(
        [
          expedition.formatClaim(result),
          '',
          `⏱️ Expedition berikutnya: ${F.formatDuration(COOLDOWN_MS)} lagi.`,
        ].join('\n')
      );
    }

    if (state.active) return statusMessage(ctx, state);
    if (!sub) return expeditionMenu(ctx);

    const category = expedition.getCategory(sub);
    if (!category)
      return ctx.fail(
        [
          'Jenis expedition tidak valid.',
          '',
          ...Object.entries(expedition.categories).map(
            ([key, item]) => `- \`.expedition ${key} <durasi>\` — ${item.name}`
          ),
          '',
          'Atau ketik `.expedition` untuk daftar lengkap.',
        ].join('\n')
      );

    const option = expedition.getOption(sub, durationKey);
    if (!option)
      return ctx.fail(
        [
          `${category.label} — pilih durasinya:`,
          ...Object.entries(category.options).map(
            ([key, item]) =>
              `- \`.expedition ${sub} ${key}\` — ${expedition.optionLine(item)}`
          ),
          '',
          'Atau ketik `.expedition` untuk daftar lengkap.',
        ].join('\n')
      );

    const row = await expedition.start(ctx.sender, sub, durationKey);
    return ctx.reply(expedition.formatStarted(row));
  },
};
