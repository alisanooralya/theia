import { sql } from '#storage/connection.js';
import { groupModel } from '#storage/models/index.js';
import { getHealth, MAX_HEALTH } from '#commands/modules/group/warn.js';
import { logger } from '#helpers/logger.js';
import { LOW_RE, shouldReviewWithAI } from './content-safety-config.js';
import { classifyContent } from './content-safety-service.js';

const TOXIC_DAMAGE = 5;

// Dependensi modul dibungkus agar bisa di-mock pada test tanpa DB/API.
// Production selalu memakai nilai default (sistem warns/health existing).
const deps = {
  sql,
  groupModel,
  getHealth,
  classify: classifyContent,
};

export function __setAntiToxicDeps(overrides = {}) {
  Object.assign(deps, overrides);
}

export function __resetAntiToxicDeps() {
  deps.sql = sql;
  deps.groupModel = groupModel;
  deps.getHealth = getHealth;
  deps.classify = classifyContent;
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

    // LOW unambiguous: delete only, tanpa request AI.
    if (LOW_RE.test(lower)) {
      return this.handleViolation({
        severity: 'low',
        category: 'toxic',
        s,
        sock,
      });
    }

    // Kandidat lokal menentukan apakah pesan layak direview AI.
    // Tanpa kandidat → allow tanpa API request.
    if (!shouldReviewWithAI(lower)) return true;

    const quotedText = typeof s.quoted?.text === 'string' ? s.quoted.text : '';
    const result = await deps.classify(text, { quotedText });

    // Fail-safe: AI unavailable / response invalid → allow.
    if (!result || result.severity === 'none') return true;

    return this.handleViolation({
      severity: result.severity,
      category: result.category,
      s,
      sock,
    });
  },

  /**
   * Satu-satunya punishment pipeline. Semua violation (keyword LOW maupun
   * hasil AI) masuk ke sini agar tidak ada double delete/warn/kick.
   * - none → allow
   * - low → delete message saja
   * - high → delete + warns existing + health/kick flow existing
   */
  async handleViolation({ severity, category, s, sock }) {
    if (severity === 'none') return true;

    try {
      // Satu kali delete untuk semua severity.
      try {
        await sock.sendMessage(s.jid, { delete: s.key });
      } catch (err) {
        logger.warn({ err, jid: s.jid }, '[AntiToxic] Delete failed');
      }

      // LOW: delete only — tanpa warn, tanpa pengurangan health.
      if (severity === 'low') {
        logger.info(
          { jid: s.jid, sender: s.sender, category },
          '[AntiToxic] Low severity message removed'
        );
        return false;
      }

      // HIGH: punishment penuh memakai sistem warns/health existing.
      await deps.sql`
        INSERT INTO warns (jid, group_jid, reason, damage) VALUES (${s.sender}, ${s.jid}, 'Toxic', ${TOXIC_DAMAGE})
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
          text: `🚫 @${s.sender.split('@')[0]} kata toxic tidak diizinkan! (-${TOXIC_DAMAGE})\n❤️ Health: ${health}/${MAX_HEALTH}`,
          mentions: [s.sender],
        });
      }

      logger.info(
        { jid: s.jid, sender: s.sender, category },
        '[AntiToxic] Toxic message removed'
      );
    } catch (err) {
      logger.error({ err }, '[AntiToxic] Handler error');
    }

    return false;
  },
};
