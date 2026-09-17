import { sql } from '#storage/connection.js';
import { groupModel } from '#storage/models/index.js';
import { getHealth, MAX_HEALTH } from '#commands/modules/group/warn.js';
import { logger } from '#helpers/logger.js';
import { LOW_RE, shouldReview } from './content-safety-config.js';

const LOW_TOXIC_DAMAGE = 5;
const HIGH_TOXIC_DAMAGE = 10;

const deps = {
  sql,
  groupModel,
  getHealth,
};

export function __setAntiToxicDeps(overrides = {}) {
  Object.assign(deps, overrides);
}

export function __resetAntiToxicDeps() {
  deps.sql = sql;
  deps.groupModel = groupModel;
  deps.getHealth = getHealth;
}

export default {
  name: 'anti-toxic',

  init() {},

  async processMessage(s, sock) {
    if (!s.isGroup || s.fromMe) return true;
    if (!(await deps.groupModel.hasAntitoxic(s.jid))) return true;

    const text = String(s.text ?? '');
    if (!text.trim()) return true;
    const lower = text.toLowerCase();

    if (LOW_RE.test(lower)) {
      return this.handleViolation({
        severity: 'low',
        category: 'toxic',
        s,
        sock,
      });
    }

    if (!shouldReview(lower)) return true;

    return this.handleViolation({
      severity: 'high',
      category: 'toxic',
      s,
      sock,
    });
  },

  async handleViolation({ severity, category, s, sock }) {
    if (severity === 'none') return true;

    try {
      let deleted = false;
      try {
        await sock.sendMessage(s.jid, { delete: s.key });
        deleted = true;
      } catch (err) {
        logger.warn({ err, jid: s.jid }, '[AntiToxic] Delete failed');
      }

      if (!deleted) {
        logger.info(
          { jid: s.jid, sender: s.sender, category, severity },
          '[AntiToxic] Delete failed, skipping penalty'
        );
        return false;
      }

      const damage = severity === 'low' ? LOW_TOXIC_DAMAGE : HIGH_TOXIC_DAMAGE;

      await deps.sql`
        INSERT INTO warns (jid, group_jid, reason, damage) VALUES (${s.sender}, ${s.jid}, 'Toxic', ${damage})
      `;

      const health = await deps.getHealth(s.sender, s.jid);

      if (health <= 0) {
        try {
          await sock.groupParticipantsUpdate(s.jid, [s.sender], 'remove');
        } catch (err) {
          logger.warn({ err, jid: s.jid }, '[AntiToxic] Kick failed');
        }
        await deps.sql`DELETE FROM warns WHERE jid = ${s.sender} AND group_jid = ${s.jid}`;
        await sock.sendMessage(s.jid, {
          text: `🚫 @${s.sender.split('@')[0]} terdeteksi toxic, health 0 dan di-kick!`,
          mentions: [s.sender],
        });
      } else {
        await sock.sendMessage(s.jid, {
          text: `🚫 @${s.sender.split('@')[0]} kata toxic tidak diizinkan! (-${damage})\n❤️ Health: ${health}/${MAX_HEALTH}`,
          mentions: [s.sender],
        });
      }

      logger.info(
        { jid: s.jid, sender: s.sender, category, severity, damage },
        '[AntiToxic] Toxic message removed'
      );
    } catch (err) {
      logger.error({ err }, '[AntiToxic] Handler error');
    }

    return false;
  },
};
