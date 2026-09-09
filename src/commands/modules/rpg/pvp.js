/**
 * RPG 2.0 — `.pvp` command (migrated from legacy `.battle`, same UI/flow).
 *
 * Main command is `.pvp`; legacy aliases (`battle`, `fight`, `lawan`,
 * `duel`) are kept for compatibility. Challenge -> target replies
 * yes/ya on the confirm message (handled by the pvp-confirm extension)
 * -> auto-simulated duel via the Battle Engine -> result + rewards.
 */
import { userModel } from '#storage/models/user.js';
import { pvpService } from '#features/rpg/services/pvp-service.js';
import { finalStatService } from '#features/rpg/services/final-stat-service.js';
import { PVP_CONFIG, PVP_SNAPSHOT_DELAY_MS } from '#features/rpg/config/pvp-config.js';
import { phoneToJid } from '#helpers/identifier.js';
import { F } from '#helpers/index.js';
import { sleep } from '#helpers/formatter.js';
import { logger } from '#helpers/logger.js';

const HP_BAR_LEN = 10;

async function displayName(jid) {
  const u = await userModel.findById(jid);
  return u?.push_name || jid.split('@')[0];
}

function hpBar(hp, max) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, hp / max)) : 0;
  const filled = Math.round(ratio * HP_BAR_LEN);
  return '█'.repeat(filled) + '░'.repeat(HP_BAR_LEN - filled);
}

function padName(name, width) {
  if (name.length >= width) return name.slice(0, width);
  return name + ' '.repeat(width - name.length);
}

function buildStartText(aName, aHp, aMax, dName, dHp, dMax) {
  return [
    `╭────── ⚔️ DUEL ──────╮`,
    `│`,
    `│ 👤 ${aName}`,
    `│ ❤️ ${F.formatNumber(aHp)} / ${F.formatNumber(aMax)}  ${hpBar(aHp, aMax)}`,
    `│`,
    `│        VS`,
    `│`,
    `│ 👤 ${dName}`,
    `│ ❤️ ${F.formatNumber(dHp)} / ${F.formatNumber(dMax)}  ${hpBar(dHp, dMax)}`,
    `│`,
    `│ ⚔️ Battle starting...`,
    `╰─────────────────────╯`,
  ].join('\n');
}

function buildSnapshotText(aName, aHp, dName, dHp, snap) {
  const lines = [
    `╭────── ⚔️ DUEL ──────╮`,
    `│`,
    `│ 👤 ${padName(aName, 10)} ❤️ ${F.formatNumber(aHp)}`,
    `│ 👤 ${padName(dName, 10)} ❤️ ${F.formatNumber(dHp)}`,
    `│`,
  ];
  if (snap) lines.push(`│ ${snap}`);
  lines.push(`╰─────────────────────╯`);
  return lines.join('\n');
}

function buildResultText(result, aName, dName) {
  const { challengerHp, targetHp, draw, winner } = result;
  const lines = [
    `╭────── 🏆 DUEL RESULT ──────╮`,
    `│`,
    `│ 👤 ${padName(aName, 10)} ❤️ ${F.formatNumber(Math.max(0, challengerHp))}`,
    `│ 👤 ${padName(dName, 10)} ❤️ ${F.formatNumber(Math.max(0, targetHp))}`,
    `│`,
  ];

  if (draw) {
    lines.push(`│ ⚖️ Battle berakhir seri!`);
  } else {
    const winName = winner === result.challenger ? aName : dName;
    const loseName = winner === result.challenger ? dName : aName;
    lines.push(
      `│ 🏆 ${winName} menang! 🪙 +${F.formatNumber(result.coin)} Coin`,
      `│ 💀 ${loseName} kalah 🪙 -${F.formatNumber(result.loserLoss)} Coin`,
      `│ ⭐ EXP: +${F.formatNumber(result.exp.win)} / +${F.formatNumber(result.exp.lose)}`,
      `│ ⚔️ ${result.rounds} ronde`
    );
  }

  lines.push(`╰─────────────────────────────╯`);
  return lines.join('\n');
}

/** Notable event line for a round snapshot (legacy style). */
function roundSnapshot(log, round) {
  const entries = log.filter((e) => e.round === round);
  const crit = entries.find((e) => e.isCrit);
  if (crit) return `💥 Hit kritis! -${F.formatNumber(crit.damage)}`;
  const biggest = entries.reduce(
    (best, e) => (!best || e.damage > best.damage ? e : best),
    null
  );
  return biggest ? `⚔️ Hit -${F.formatNumber(biggest.damage)}` : null;
}

