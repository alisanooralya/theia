import { cooldownModel } from '#storage/models/index.js';
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
