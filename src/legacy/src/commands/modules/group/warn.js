import { sql } from '#storage/connection.js';
import { phoneToJid } from '#helpers/identifier.js';
import { logger } from '#helpers/logger.js';

const MAX_HEALTH = 100;

const WARN_REASONS = [
  { id: 1, label: 'No Respect every member', damage: 5 },
  { id: 2, label: 'Spam or Flooding', damage: 5 },
  { id: 3, label: 'Toxic or Drama', damage: 10 },
  { id: 4, label: 'NSFW', damage: 30 },
  { id: 5, label: 'Ignore someone', damage: 5 },
  { id: 6, label: 'Unnecessary or Provoking', damage: 10 },
  { id: 7, label: 'Harassment, bullying, or targeted hate', damage: 20 },
  { id: 8, label: 'Share private information', damage: 30 },
  { id: 9, label: 'Intentionally disturb or disrupt', damage: 10 },
  { id: 10, label: 'repeatedly break the same rule', damage: 15 },
];

async function getHealth(jid, groupJid) {
  const rows = await sql`
    SELECT COALESCE(SUM(damage), 0)::int AS d FROM warns WHERE jid = ${jid} AND group_jid = ${groupJid}
  `;
  return Math.max(0, MAX_HEALTH - (rows[0]?.d ?? 0));
}

function reasonsList() {
  return WARN_REASONS.map((r) => `  ${r.id}. ${r.label} (-${r.damage})`).join(
    '\n'
  );
}

export { getHealth, MAX_HEALTH };

export default {
  name: 'warn',
  aliases: ['peringatan', 'warning'],
  category: 'group',
  description: 'Warn member grup (sistem health)',
  cooldown: 5_000,
  groupOnly: true,
  adminOnly: true,
  requireBotAdmin: true,

  async execute(ctx) {
    const targetJid =
      ctx.mentions[0] ??
      (ctx.quoted?.sender && !ctx.quoted.sender.endsWith('@g.us')
        ? ctx.quoted.sender
        : null) ??
      (ctx.args[0] && ctx.args[0].includes('@')
        ? phoneToJid(ctx.args[0])
        : null);
    if (!targetJid)
      ctx.fail(
        `Usage: \`.warn @tag <nomor>\` atau reply pesan target lalu \`.warn <nomor>\`\n\nPilih nomor alasan:\n${reasonsList()}`
      );

    const num = parseInt(ctx.args.find((a) => /^\d+$/.test(a)));
    const reason = WARN_REASONS.find((r) => r.id === num);
    if (!reason) ctx.fail(`Pilih nomor alasan:\n${reasonsList()}`);

    if (targetJid === ctx.sender)
      return ctx.reply('Tidak bisa warn diri sendiri.');

    await sql`
      INSERT INTO warns (jid, group_jid, reason, damage) VALUES (${targetJid}, ${ctx.jid}, ${`${reason.id}. ${reason.label}`}, ${reason.damage})
    `;

    const health = await getHealth(targetJid, ctx.jid);

    if (health <= 0) {
      try {
        await ctx.sock.groupParticipantsUpdate(ctx.jid, [targetJid], 'remove');
      } catch (err) {
        logger.warn({ err }, 'Failed to kick warned user');
      }
      await sql`DELETE FROM warns WHERE jid = ${targetJid} AND group_jid = ${ctx.jid}`;
      return ctx.reply(`@${targetJid.split('@')[0]} health 0 dan di-kick!`, {
        mentions: [targetJid],
      });
    }

    await ctx.reply(
      `@${targetJid.split('@')[0]} di-warn: ${reason.label} (-${reason.damage})\n❤️ Health: ${health}/${MAX_HEALTH}`,
      { mentions: [targetJid] }
    );
  },
};