/** HP per side after each round, walked from the engine log. */
function hpTimeline(log, startCHp, startTHp) {
  const byRound = new Map();
  let cHp = startCHp;
  let tHp = startTHp;
  let round = 1;
  for (const entry of log) {
    if (entry.round > round) round = entry.round;
    if (entry.actor === 'player') tHp = entry.targetHp;
    else cHp = entry.targetHp;
    byRound.set(round, { cHp, tHp });
  }
  return byRound;
}

/**
 * Run the duel UI: start message -> round snapshots -> result edit.
 * Shared by the command (after confirm) and the pvp-confirm extension.
 */
export async function runPvpBattle(ctx, session) {
  const challenger = session.challenger;
  const target = session.target;

  const [aName, dName, cFinal, tFinal] = await Promise.all([
    displayName(challenger),
    displayName(target),
    finalStatService.getFinalStats(challenger),
    finalStatService.getFinalStats(target),
  ]);
  const mentions = [challenger, target];

  const battleMsg = await ctx.send(
    buildStartText(
      aName,
      cFinal.currentHp,
      cFinal.maxHp,
      dName,
      tFinal.currentHp,
      tFinal.maxHp
    ),
    { mentions }
  );
  const msgKey = battleMsg?.key;

  const edit = async (text) => {
    if (!msgKey) return;
    try {
      await ctx.sock.sendMessage(ctx.jid, { text, edit: msgKey, mentions });
    } catch (err) {
      logger.warn({ err }, '[PvP] message edit failed');
    }
  };

  let result;
  try {
    result = await pvpService.run(session.id);
  } catch (err) {
    await pvpService.cancel(session.id);
    await edit(
      `╭────── ⚔️ DUEL ──────╮\n│\n│ ❌ Battle dibatalkan\n│ ${err.message}\n╰─────────────────────╯`
    );
    return;
  }

  if (!result) {
    await edit(
      `╭────── ⚔️ DUEL ──────╮\n│\n│ ❌ Battle sudah tidak aktif\n╰─────────────────────╯`
    );
    return;
  }

  // Round snapshots at the legacy pacing points (3 / 6 / 9).
  const timeline = hpTimeline(result.log, cFinal.currentHp, tFinal.currentHp);
  for (const round of [3, 6, 9]) {
    if (round > result.rounds) break;
    const snap = roundSnapshot(result.log, round);
    const hp = timeline.get(round) ?? { cHp: result.challengerHp, tHp: result.targetHp };
    await edit(buildSnapshotText(aName, hp.cHp, dName, hp.tHp, snap));
    await sleep(PVP_SNAPSHOT_DELAY_MS);
  }

  await edit(buildResultText(result, aName, dName));
}

export default {
  name: 'pvp',
  aliases: ['battle', 'fight', 'lawan', 'duel'],
  category: 'rpg',
  description: 'Tantang user lain untuk PvP',
  cooldown: PVP_CONFIG.cooldownMs,

  async execute(ctx) {
    const targetJid =
      ctx.mentions?.[0] ??
      (ctx.quoted?.sender && !ctx.quoted.sender.endsWith('@g.us')
        ? ctx.quoted.sender
        : null) ??
      (ctx.args[0] && ctx.args[0].includes('@')
        ? phoneToJid(ctx.args[0])
        : null);
    if (!targetJid) {
      return ctx.fail(
        'Usage: `.pvp @tag`, reply pesan target, atau `.pvp <nomor>`'
      );
    }
    if (targetJid === ctx.sender) {
      return ctx.fail('❌ Tidak bisa PvP sama diri sendiri.');
    }

    let session;
    try {
      session = await pvpService.challenge(ctx.sender, targetJid);
    } catch (err) {
      return ctx.fail(`❌ ${err.message}`);
    }

    const confirmMsg = await ctx.reply(
      `⚔️ *Konfirmasi PvP*\n\n@${ctx.sender.split('@')[0]} menantang @${targetJid.split('@')[0]} untuk duel!\n\nBalas pesan ini dengan *yes* untuk menerima, *no* untuk menolak.`,
      { mentions: [ctx.sender, targetJid] }
    );

    const bound = await pvpService.bindConfirm(session.id, confirmMsg?.key?.id ?? '');
    if (!bound) await pvpService.cancel(session.id);

    return confirmMsg;
  },
};
