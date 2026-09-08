import {
  cooldownModel,
  workModel,
  expeditionModel,
} from '#storage/models/index.js';
import { F } from '#helpers/index.js';
import SETTINGS from '#environment/settings.js';

export default {
  name: 'cooldown',
  aliases: ['cd'],
  category: 'general',
  description: 'Lihat cooldown fitur yang sedang aktif',
  cooldown: 5_000,

  async execute(ctx) {
    const active = await cooldownModel.getByUser(ctx.sender);
    const lines = [];
    const ready = [];
    const prefix = SETTINGS.prefix;

    const work = await workModel.findActive(ctx.sender);
    if (work) {
      const remaining = Number(work.ends_at) * 1000 - Date.now();
      if (remaining > 0) {
        lines.push(`• *work* (${work.job}) — ${F.formatDuration(remaining)}`);
      } else {
        ready.push(`• *work* (${work.job}) — \`${prefix}work claim\``);
      }
    }

    const exp = await expeditionModel.findActive(ctx.sender);
    if (exp) {
      const remaining = Number(exp.ends_at) * 1000 - Date.now();
      if (remaining > 0) {
        lines.push(
          `• *expedition* (${exp.type}/${exp.duration}) — ${F.formatDuration(remaining)}`
        );
      } else {
        ready.push(
          `• *expedition* (${exp.type}/${exp.duration}) — \`${prefix}expedition claim\``
        );
      }
    }

    for (const { command, remaining } of active) {
      lines.push(`• *${command}* — ${F.formatDuration(remaining)}`);
    }

    const sections = [];
    if (ready.length > 0)
      sections.push(`🎁 *Siap Diklaim*\n\n${ready.join('\n')}`);
    if (lines.length > 0)
      sections.push(`⏳ *Cooldown Aktif*\n\n${lines.join('\n')}`);

    if (sections.length === 0)
      return ctx.reply(
        '✅ Tidak ada cooldown aktif. Semua fitur siap digunakan!'
      );

    return ctx.reply(sections.join('\n\n'));
  },
};
