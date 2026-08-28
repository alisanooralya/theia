import { db } from '#storage/connection.js';
import { groupModel } from '#storage/models/index.js';
import { getHealth, MAX_HEALTH } from '#commands/modules/group/warn.js';
import { logger } from '#helpers/logger.js';

const TOXIC_DAMAGE = 10;

const TOXIC_WORDS = [
  'b4bi',
  'babi',
  'anjing',
  'k0ntl',
  'k0nt0l',
  'anying',
  'anjg',
  'ajg',
  'anj',
  'anjir',
  'anjay',
  'anjai',
  'asshole',
  'ewe',
  'bajingan',
  'babu',
  'bego',
  'bodoh',
  'bangsat',
  'brengsek',
  'bacot',
  'bitch',
  'bastard',
  'badjingan',
  'bjngn',
  'bdoh',
  'bdh',
  'bngst',
  'brngsk',
  'brngsek',
  'bct',
  'bcot',
  'bact',
  'bjir',
  'kampret',
  'kontol',
  'kimak',
  'kntl',
  'kontl',
  'kntol',
  'memek',
  'motherfucker',
  'nyet',
  'monyet',
  'mmk',
  'memk',
  'mmek',
  'titit',
  'tai',
  't4i',
  'taik',
  'tolol',
  'tlol',
  'tytyd',
  'ngentot',
  'ngentod',
  'ngntt',
  'ngntd',
  'ngentd',
  'ngentt',
  'ngntod',
  'ngntot',
  'nigga',
  'nigger',
  'nigg',
  'njir',
  'njai',
  'njay',
  'goblok',
  'goblog',
  'gblk',
  'gblg',
  'goblk',
  'goblg',
  'gblok',
  'gblog',
  'jembut',
  'jmbt',
  'mbut',
  'jing',
  'jink',
  'jir',
  'pepek',
  'puki',
  'pukimak',
  'pantek',
  'pantat',
  'ppk',
  'pepk',
  'ppek',
  'pntk',
  'idiot',
  'sinting',
  'sialan',
  'shit',
  'slut',
  'stupid',
  'setan',
  'stpd',
  'sht',
  'fuck',
  'fck',
  'dick',
  'pussy',
  'cunt',
  'whore',
  'retard',
  'wtf',
];

const TOXIC_RE = new RegExp(
  `\\b(?:${TOXIC_WORDS.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
  'i'
);

export default {
  name: 'anti-toxic',

  init() {
    logger.debug('[AntiToxic] Initialized');
  },

  async processMessage(s, sock) {
    if (!s.isGroup || s.fromMe) return true;
    if (!groupModel.hasAntitoxic(s.jid)) return true;

    const text = s.text.toLowerCase() ?? '';
    if (!TOXIC_RE.test(text)) return true;

    try {
      await sock.sendMessage(s.jid, { delete: s.key });

      db.prepare(
        `INSERT INTO warns (jid, group_jid, reason, damage) VALUES (?, ?, ?, ?)`
      ).run(s.sender, s.jid, 'Toxic', TOXIC_DAMAGE);

      const health = getHealth(s.sender, s.jid);

      if (health <= 0) {
        try {
          await sock.groupParticipantsUpdate(s.jid, [s.sender], 'remove');
        } catch {}
        db.prepare(`DELETE FROM warns WHERE jid = ? AND group_jid = ?`).run(
          s.sender,
          s.jid
        );
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
        { jid: s.jid, sender: s.sender },
        '[AntiToxic] Toxic message removed'
      );
    } catch (err) {
      logger.error({ err }, '[AntiToxic] Handler error');
    }

    return false;
  },
};
