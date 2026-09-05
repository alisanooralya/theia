import { workService as work } from '#features/economy/work.js';
import { userModel } from '#storage/models/index.js';
import { Button } from '#messages/builder.js';
import { F } from '#helpers/index.js';

const COOLDOWN_MS = 12 * 60 * 60 * 1000;

function workMenu(ctx) {
  const builder = new Button(ctx.sock)
    .setTitle('💼 WORK')
    .setSubtitle('Pilih pekerjaan, tunggu, lalu ambil upah')
    .setBody('Pilih pekerjaan yang mau kamu kerjakan')
    .setFooter('Upah final diundi saat pekerjaan selesai')
    .addSelection('💼 Pilih Pekerjaan')
    .makeSection('Daftar Pekerjaan');

  for (const job of work.jobs) {
    builder.makeRow(
      '',
      `${job.emoji} ${job.label}`,
      work.jobLine(job),
      `.work ${job.id}`
    );
  }

  return builder.send(ctx.jid);
}

function statusMessage(ctx, state) {
  const text = work.formatStatus(state);
  if (!state.finished) return ctx.reply(text);

  return new Button(ctx.sock)
    .setTitle('💼 WORK')
    .setSubtitle('Pekerjaan selesai')
    .setBody(text)
    .addReply('✅ CLAIM', '.work claim')
    .send(ctx.jid);
}

export default {
  name: 'work',
  aliases: ['kerja', 'bekerja'],
  category: 'economy',
  description: 'Cari uang dengan bekerja',
  cooldown: COOLDOWN_MS,
  manualCooldown: true,

  async execute(ctx) {
    await userModel.ensure(ctx.sender, { pushName: ctx.pushName });

    const sub = ctx.args[0]?.toLowerCase();
    const state = await work.getState(ctx.sender);

    if (sub === 'claim') {
      if (!state.active)
        return ctx.fail(
          'Kamu belum bekerja. Ketik `.work` untuk pilih pekerjaan.'
        );
      if (!state.finished) return statusMessage(ctx, state);

      const result = await work.claim(ctx.sender);
      await ctx.applyCooldown();

      return ctx.reply(
        [
          work.formatClaim(result),
          '',
          `⏱️ Kerja berikutnya: ${F.formatDuration(COOLDOWN_MS)} lagi.`,
        ].join('\n')
      );
    }

    if (state.active) return statusMessage(ctx, state);
    if (!sub) return workMenu(ctx);

    const job = work.getJob(sub);
    if (!job)
      return ctx.fail(
        [
          'Pekerjaan tidak ditemukan.',
          '',
          'Pilihan yang tersedia:',
          ...work.jobs.map((item) => `- \`.work ${item.id}\` — ${item.label}`),
          '',
          'Atau ketik `.work` untuk daftar lengkap.',
        ].join('\n')
      );

    const row = await work.start(ctx.sender, job.id);
    return ctx.reply(work.formatStarted(row));
  },
};
