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

const AI_SYSTEM_PROMPT = `Anda adalah filter moderasi pesan WhatsApp. Analisis teks berikut, apakah mengandung kata kasar, plesetan kata kotor, ujaran kebencian, atau insult dalam bahasa Indonesia/bahasa daerah/slang gaul. Jawab HANYA dengan JSON format: {"is_toxic": true/false, "reason": "alasan singkat"}`;

async function detectToxicWithAI(text) {
  if (!SETTINGS.openaiKey) return { is_toxic: false, reason: '' };
  try {
    const { data } = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: AI_SYSTEM_PROMPT },
          { role: 'user', content: text.slice(0, 500) },
        ],
        max_tokens: 100,
        temperature: 0.3,
      },
      {
        headers: {
          Authorization: `Bearer ${SETTINGS.openaiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 10_000,
      }
    );

    const content = data?.choices?.[0]?.message?.content?.trim();
    if (!content) return { is_toxic: false, reason: '' };

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { is_toxic: false, reason: '' };

    const result = JSON.parse(jsonMatch[0]);
    return {
      is_toxic: Boolean(result.is_toxic),
      reason: result.reason || '',
    };
  } catch (err) {
    logger.error({ err }, '[AntiToxic] AI detection error');
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
    if (!isToxicByRegex) {
      const aiResult = await detectToxicWithAI(text);
      isToxicByAI = aiResult.is_toxic;
      aiReason = aiResult.reason;
    }

    if (!isToxicByRegex && !isToxicByAI) return true;

    try {
      await sock.sendMessage(s.jid, { delete: s.key });

      const reason = isToxicByRegex
        ? 'Toxic (regex)'
        : `Toxic (AI): ${aiReason}`;

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
