import { isOwnerJid } from '#helpers/owner.js';
import { CommandError } from '#helpers/command-error.js';

export function buildContext(s, sock) {
  return {
    sock,
    msg: s,
    raw: s.raw,
    jid: s.jid,
    sender: s.sender,
    senderAlt: s.senderAlt,
    fromMe: s.fromMe,
    isGroup: s.isGroup,
    isPrivate: !s.isGroup,
    text: s.text,
    args: s.args,
    rawArgs: s.rawArgs,
    quoted: s.quoted,
    mentions: s.mentions,
    pushName: s.pushName,
    timestamp: s.timestamp,

    isOwner: () => {
      if (isOwnerJid(s.sender)) return true;
      if (s.senderAlt && isOwnerJid(s.senderAlt)) return true;
      if (s.jidAlt && isOwnerJid(s.jidAlt)) return true;
      return false;
    },

    fail: (message) => {
      throw new CommandError(message);
    },

    reply: (content, options = {}, meta = {}) => {
      const body = typeof content === 'string' ? { text: content } : content;
      return sock.enqueueSend(
        s.jid,
        { ...body, ...options },
        { quoted: s.raw },
        meta
      );
    },

    send: (content, options = {}, meta = {}) => {
      const body = typeof content === 'string' ? { text: content } : content;
      return sock.enqueueSend(s.jid, { ...body, ...options }, {}, meta);
    },

    sendTo: (targetJid, content, options = {}, meta = {}) => {
      const body = typeof content === 'string' ? { text: content } : content;
      return sock.enqueueSend(targetJid, { ...body, ...options }, {}, meta);
    },

    react: (emoji, meta = {}) =>
      sock.enqueueSend(
        s.jid,
        { react: { text: emoji, key: s.key } },
        {},
        meta
      ),

    sendMedia: (type, data, caption = '', options = {}, meta = {}) =>
      sock.enqueueSend(
        s.jid,
        {
          [type]: typeof data === 'string' ? { url: data } : data,
          caption,
          ...options,
        },
        { quoted: s.raw },
        meta
      ),

    sendLinkPreview: async (
      text,
      url,
      title,
      desc,
      thumbBuffer,
      quoted = null
    ) => {
      const { prepareWAMessageMedia, generateWAMessageFromContent } =
        await import('baileys');
      const { imageMessage } = await prepareWAMessageMedia(
        { image: thumbBuffer },
        { upload: sock.waUploadToServer, mediaTypeOverride: 'thumbnail-link' }
      );

      const msg = {
        extendedTextMessage: {
          text: `${url}\n${text}`,
          matchedText: url,
          title,
          description: desc,
          previewType: 0,
          jpegThumbnail: imageMessage.jpegThumbnail || thumbBuffer,
          thumbnailDirectPath: imageMessage.directPath,
          thumbnailSha256: imageMessage.fileSha256,
          thumbnailEncSha256: imageMessage.fileEncSha256,
          mediaKey: imageMessage.mediaKey,
          mediaKeyTimestamp: imageMessage.mediaKeyTimestamp,
          thumbnailHeight: 523,
          thumbnailWidth: 1024,
        },
      };

      const result = await generateWAMessageFromContent(s.jid, msg, {
        quoted: quoted ?? s.raw,
        userJid: sock.user?.jid ?? sock.user?.id,
        upload: sock.waUploadToServer,
      });
      return sock.relayMessage(s.jid, result.message, {
        messageId: result.key.id,
      });
    },

    deleteMessage: (msgKey = s.key, meta = {}) =>
      sock.enqueueSend(s.jid, { delete: msgKey }, {}, meta),
    downloadMedia: () =>
      s.isMedia ? sock.downloadMediaMessage(s.raw) : Promise.resolve(null),
    typing: () => sock.sendPresenceUpdate('composing', s.jid),
    stopTyping: () => sock.sendPresenceUpdate('paused', s.jid),
    markRead: () => sock.readMessages([s.key]),
  };
}
