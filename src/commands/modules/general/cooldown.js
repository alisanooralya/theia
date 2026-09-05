import {
  cooldownModel,
  workModel,
  expeditionModel,
} from '#storage/models/index.js';
import { F } from '#helpers/index.js';

export default {
  name: 'cooldown',
  aliases: ['cd'],
  category: 'general',
  description: 'Lihat cooldown fitur yang sedang aktif',
  cooldown: 5_000,

  async execute(ctx) {
    const active = await cooldownModel.getByUser(ctx.sender);
    const lines = [];

    const work = await workModel.findActive(ctx.sender);
    if (work) {
      const remaining = Number(work.ends_at) * 1000 - Date.now();
      if (remaining > 0) {
        lines.push(`• *work* (${work.job}) — ${F.formatDuration(remaining)}`);
      }
    }

    const exp = await expeditionModel.findActive(ctx.sender);
    if (exp) {
      const remaining = Number(exp.ends_at) * 1000 - Date.now();
      if (remaining > 0) {
        lines.push(
          `• *expedition* (${exp.type}/${exp.duration}) — ${F.formatDuration(remaining)}`
        );
      }
    }

    for (const { command, remaining } of active) {
      lines.push(`• *${command}* — ${F.formatDuration(remaining)}`);
    }

    if (lines.length === 0)
      return ctx.reply(
        '✅ Tidak ada cooldown aktif. Semua fitur siap digunakan!'
      );

    return ctx.reply(`⏳ *Cooldown Aktif*\n\n${lines.join('\n')}`);
  },
};
