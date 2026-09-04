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

    if (active.length === 0)
      return ctx.reply('✅ Tidak ada cooldown aktif. Semua fitur siap digunakan!');

    const lines = active
      .sort((a, b) => b.remaining - a.remaining)
      .map(({ command, remaining }) => {
        return `• *${command}* — ${F.formatDuration(remaining)}`;
      });

    return ctx.reply(
      `⏳ *Cooldown Aktif*\n\n${lines.join('\n')}`
    );
  },
};
