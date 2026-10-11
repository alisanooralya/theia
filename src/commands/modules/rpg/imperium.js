import { F } from '#helpers/index.js';
import { Button } from '#messages/builder.js';
import SETTINGS from '#environment/settings.js';
import { imperiumService } from '#features/rpg/services/imperium-service.js';
import {
  IMPERIUM_CHAMBER_COUNT,
  IMPERIUM_DIFF_LIST,
  IMPERIUM_OPTION_KEYS,
} from '#features/rpg/config/imperium-config.js';

const PREFIX = SETTINGS.prefix;

function diffLine(entry) {
  const flag = entry.unlocked ? (entry.isCleared ? '✅' : '🔓') : '🔒';
  const lines = [
    `${flag} ${entry.emoji} *Diff ${entry.diff} — ${entry.name}*`,
    `   ${entry.description}`,
    `   Boss: ${entry.boss} (HP ${F.formatNumber(entry.bossHp)})`,
    '',
  ];
  if (entry.blockedBy?.length) {
    lines.push(
      `   _Butuh clear Diff ${entry.blockedBy.join(', ')} minggu ini._`
    );
  }
  if (entry.isCleared) {
    lines.push('   _Sudah clear minggu ini — replay tidak memberi reward._');
  }
  return lines.join('\n');
}

export function formatImperiumStatus(status) {
  const lines = [
    ...(!status.levelOk
      ? [
          `⚠️ Butuh RPG Level ${status.minLevel}. Kamu Level ${status.level}.`,
          '',
        ]
      : []),
    '*Weekly Featured Card*',
    `🃏 *${status.weeklyCardName}* (${status.weeklyCardId ?? '-'})`,
    `_${status.weeklyTheme.tagline}_`,
    '',
    `Gimmick boss: ${status.weeklyTheme.bossGimmick.label}`,
    `Minggu ke-${status.weekIndex} • progres direset tiap minggu.`,
    '',
    '*Difficulty*',
  ];
  for (const entry of status.difficulties) {
    lines.push(diffLine(entry));
  }
  return lines.join('\n');
}

function answerCommand(runId, key) {
  return `${PREFIX}imperium answer ${runId} ${key}`;
}

function questionBlock(question, chamber, chamberCount) {
  return [
    `*Chamber ${chamber} / ${chamberCount}*`,
    '',
    `💬 ${question.lore}`,
    '',
    question.prompt,
    '',
    ...question.options.map((o) => `${o.key}. ${o.text}`),
  ];
}

export function formatQuestion(runId, question, diff) {
  return [
    `*IMPERIUM — DIFF ${diff}*`,
    '',
    ...questionBlock(question, question.chamber, IMPERIUM_CHAMBER_COUNT),
    '',
    '_Pilih A, B, atau C._',
  ].join('\n');
}

export function formatConsequence(consequence) {
  const mark = consequence.isCorrect
    ? '✨'
    : consequence.outcome === 'critical'
      ? '☠️'
      : '⚠️';
  const effects = consequence.effects
    .map((e) => `${e.kind === 'blessing' ? '+' : '-'} ${e.label}`)
    .join(', ');
  return `${mark} *${consequence.label}* (${consequence.key})\n   ${effects}`;
}

export function formatChamberResult(result) {
  const lines = [
    formatConsequence(result.consequence),
    '',
    `Blessing: ${result.consequences.blessings.join(', ') || '-'}`,
    `Curse: ${result.consequences.curses.join(', ') || '-'}`,
  ];

  if (result.question) {
    lines.push(
      '',
      ...questionBlock(result.question, result.chamber, result.chamberCount),
      '',
      '_Pilih A, B, atau C._'
    );
  } else {
    lines.push('', `*Chamber ${result.chamber} / ${result.chamberCount}*`);
  }

  return lines.join('\n');
}

export function formatBattleResult(result) {
  const lines = [
    '*CHAMBER 3 — BOSS BATTLE*',
    '',
    `👹 *${result.bossName}*`,
    `❤️ Boss HP: ${F.formatNumber(Math.max(0, result.enemyHp))} / ${F.formatNumber(result.enemyMaxHp)}`,
    `❤️ HP kamu: ${F.formatNumber(result.startHp)} → ${F.formatNumber(Math.max(0, result.playerHp))}`,
    `⚔️ ${result.rounds} round`,
    '',
    `_Blessing: ${result.summary.blessings.join(', ') || '-'}_`,
    `_Curse: ${result.summary.curses.join(', ') || '-'}_`,
  ];

  if (result.status === 'WIN') {
    lines.push('', '🏆 *IMPERIUM CLEAR!*');
    if (result.replay) {
      lines.push(
        '',
        '_Diff ini sudah kamu klaim minggu ini. Replay tidak menambah reward._'
      );
      return lines.join('\n');
    }
    lines.push(
      '',
      '*Reward*',
      `• EXP +${F.formatNumber(result.rewards.exp)}`,
      `• Coin +${F.formatNumber(result.rewards.coin)}`,
      `• Cerelia ×${result.rewards.cerelia}`
    );
    if (result.leveledUp) lines.push('', '⭐ *Level Up!*');
    return lines.join('\n');
  }

  lines.push(
    '',
    result.status === 'LOSE' ? '💀 *IMPERIUM FAILED*' : '🤝 *IMPERIUM DRAW*',
    '',
    'Run berakhir. Tidak ada reward.',
    `Coba lagi dengan \`${PREFIX}imperium <diff>\` — Chamber 1 dan 2 diundi ulang.`
  );
  return lines.join('\n');
}

