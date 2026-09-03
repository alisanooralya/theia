import { groupActivityModel } from '#storage/models/index.js';
import { groupModel } from '#storage/models/index.js';
import { userModel } from '#storage/models/index.js';
import { logger } from '#helpers/logger.js';

const XP_MIN = 15;
const XP_MAX = 25;
const COOLDOWN_MS = 120_000;
const cooldown = new Map();

export default {
  name: 'group-leveling',

  async processMessage(parsed, sock) {
    if (!parsed.isGroup) return true;
    if (!parsed.sender) return true;
    try {
      let groupName = '';
      try {
        const existing = await groupModel.find(parsed.jid);
        if (existing?.name) {
          groupName = existing.name;
        } else {
          const meta = await sock.groupMetadata(parsed.jid);
          groupName = meta.subject || '';
        }
      } catch {}
      await Promise.all([
        groupModel.ensure(parsed.jid, groupName),
        userModel.ensure(parsed.sender, { pushName: parsed.pushName || '' }),
      ]);
    } catch {}
    const key = `${parsed.jid}:${parsed.sender}`;
    const now = Date.now();
    if (cooldown.has(key) && now - cooldown.get(key) < COOLDOWN_MS) return true;
    cooldown.set(key, now);
    if (cooldown.size > 5000) {
      for (const [k, v] of cooldown)
        if (now - v > COOLDOWN_MS) cooldown.delete(k);
    }
    try {
      const xp = Math.floor(Math.random() * (XP_MAX - XP_MIN + 1)) + XP_MIN;
      const [, result] = await Promise.all([
        groupActivityModel.addXp(parsed.jid, parsed.sender, xp),
        userModel.addExp(parsed.sender, xp),
      ]);
      if (result.leveledUp) {
        await sock
          .sendMessage(parsed.jid, {
            text: `🎉 Selamat @${parsed.sender.split('@')[0]} naik ke *Level ${result.newLevel}* ! (${xp} XP)`,
            mentions: [parsed.sender],
          })
          .catch(() => {});
      }
    } catch (err) {
      logger.warn({ err: err.message }, '[GroupLeveling] XP failed');
    }
    return true;
  },
};
