import {
  jidNormalizedUser,
  isJidGroup,
  isJidBroadcast,
  isJidStatusBroadcast,
} from 'baileys';

export const normalizeJid = (jid) => (jid ? jidNormalizedUser(jid) : null);
export const isGroup = (jid) => !!jid && isJidGroup(jid);
export const isBroadcast = (jid) => !!jid && isJidBroadcast(jid);
export const isStatus = (jid) => !!jid && isJidStatusBroadcast(jid);
export const isPnUser = (jid) => !!jid && jid.endsWith('@s.whatsapp.net');
export const isLidUser = (jid) => !!jid && jid.endsWith('@lid');
export const isValidSender = (jid) =>
  isPnUser(jid) || isLidUser(jid) || isGroup(jid);

export const phoneToJid = (phone) =>
  `${phone.replace(/\D/g, '')}@s.whatsapp.net`;
export const jidToPhone = (jid) => jid?.split('@')[0] ?? '';
export const mentionText = (jid) => `@${jidToPhone(jid)}`;

export async function getLidForPn(sock, pnJid) {
  try {
    return (await sock.signalRepository.lidMapping.getLIDForPN(pnJid)) ?? null;
  } catch {
    return null;
  }
}

export async function getPnForLid(sock, lid) {
  try {
    return (await sock.signalRepository.lidMapping.getPNForLID(lid)) ?? null;
  } catch {
    return null;
  }
}

export const resolveId = (jid) => jidNormalizedUser(jid);

/**
 * Semua identitas bot yang mungkin muncul di pesan (PN dan LID), sudah
 * dinormalisasi. WhatsApp bisa merujuk bot lewat salah satu dari keduanya,
 * tergantung konteks chat dan versi klien pengirim.
 */
export function getBotJids(sock) {
  return [sock?.user?.id, sock?.user?.lid]
    .filter(Boolean)
    .map((jid) => jidNormalizedUser(jid))
    .filter(Boolean);
}