async function sendQuestion(ctx, run) {
  const text = formatQuestion(run.runId, run.question, run.diff);
  try {
    const builder = new Button(ctx.sock)
      .setTitle('*LABYRINTH IMPERIUM*')
      .setSubtitle(`Diff ${run.diff} — Chamber ${run.question.chamber}/3`)
      .setBody(text)
      .setFooter('Tap satu jawaban untuk melanjutkan Labyrinth')
      .addSelection('Pilih jawaban');

    builder.makeSection('Jawaban');
    for (const o of run.question.options) {
      builder.makeRow(
        '',
        `${o.key}. ${o.text}`,
        '',
        answerCommand(run.runId, o.key)
      );
    }

    return await builder.send(ctx.jid);
  } catch {
    return ctx.reply(text);
  }
}

async function sendChamberResult(ctx, result) {
  const text = formatChamberResult(result);
  if (!result.question) return ctx.reply(text);

  try {
    const builder = new Button(ctx.sock)
      .setTitle('*LABYRINTH IMPERIUM*')
      .setSubtitle(`Chamber ${result.chamber}/${result.chamberCount}`)
      .setBody(text)
      .setFooter('Tap jawaban untuk Chamber berikutnya')
      .addSelection('Pilih jawaban');

    builder.makeSection('Jawaban');
    for (const o of result.question.options) {
      builder.makeRow(
        '',
        `${o.key}. ${o.text}`,
        '',
        answerCommand(result.runId, o.key)
      );
    }

    return await builder.send(ctx.jid);
  } catch {
    return ctx.reply(text);
  }
}

async function sendStatus(ctx, status) {
  const text = formatImperiumStatus(status);
  const open = status.difficulties.filter((d) => d.unlocked);
  if (!open.length) return ctx.reply(text);

  try {
    const builder = new Button(ctx.sock)
      .setTitle('*LABYRINTH IMPERIUM*')
      .setSubtitle(`Weekly Card: ${status.weeklyCardName}`)
      .setBody(text)
      .setFooter('Tap difficulty untuk mulai run')
      .addSelection('Pilih Difficulty');

    builder.makeSection('Difficulty terbuka');
    for (const d of open) {
      builder.makeRow(
        d.isCleared ? '✅ clear' : '',
        `${d.emoji} Diff ${d.diff} — ${d.name}`,
        `Boss ${d.boss} • HP ${F.formatNumber(d.bossHp)}`,
        `${PREFIX}imperium ${d.diff}`
      );
    }

    return await builder.send(ctx.jid);
  } catch {
    return ctx.reply(text);
  }
}

function parseDifficulty(raw) {
  if (raw === undefined || raw === null) return null;
  const value = String(raw).trim().toLowerCase();
  if (!value) return null;
  if (value === 'd' || value === 'diff') return null;
  const diff = Number(value.replace(/^d/, ''));
  if (!Number.isInteger(diff) || !IMPERIUM_DIFF_LIST.includes(diff)) {
    const err = new RangeError(
      `Difficulty tidak valid. Pilih: ${IMPERIUM_DIFF_LIST.join(', ')}.`
    );
    err.code = 'BAD_DIFF';
    throw err;
  }
  return diff;
}

export async function executeImperium(ctx, { service = imperiumService } = {}) {
  const sub = (ctx.args?.[0] ?? '').toLowerCase();

  if (sub === 'answer') {
    const runId = ctx.args?.[1];
    const key = ctx.args?.[2];
    if (!runId || !key) {
      return ctx.fail(`Usage: \`${PREFIX}imperium answer <run> <A|B|C>\``);
    }
    if (!IMPERIUM_OPTION_KEYS.includes(String(key).toUpperCase())) {
      return ctx.fail('Pilihan harus A, B, atau C.');
    }
    const result = await service.answerChamber(runId, ctx.sender, key);
    if (result.kind === 'chamber') return sendChamberResult(ctx, result);
    return ctx.reply(formatBattleResult(result));
  }

  if (sub === 'abort') {
    const runId = ctx.args?.[1];
    if (!runId) return ctx.fail(`Usage: \`${PREFIX}imperium abort <run>\``);
    const ok = await service.abandonRun(runId, ctx.sender);
    return ctx.reply(
      ok
        ? '🚪 Run Imperium dibatalkan.'
        : 'Run tidak ditemukan atau bukan milikmu.'
    );
  }

  const diff = parseDifficulty(sub);
  if (sub && diff === null && sub !== 'status' && sub !== 'list') {
    return ctx.fail(
      `Difficulty tidak valid. Pilih: ${IMPERIUM_DIFF_LIST.join(', ')}.`
    );
  }

  if (diff === null) {
    const status = await service.getStatus(ctx.sender);
    return sendStatus(ctx, status);
  }

  await ctx.applyCooldown();
  const run = await service.startRun(ctx.sender, diff);
  return sendQuestion(ctx, run);
}

export default {
  name: 'imperium',
  aliases: ['impr', 'labyrinth'],
  category: 'rpg',
  description: 'Endgame Labyrinth Imperium',
  cooldown: 30_000,
  manualCooldown: true,

  async execute(ctx) {
    try {
      await executeImperium(ctx);
    } catch (err) {
      await ctx.fail(err.message);
    }
  },
};
