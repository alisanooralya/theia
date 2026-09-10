import os from 'os';
import { commandRegistry } from '#commands/registry.js';
import SETTINGS from '#environment/settings.js';
import { F } from '#helpers/index.js';

const CAT_ICONS = {
  general: '📋',
  group: '👥',
  owner: '👑',
  rpg: '🎮',
  utility: '🔧',
};

export default {
  name: 'help',
  aliases: ['h', 'menu'],
  category: 'general',
  description: 'Lihat semua command yang tersedia',
  cooldown: 5_000,

  async execute(ctx) {
    const isAll = ctx.args?.[0]?.toLowerCase() === 'all';
    const categories = commandRegistry.getCategories();
    const visible = isAll
      ? categories
      : ['economy', 'rpg', 'utility'].filter((cat) => categories.includes(cat));
    const prefix = SETTINGS.prefix;
    const botName = SETTINGS.botName;

    let text = [
      `╭──┄  *DASHBOARD*  ┄──`,
      `│• *Bot name*: ${botName}`,
      `│• *Prefix*: [ ${prefix} ]`,
      `│• *Uptime*: ${F.formatDuration(process.uptime() * 1000)}`,
      `│• *Platform*: ${os.platform()}`,
      `│• *Memory used*: ${F.formatBytes(os.totalmem() - os.freemem())} / ${F.formatBytes(os.totalmem())}`,
      `│`,
      `│• *Date*: ${formatDate()}`,
      `│• *Islamic*: ${dateIslamic()}`,
      `│• *Commands*: ${commandRegistry.count()} tersedia`,
      `╰─────── ୨୧ ───────┘`,
    ].join('\n');

    const more = String.fromCharCode(8206);
    const sections = [];

    for (const cat of visible) {
      const cmds = commandRegistry.getByCategory(cat);
      if (!cmds.length) continue;
      const icon = CAT_ICONS[cat] ?? '📁';
      const lines = cmds.map(
        (cmd) =>
          `│ • \`${prefix}${cmd.name}\` — ${cmd.description ?? 'No description'}`
      );
      sections.push(
        [`┌ • ${icon} ${cat.toUpperCase()}`, ...lines, `╰───────···`].join('\n')
      );
    }

    text += `\n${more.repeat(4001)}\n` + sections.join('\n');

    await ctx.reply(text);
  },
};

function formatDate() {
  return new Date().toLocaleString('id-ID', {
    timeZone: SETTINGS.timezone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function dateIslamic() {
  return Intl.DateTimeFormat('id-u-ca-islamic', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date());
}
