import os from 'os';
import { jidNormalizedUser } from 'baileys';
import { commandRegistry } from '#commands/registry.js';
import SETTINGS from '#environment/settings.js';
import { logger } from '#helpers/logger.js';
import { F } from '#helpers/index.js';

async function isPrivileged(ctx) {
  if (ctx.isOwner()) return true;
  if (ctx.isGroup) {
    try {
      const meta = await ctx.sock.groupMetadata(ctx.jid);
      const admins = meta.participants
        .filter((p) => p.admin === 'admin' || p.admin === 'superadmin')
        .flatMap((p) => [p.id, p.jid, p.phoneNumber].filter(Boolean))
        .map(jidNormalizedUser);
      const candidates = [
        ctx.sender,
        ctx.msg?.senderAlt,
        ctx.msg?.senderLid,
        ctx.raw?.participant,
      ]
        .filter(Boolean)
        .map(jidNormalizedUser);
      if (candidates.some((c) => admins.includes(c))) return true;
    } catch {}
  }
  return false;
}

const CAT_ICONS = {
  general: '📋',
  economy: '💰',
  rpg: '⚔️',
  shop: '🛒',
  group: '👥',
  owner: '👑',
  utility: '🔧',
};

export default {
  name: 'help',
  aliases: ['h', 'menu'],
  category: 'general',
  description: 'Lihat semua command yang tersedia',
  cooldown: 5_000,

  async execute(ctx) {
    const categories = commandRegistry.getCategories();
    const privileged = await isPrivileged(ctx);
    const hidden = privileged ? [] : ['owner', 'group'];
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

    for (const cat of categories) {
      if (hidden.includes(cat)) continue;
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
