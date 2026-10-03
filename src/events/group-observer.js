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

const WELCOME_IMAGE = './temp/welcome.jpg';
const WELCOME_TEKS = `╭───────── ୨୧ ─────────╮
𝑮𝑬𝑵𝑺𝑯𝑰𝑵
𝑻𝑬𝑨 𝑷𝑨𝑹𝑻𝒀
𝑴𝑬𝑴𝑩𝑬𝑹 𝑪𝑨𝑹𝑫
╰───────── ୨୧ ─────────╯

         𝜗𝜚 %name 𝜗𝜚

𝑵𝒂𝒎𝒆  ┊
𝑹𝒐𝒍𝒆  ┊
𝑴𝒂𝒊𝒏  ┊
𝑨𝑹 / 𝑾𝑳  ┊
𝑺𝒆𝒓𝒗𝒆𝒓  ┊

    ───── ୨୧ ─────

❝ 𝑾𝒆𝒍𝒄𝒐𝒎𝒆 𝒕𝒐 𝒕𝒉𝒆
𝑮𝒆𝒏𝒔𝒉𝒊𝒏 𝑻𝒆𝒂 𝑷𝒂𝒓𝒕𝒚. ❞

𝑴𝒂𝒚 𝒚𝒐𝒖 𝒇𝒊𝒏𝒅
𝒇𝒓𝒊𝒆𝒏𝒅𝒔, 𝒇𝒖𝒏,
𝒂𝒏𝒅 𝒎𝒂𝒏𝒚 𝒘𝒂𝒓𝒎 𝒄𝒖𝒑𝒔 𝒐𝒇 𝒕𝒆𝒂. ☕

    ───── ୨୧ ─────

      𝑮𝑻𝑷 𝑴𝒂𝒓𝒈𝒂
          𝜗𝜚`;

export async function onGroupParticipantsUpdate(
  { id, participants, action },
  sock
) {
  if (!id || !participants?.length) return;

  try {
    const meta = await sock.groupMetadata(id).catch(() => null);
    await groupModel.ensure(id, meta?.subject || '');

    const group = await groupModel.find(id);

    if (action === 'add') {
      if (!group?.welcome) return;
      const groupName = meta?.subject ?? 'this grup';

      for (const participant of participants) {
        const jid = participant.phoneNumber || participant.id;
        await userModel.ensure(jid);

        const caption = WELCOME_TEKS.replace(/%name/, `@${jid.split('@')[0]}`);
        const image = await readFile(WELCOME_IMAGE);

        const inviteUrl = 'https://hoyolab.com';
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
        await sock.sendMessage(id, {
          text: `🌌 Traveler @${jid.split('@')[0]} telah melanjutkan perjalanannya.\nSetiap persinggahan memiliki akhirnya.\nTerima kasih telah singgah. Lanjutkan perjalananmu, dan kembalilah dengan kisahmu.`,
          mentions: [jid],
        });
      }
    }
  } catch (err) {
    logger.error({ err, id, action }, 'Group participant update error');
  }
}
