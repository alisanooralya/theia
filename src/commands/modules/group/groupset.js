import { groupModel } from '#storage/models/index.js';
import SETTINGS from '#environment/settings.js';

export default {
  name: 'groupset',
  aliases: ['gset', 'grpset'],
  category: 'group',
  description: 'Atur pengaturan grup',
  cooldown: 5_000,
  groupOnly: true,
  adminOnly: true,
  bypassMute: true,

  async execute(ctx) {
    const sub = ctx.args[0]?.toLowerCase();
    const value = ctx.args[1]?.toLowerCase();
    const targetJid = ctx.args.find((a) => a.includes('@g.us'));
    const jid = ctx.isGroup ? ctx.jid : targetJid;

    if (!ctx.isGroup && !jid) {
      return ctx.reply(
        `Kamu di chat pribadi. Sertakan ID grup:\n\`${SETTINGS.prefix}groupset <sub> <on/off> <id grup>@g.us\``
      );
    }

    if (
      !sub ||
      !['mute', 'antitoxic', 'greeting', 'openclose', 'raid'].includes(sub) ||
      !['on', 'off'].includes(value)
    ) {
      const g = groupModel.find(jid);
      return ctx.reply(
        `*Pengaturan Grup*\n\n🔇 Mute: ${g?.mute ? '✅' : '❌'}\n🚫 Antitoxic: ${g?.antitoxic ? '✅' : '❌'}\n🌅 Greeting: ${g?.greeting ? '✅' : '❌'}\n🔄 Open/Close: ${g?.openclose ? '✅' : '❌'}\n⚔️ Raid: ${g?.raid ? '✅' : '❌'}\n\nUsage: \`${SETTINGS.prefix}groupset <mute/antitoxic/greeting/openclose/raid> <on/off>\`${ctx.isGroup ? '' : ' <id grup>@g.us'}\n\nℹ️ Raid: notifikasi mulai/selesai raid akan dikirim ke grup ini.`
      );
    }

    const updates = {};
    updates[sub] = value === 'on' ? 1 : 0;
    groupModel.update(jid, updates);
    await ctx.reply(
      `✅ *${sub}* ${value === 'on' ? 'diaktifkan' : 'dinonaktifkan'}${!ctx.isGroup ? ` untuk \`${jid}\`` : ''}.`
    );
  },
};
