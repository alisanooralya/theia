import { cooldownModel } from '#storage/models/index.js';
import { F } from '#helpers/index.js';
import { expeditionService } from '#features/rpg/services/expedition-service.js';
import { createWorkService } from '#features/economy/services/work-service.js';

const workSvc = createWorkService();

export default {
  name: 'cooldown',
  aliases: ['cd'],
  category: 'general',
  description: 'Lihat cooldown fitur yang sedang aktif',
  cooldown: 5_000,

  async execute(ctx) {
    const active = await cooldownModel.getByUser(ctx.sender);
    const lines = [];

    for (const { command, remaining } of active) {
      lines.push(`• *${command}* — ${F.formatDuration(remaining)}`);
    }

    try {
      const expeditionState = await expeditionService.getState(ctx.sender);
      if (expeditionState.active) {
        const remaining = expeditionState.remainingMs;
        const label = expeditionState.option?.name ?? 'Expedition';
        const category = expeditionState.category?.name ?? '';
        if (expeditionState.finished) {
          lines.push(
            `• *Expedition (${category} ${label})* — ✅ Selesai, siap diklaim!`
          );
        } else {
          lines.push(
            `• *Expedition (${category} ${label})* — ${F.formatDuration(remaining)}`
          );
        }
      }
    } catch {}

    try {
      const workState = await workSvc.getState(ctx.sender);
      if (workState.active) {
        const remaining = workState.remainingMs;
        const jobName = workState.job?.name ?? 'Work';
        if (workState.finished) {
          lines.push(`• *Work (${jobName})* — ✅ Selesai, siap diklaim!`);
        } else {
          lines.push(`• *Work (${jobName})* — ${F.formatDuration(remaining)}`);
        }
      }
    } catch {}

    if (lines.length === 0)
      return ctx.reply(
        '✅ Tidak ada cooldown aktif. Semua fitur siap digunakan!'
      );

    return ctx.reply(`⏳ *Cooldown Aktif*\n\n${lines.join('\n')}`);
  },
};
