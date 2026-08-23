/**
 * Builds the authenticated agent context from a parsed WhatsApp message.
 *
 * SECURITY: `userId` always comes from the authenticated message sender — tools
 * must use `ctx.userId` and never accept a user-supplied ID from the model.
 * No DB files, env vars, or credentials are exposed to the model.
 */
import { isOwnerJid } from '#helpers/owner.js'
import { userModel } from '#storage/models/index.js'
import { resolveLevel } from './permissions.js'

export function buildAgentContext(parsed, sock) {
  const userId = parsed.sender // authenticated, from the message itself
  const isOwner = isOwnerJid(userId) || (parsed.senderAlt && isOwnerJid(parsed.senderAlt))

  userModel.checkPremiumExpiry(userId)
  const user = userModel.findById(userId) ?? null
  const isPremium = user?.premium === 1

  return {
    // identity (authenticated only)
    userId,
    sender: userId,
    jid: parsed.jid,
    isGroup: parsed.isGroup,
    isOwner,
    isPremium,
    level: resolveLevel({ isOwner, isPremium }),

    // minimal context for the model (safe subset only)
    quoted: parsed.quoted ? { text: parsed.quoted.text || null, isMedia: parsed.quoted.isMedia } : null,

    // internals for tools that send media / reply (never serialized to the model)
    parsed,
    sock,
    reply: (text) => sock.sendMessage(parsed.jid, { text }, { quoted: parsed.raw }),
    sendMedia: (type, data, caption = '', options = {}) =>
      sock.sendMessage(
        parsed.jid,
        { [type]: Buffer.isBuffer(data) ? data : { url: data }, caption, ...options },
        { quoted: parsed.raw }
      ),
    typing: () => sock.sendPresenceUpdate('composing', parsed.jid),
    stopTyping: () => sock.sendPresenceUpdate('paused', parsed.jid),
  }
}