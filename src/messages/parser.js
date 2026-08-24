import {
  getContentType,
  jidNormalizedUser,
  downloadMediaMessage,
} from 'baileys';
import { isStatus } from '#helpers/identifier.js';

const MEDIA_TYPES = new Set([
  'imageMessage',
  'videoMessage',
  'audioMessage',
  'documentMessage',
  'stickerMessage',
  'ptvMessage',
]);

export async function parseMessage(raw, sock) {
  if (!raw?.message) return null;

  const jid = raw.key?.remoteJid;
  if (!jid || isStatus(jid)) return null;

  const fromMe = raw.key?.fromMe ?? false;
  const isGroup = jid.endsWith('@g.us');
  const jidAlt = raw.key?.remoteJidAlt ?? null;

  const participant = isGroup
    ? (raw.key?.participant ?? raw.participant ?? jid)
    : jid;
  const participantAlt = isGroup ? (raw.key?.participantAlt ?? null) : jidAlt;

  const rawA = participant ? jidNormalizedUser(participant) : null;
  const rawB = participantAlt ? jidNormalizedUser(participantAlt) : null;

  let phoneCandidate =
    [rawA, rawB].find((x) => x?.endsWith('@s.whatsapp.net')) ?? null;
  const lidCandidate = [rawA, rawB].find((x) => x?.endsWith('@lid')) ?? null;

  if (
    !phoneCandidate &&
    lidCandidate &&
    sock?.signalRepository?.lidMapping?.getPNForLID
  ) {
    try {
      const resolvedPn =
        await sock.signalRepository.lidMapping.getPNForLID(lidCandidate);
      if (resolvedPn) phoneCandidate = jidNormalizedUser(resolvedPn);
    } catch {
      // ignore
    }
  }

  // Canonical identity: selalu prefer nomor HP kalau tersedia, apapun konteksnya
  const sender = phoneCandidate ?? lidCandidate;
  const senderLid = lidCandidate;
  const senderAlt = sender === phoneCandidate ? lidCandidate : null;

  const type = getContentType(raw.message);
  if (!type) return null;

  const inner = unwrapMessage(raw.message, type);
  const innerType = getContentType(inner) ?? type;
  const content = inner[innerType];
  const text = extractText(inner, innerType, content);
  const quoted = await extractQuoted(raw, content, jid, sock);
  const mentions = await resolveMentions(
    content?.contextInfo?.mentionedJid,
    sock
  );

  return {
    key: raw.key,
    jid,
    jidAlt,
    sender,
    senderAlt,
    senderLid,
    fromMe,
    isGroup,
    type: innerType,
    text,
    args: text ? text.trim().split(/\s+/).slice(1) : [],
    rawArgs: text ? text.trim().split(/\s+/).slice(1).join(' ') : '',
    quoted,
    mentions,
    isMedia: MEDIA_TYPES.has(innerType),
    message: raw.message,
    raw,
    pushName: raw.pushName ?? '',
    timestamp: Number(raw.messageTimestamp ?? 0) * 1000,
    isBot: sender.endsWith('@bot') || /bot/i.test(raw.pushName ?? ''),
  };
}

function unwrapMessage(message, type) {
  if (type === 'ephemeralMessage')
    return message.ephemeralMessage?.message ?? message;
  if (type === 'viewOnceMessage')
    return message.viewOnceMessage?.message ?? message;
  if (type === 'viewOnceMessageV2')
    return message.viewOnceMessageV2?.message ?? message;
  return message;
}

async function resolveMentions(jids, sock) {
  const out = [];
  for (const j of jids ?? []) {
    const norm = jidNormalizedUser(j);
    if (norm.endsWith('@s.whatsapp.net')) {
      out.push(norm);
      continue;
    }
    if (
      norm.endsWith('@lid') &&
      sock?.signalRepository?.lidMapping?.getPNForLID
    ) {
      try {
        const pn = await sock.signalRepository.lidMapping.getPNForLID(norm);
        if (pn) {
          out.push(jidNormalizedUser(pn));
          continue;
        }
      } catch {
        // ignore
      }
    }
    out.push(norm);
  }
  return out;
}

function extractText(message, type, content) {
  switch (type) {
    case 'conversation':
      return message.conversation ?? '';
    case 'extendedTextMessage':
      return content?.text ?? '';
    case 'imageMessage':
    case 'videoMessage':
    case 'documentMessage':
    case 'audioMessage':
      return content?.caption ?? '';
    case 'buttonsResponseMessage':
      return content?.selectedButtonId ?? '';
    case 'listResponseMessage':
      return content?.singleSelectReply?.selectedRowId ?? '';
    case 'templateButtonReplyMessage':
      return content?.selectedId ?? '';
    default:
      return '';
  }
}

async function extractQuoted(raw, content, jid, sock) {
  const ctx = content?.contextInfo;
  if (!ctx?.quotedMessage) return null;

  const qType = getContentType(ctx.quotedMessage);
  const qContent = ctx.quotedMessage[qType];

  const sender = await resolveQuotedSender(ctx, jid, sock);

  return {
    key: { remoteJid: jid, id: ctx.stanzaId, participant: ctx.participant },
    sender,
    type: qType,
    message: ctx.quotedMessage,
    text:
      qContent?.text ??
      qContent?.caption ??
      ctx.quotedMessage?.conversation ??
      '',
    isMedia: MEDIA_TYPES.has(qType),
    download: () =>
      downloadMediaMessage({
        key: { remoteJid: jid, id: ctx.stanzaId, participant: ctx.participant },
        message: ctx.quotedMessage,
      }),
  };
}

async function resolveQuotedSender(ctx, jid, sock) {
  const candidates = [ctx.sender, ctx.participant, ctx.participantAlt]
    .filter(Boolean)
    .map((x) => jidNormalizedUser(x));

  const phone = candidates.find((x) => x.endsWith('@s.whatsapp.net'));
  if (phone) return phone;

  const lid = candidates.find((x) => x.endsWith('@lid'));
  if (lid && sock?.signalRepository?.lidMapping?.getPNForLID) {
    try {
      const resolved = await sock.signalRepository.lidMapping.getPNForLID(lid);
      if (resolved) return jidNormalizedUser(resolved);
    } catch {
      // ignore
    }
  }

  return lid ?? jidNormalizedUser(ctx.sender ?? ctx.participant ?? jid);
}
