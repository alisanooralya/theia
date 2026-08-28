import { db } from '#storage/connection.js';
import { groupModel } from '#storage/models/index.js';
import { getHealth, MAX_HEALTH } from '#commands/modules/group/warn.js';
import { logger } from '#helpers/logger.js';
import SETTINGS from '#environment/settings.js';
import axios from 'axios';

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

const TOXIC_THRESHOLD = 0.7;

const PERSPECTIVE_API_URL = 'https://commentanalyzer.googleapis.com/v1alpha1/comments:analyze';

async function detectToxicWithAI(text) {
  if (!SETTINGS.geminiKey) return { is_toxic: false, reason: '' };
  try {
    const request = {
      comment: { text: text.slice(0, 500) },
      languages: ['id', 'en'],
      requestedAttributes: {
        TOXICITY: {},
        SEVERE_TOXICITY: {},
        IDENTITY_ATTACK: {},
        INSULT: {},
        PROFANITY: {},
        THREAT: {},
      },
    };

    const { data } = await axios.post(
      `${PERSPECTIVE_API_URL}?key=${SETTINGS.geminiKey}`,
      request,
      { timeout: 10_000 }
    );

    const scores = data?.attributeScores || {};

    const toxicity = scores.TOXICITY?.summaryScore?.value || 0;
    const severeToxicity = scores.SEVERE_TOXICITY?.summaryScore?.value || 0;
    const identityAttack = scores.IDENTITY_ATTACK?.summaryScore?.value || 0;
    const insult = scores.INSULT?.summaryScore?.value || 0;
    const profanity = scores.PROFANITY?.summaryScore?.value || 0;
    const threat = scores.THREAT?.summaryScore?.value || 0;

    const maxScore = Math.max(toxicity, severeToxicity, identityAttack, insult, profanity, threat);

    if (maxScore < TOXIC_THRESHOLD) {
      return { is_toxic: false, reason: '' };
    }

    const reasons = [];
    if (toxicity >= TOXIC_THRESHOLD) reasons.push('toxic');
    if (severeToxicity >= TOXIC_THRESHOLD) reasons.push('severe toxic');
    if (identityAttack >= TOXIC_THRESHOLD) reasons.push('identity attack');
    if (insult >= TOXIC_THRESHOLD) reasons.push('insult');
    if (profanity >= TOXIC_THRESHOLD) reasons.push('profanity');
    if (threat >= TOXIC_THRESHOLD) reasons.push('threat');

    return {
      is_toxic: true,
      reason: reasons.join(', ') || 'toxic content',
      score: maxScore,
    };
  } catch (err) {
    logger.error({ err }, '[AntiToxic] Perspective API error');
    return { is_toxic: false, reason: '' };
  }
}

export default {
  name: 'anti-toxic',

  init() {
    logger.debug('[AntiToxic] Initialized');
  },

  async processMessage(s, sock) {
    if (!s.isGroup || s.fromMe) return true;
    if (!groupModel.hasAntitoxic(s.jid)) return true;

    const text = s.text.toLowerCase() ?? '';

    // Layer 1: Regex check
    const isToxicByRegex = TOXIC_RE.test(text);

    // Layer 2: AI check (only if regex doesn't detect)
    let isToxicByAI = false;
    let aiReason = '';
    let aiScore = 0;
    if (!isToxicByRegex) {
      const aiResult = await detectToxicWithAI(text);
      isToxicByAI = aiResult.is_toxic;
      aiReason = aiResult.reason;
      aiScore = aiResult.score || 0;
    }

    if (!isToxicByRegex && !isToxicByAI) return true;

    try {
      await sock.sendMessage(s.jid, { delete: s.key });

      const reason = isToxicByRegex
        ? 'Toxic (regex)'
        : `Toxic (${aiReason}): ${aiScore.toFixed(2)}`;

      db.prepare(
        `INSERT INTO warns (jid, group_jid, reason, damage) VALUES (?, ?, ?, ?)`
      ).run(s.sender, s.jid, reason, TOXIC_DAMAGE);

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
        { jid: s.jid, sender: s.sender, method: isToxicByRegex ? 'regex' : 'ai' },
        '[AntiToxic] Toxic message removed'
      );
    } catch (err) {
      logger.error({ err }, '[AntiToxic] Handler error');
    }

    return false;
  },
};
