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
      ![
        'mute',
        'antitoxic',
        'greeting',
        'openclose',
        'raid',
        'welcome',
      ].includes(sub) ||
      !['on', 'off'].includes(value)
    ) {
      const g = await groupModel.find(jid);
      return ctx.reply(
        `*Pengaturan Grup*\n\n🔇 Mute: ${g?.mute ? '✅' : '❌'}\n🚫 Antitoxic: ${g?.antitoxic ? '✅' : '❌'}\n🌅 Greeting: ${g?.greeting ? '✅' : '❌'}\n🔄 Open/Close: ${g?.openclose ? '✅' : '❌'}\n⚔️ Raid: ${g?.raid ? '✅' : '❌'}\n👋 Welcome: ${g?.welcome ? '✅' : '❌'}\n\nUsage: \`${SETTINGS.prefix}groupset mute <on/off>\`${ctx.isGroup ? '' : ' <id grup>@g.us'}`
      );
    }

    const updates = {};
    updates[sub] = value === 'on' ? 1 : 0;
    await groupModel.update(jid, updates);
    await ctx.reply(
      `✅ *${sub}* ${value === 'on' ? 'diaktifkan' : 'dinonaktifkan'}${!ctx.isGroup ? ` untuk \`${jid}\`` : ''}.`
    );
  },
};
