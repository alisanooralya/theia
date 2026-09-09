import { F } from '#helpers/index.js';
import { Button } from '#messages/builder.js';
import { workService as work } from '#features/economy/services/work-service.js';
import {
  JOBS,
  WORK_COOLDOWN_MS,
  jobLine,
} from '#features/economy/config/work-config.js';

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
      jobLine(job),
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
  cooldown: WORK_COOLDOWN_MS,
  manualCooldown: true,

  async execute(ctx) {
    const sub = ctx.args[0]?.toLowerCase();
    const state = await work.getState(ctx.sender, { pushName: ctx.pushName });

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
          `⏱️ Kerja berikutnya: ${F.formatDuration(WORK_COOLDOWN_MS)} lagi.`,
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
          ...JOBS.map((item) => `- \`.work ${item.id}\` — ${item.label}`),
          '',
          'Atau ketik `.work` untuk daftar lengkap.',
        ].join('\n')
      );

    const row = await work.start(ctx.sender, job.id, {
      pushName: ctx.pushName,
    });
    return ctx.reply(work.formatStarted(row));
  },
};
