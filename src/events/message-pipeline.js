import { parseMessage } from '#messages/parser.js';
import { dispatch } from '#messages/dispatcher.js';
import { logger } from '#helpers/logger.js';
import { isStatus, getBotJids } from '#helpers/identifier.js';
import { isOwnerJid } from '#helpers/owner.js';
import { orchestrator } from '#extensions/lifecycle/orchestrator.js';
import { agentService } from '#agent/index.js';
import { userModel, groupModel } from '#storage/models/index.js';
import SETTINGS from '#environment/settings.js';

async function isSenderBanned(parsed) {
  const isOwner =
    isOwnerJid(parsed.sender) ||
    (parsed.senderAlt && isOwnerJid(parsed.senderAlt)) ||
    (parsed.jidAlt && isOwnerJid(parsed.jidAlt));
  if (isOwner) return false;
  return userModel.isBanned(parsed.sender);
}

async function isChatMuted(parsed) {
  if (!parsed.isGroup) return false;
  const group = await groupModel.find(parsed.jid);
  return Boolean(group?.mute);
}

export async function onMessagesUpsert({ messages, type }, sock) {
  if (type !== 'notify') return;

  for (const msg of messages) {
    try {
      if (!msg.message) continue;
      if (isStatus(msg.key?.remoteJid)) continue;

      const parsed = await parseMessage(msg, sock);
      if (!parsed) continue;
      if (parsed.fromMe && !SETTINGS.respondToSelf) continue;

      if (SETTINGS.autoread) {
        await sock.readMessages([msg.key]).catch(() => {});
      }

      const proceed = await orchestrator.runProcessors(parsed, sock);
      if (!proceed) continue;

      const botJids = getBotJids(sock);
      const isMentioned = parsed.mentions?.some((jid) => botJids.includes(jid));
      const isRepliedToBot =
        !!parsed.quoted?.sender && botJids.includes(parsed.quoted.sender);
      const isTriggered = isMentioned || isRepliedToBot;
      const isCommand = parsed.text?.startsWith(SETTINGS.prefix) ?? false;

      const hasMediaTrigger = parsed.isMedia || parsed.quoted?.isMedia;
      if (
        agentService.isEnabled() &&
        (parsed.text || hasMediaTrigger) &&
        !isCommand &&
        (parsed.isGroup ? isTriggered : true)
      ) {
        if (await isSenderBanned(parsed)) continue;
        if (await isChatMuted(parsed)) continue;
        await agentService.handleMessage(parsed, msg, sock);
        continue;
      }

      // Legacy mention response — only when the agent is disabled.
      if (isMentioned && parsed.text && !isCommand) {
        if (await isSenderBanned(parsed)) continue;
        if (await isChatMuted(parsed)) continue;
        await sock.sendMessage(
          parsed.jid,
          {
            text: `Halo! Ketik ${SETTINGS.prefix}help untuk lihat command.`,
          },
          { quoted: msg }
        );
        continue;
      }

      await dispatch(parsed, sock);
    } catch (err) {
      logger.error({ err, msgId: msg.key?.id }, 'Message handler error');
    }
  }
}
