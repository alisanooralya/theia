import { jidNormalizedUser } from 'baileys';

export function normJid(j) {
  try {
    return jidNormalizedUser(String(j));
  } catch {
    return String(j);
  }
}

export function senderCandidates(ctx) {
  return [
    ctx.sender,
    ctx.msg?.senderAlt,
    ctx.msg?.senderLid,
    ctx.raw?.participant,
  ]
    .filter(Boolean)
    .map(normJid);
}

export async function isGroupAdmin(ctx) {
  if (!ctx.isGroup) return false;
  try {
    const meta = await ctx.sock.groupMetadata(ctx.jid);
    const admins = meta.participants
      .filter((p) => p.admin === 'admin' || p.admin === 'superadmin')
      .flatMap((p) => [p.id, p.jid, p.phoneNumber].filter(Boolean))
      .map(normJid);

    return senderCandidates(ctx).some((c) => admins.includes(c));
  } catch {
    return null;
  }
}
