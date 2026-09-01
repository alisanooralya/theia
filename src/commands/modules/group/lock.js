export const closeCommand = {
  name: 'close',
  aliases: ['tutup', 'lock', 'closegc'],
  category: 'group',
  description: 'Tutup grup',
  cooldown: 5_000,
  groupOnly: true,
  adminOnly: true,
  requireBotAdmin: true,

  async execute(ctx) {
    try {
      await ctx.sock.groupSettingUpdate(ctx.jid, 'announcement');
      await ctx.reply(
        '🔒 Grup ditutup! Sekarang hanya admin yang bisa mengirim pesan.'
      );
    } catch (err) {
      return ctx.fail(`❌ ${err.message}`);
    }
  },
};

export const openCommand = {
  name: 'open',
  aliases: ['buka', 'unlock', 'opengc'],
  category: 'group',
  description: 'Buka grup',
  cooldown: 5_000,
  groupOnly: true,
  adminOnly: true,
  requireBotAdmin: true,

  async execute(ctx) {
    try {
      await ctx.sock.groupSettingUpdate(ctx.jid, 'not_announcement');
      await ctx.reply(
        '🔓 Grup dibuka! Sekarang semua member bisa mengirim pesan.'
      );
    } catch (err) {
      return ctx.fail(`❌ ${err.message}`);
    }
  },
};
