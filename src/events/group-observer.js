import { readFile } from 'fs/promises';
import { groupModel, userModel } from '#storage/models/index.js';
import { logger } from '#helpers/logger.js';

async function sendLinkPreview(
  sock,
  jid,
  text,
  thumbBuffer,
  url,
  title,
  desc,
  mentions = []
) {
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
      contextInfo: { mentionedJid: mentions },
    },
  };
  const result = await generateWAMessageFromContent(jid, msg, {
    userJid: sock.user?.jid ?? sock.user?.id,
    upload: sock.waUploadToServer,
  });
  return sock.relayMessage(jid, result.message, { messageId: result.key.id });
}

const WELCOME_IMAGE = './welcome.jpg';
const WELCOME_TEKS = `✦ ─── 𓂃 ࣪˖ ִֶָ☾ ─── ✦

   THE GENSHIN TEA PARTY
        INTRODUCTION

✦ ─── 𓂃 ࣪˖ ִֶָ☾ ─── ✦

%name 🫶

✦ Nama :
✦ UID :
✦ Server :
✦ AR / WL : (Jangan boong ya.)
✦ Main Karakter :

─── 𓂃 ࣪˖ ִֶָ☾ 𓂃 ࣪˖ ִֶָ ───

✦ Aktivitas Favorit :

☐ Co-op              ☐ Explore
☐ Build Character ☐ Spiral Abyss
☐ Lore               ☐ Serenitea Pot
☐ Foto

↳ Tandai dengan (✅)

✦ Pesan / Salam Kenal :
❝ ...❞

─── 𓂃 ࣪˖ ִֶָ☾ 𓂃 ࣪˖ ִֶָ ───

✦ Jangan lupa join MARGA yaa! 
𝄞𝐆𝐓𝐏 ✧

✦ ─── 𓂃 ࣪˖ ִֶָ☾ ─── ✦`;

export async function onGroupParticipantsUpdate(
  { id, participants, action },
  sock
) {
  if (!id || !participants?.length) return;

  try {
    const group = await groupModel.find(id);

    if (action === 'add') {
      if (!group?.welcome) return;
      const meta = await sock.groupMetadata(id).catch(() => null);

      for (const participant of participants) {
        const jid = participant.phoneNumber || participant.id;
        await userModel.ensure(jid);

        const caption = WELCOME_TEKS.replace(/%name/, `@${jid.split('@')[0]}`);
        const image = await readFile(WELCOME_IMAGE);
        const groupName = meta?.subject ?? 'this grup';

        let inviteUrl = 'https://hoyolab.com';
        await sendLinkPreview(
          sock,
          id,
          caption,
          image,
          inviteUrl,
          groupName,
          'Selamat datang di grup!',
          [jid]
        );
      }
    }

    if (action === 'remove') {
      if (!group?.welcome) return;
      for (const participant of participants) {
        const jid = participant.phoneNumber || participant.id;
        const meta = await sock.groupMetadata(id).catch(() => null);
        const groupName = meta?.subject ?? 'this group';
        await sock.sendMessage(id, {
          text: `@${jid.split('@')[0]} has left ${groupName}. Goodbye!`,
          mentions: [jid],
        });
      }
    }
  } catch (err) {
    logger.error({ err, id, action }, 'Group participant update error');
  }
}
