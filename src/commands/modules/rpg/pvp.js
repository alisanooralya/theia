import { userModel } from '#storage/models/user.js';
import { pvpService } from '#features/rpg/services/pvp-service.js';
import {
  PVP_CONFIG,
  PVP_ROUND_DELAY_MS,
} from '#features/rpg/config/pvp-config.js';
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

function buildStartText(aName, aNum, aHp, aMax, dName, dNum, dHp, dMax) {
  return [
    `╭────── ⚔️ DUEL ──────╮`,
    `│`,
    `│ 👤 ${aName} @${aNum}`,
    `│ ❤️ ${F.formatNumber(aHp)} / ${F.formatNumber(aMax)}  ${hpBar(aHp, aMax)}`,
    `│`,
    `│        VS`,
    `│`,
    `│ 👤 ${dName} @${dNum}`,
    `│ ❤️ ${F.formatNumber(dHp)} / ${F.formatNumber(dMax)}  ${hpBar(dHp, dMax)}`,
    `│`,
    `│ ⚔️ Battle starting...`,
    `╰─────────────────────╯`,
  ].join('\n');
}

function buildSnapshotText(aName, aNum, aHp, dName, dNum, dHp, round, total, snap) {
  const lines = [
    `╭────── ⚔️ DUEL ──────╮`,
    `│ 🔁 Ronde ${round}/${total}`,
    `│`,
    `│ 👤 ${padName(aName, 10)} @${aNum} ❤️ ${F.formatNumber(aHp)}`,
    `│ 👤 ${padName(dName, 10)} @${dNum} ❤️ ${F.formatNumber(dHp)}`,
    `│`,
  ];
  if (snap) lines.push(`│ ${snap}`);
  lines.push(`╰─────────────────────╯`);
  return lines.join('\n');
}

function buildResultText(result, aName, aNum, dName, dNum) {
  const { challengerHp, targetHp, draw, winner } = result;
  const lines = [
    `╭────── 🏆 DUEL RESULT ──────╮`,
    `│`,
    `│ 👤 ${padName(aName, 10)} @${aNum} ❤️ ${F.formatNumber(Math.max(0, challengerHp))}`,
    `│ 👤 ${padName(dName, 10)} @${dNum} ❤️ ${F.formatNumber(Math.max(0, targetHp))}`,
    `│`,
  ];

  if (draw) {
    lines.push(`│ ⚖️ Battle berakhir seri!`);
  } else {
    const winName = winner === result.challenger ? aName : dName;
    const loseName = winner === result.challenger ? dName : aName;
    const winNum = winner === result.challenger ? aNum : dNum;
    const loseNum = winner === result.challenger ? dNum : aNum;
    lines.push(
      `│ 🏆 ${winName} @${winNum} menang! 🪙 +${F.formatNumber(result.coin)} Coin`,
      `│ 💀 ${loseName} @${loseNum} kalah 🪙 -${F.formatNumber(result.loserLoss)} Coin`,
      `│ ⭐ EXP: +${F.formatNumber(result.exp.win)} / +${F.formatNumber(result.exp.lose)}`,
      `│ ⚔️ ${result.rounds} ronde`
    );
  }

  const skills = usedSkills(result.log);
  if (skills.length) lines.push(`│ ⚡ Skill: ${skills.join(', ')}`);

  lines.push(`╰─────────────────────────────╯`);
  return lines.join('\n');
}

function usedSkills(log) {
  return [
    ...new Set((log ?? []).filter((e) => e.skill).map((e) => e.skill)),
  ];
}

function roundSnapshot(log, round) {
  const entries = log.filter((e) => e.round === round);
  const skilled = entries.filter((e) => e.skill);
  if (skilled.length) {
    const biggest = skilled.reduce((best, e) =>
      !best || e.damage > best.damage ? e : best
    );
    return `⚡ ${biggest.skill} -${F.formatNumber(biggest.damage)}`;
  }
  const crit = entries.find((e) => e.isCrit);
  if (crit) return `💥 Hit kritis! -${F.formatNumber(crit.damage)}`;
  const biggest = entries.reduce(
    (best, e) => (!best || e.damage > best.damage ? e : best),
    null
  );
  return biggest ? `⚔️ Hit -${F.formatNumber(biggest.damage)}` : null;
}

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

export async function runPvpBattle(ctx, session) {
  const challenger = session.challenger;
  const target = session.target;

  const [aName, dName] = await Promise.all([
    displayName(challenger),
    displayName(target),
  ]);
  const aNum = challenger.split('@')[0];
  const dNum = target.split('@')[0];
  const mentions = [challenger, target];

  let result;
  try {
    result = await pvpService.run(session.id);
  } catch (err) {
    await pvpService.cancel(session.id);
    await ctx.send(
      `╭────── ⚔️ DUEL ──────╮\n│\n│ ❌ Battle dibatalkan\n│ ${err.message}\n╰─────────────────────╯`,
      { mentions }
    );
    return;
  }

  if (!result) {
    await ctx.send(
      `╭────── ⚔️ DUEL ──────╮\n│\n│ ❌ Battle sudah tidak aktif\n╰─────────────────────╯`,
      { mentions }
    );
    return;
  }

  const start = result.startHp ?? {
    challenger: result.challengerHp,
    target: result.targetHp,
    challengerMax: result.challengerHp,
    targetMax: result.targetHp,
  };

  const battleMsg = await ctx.send(
    buildStartText(
      aName,
      aNum,
      start.challenger,
      start.challengerMax,
      dName,
      dNum,
      start.target,
      start.targetMax
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

  const timeline = hpTimeline(result.log, start.challenger, start.target);
  const playedRounds = [...timeline.keys()].sort((a, b) => a - b);
  for (const round of playedRounds) {
    const snap = roundSnapshot(result.log, round);
    const hp = timeline.get(round) ?? {
      cHp: result.challengerHp,
      tHp: result.targetHp,
    };
    await edit(
      buildSnapshotText(
        aName,
        aNum,
        hp.cHp,
        dName,
        dNum,
        hp.tHp,
        round,
        playedRounds[playedRounds.length - 1],
        snap
      )
    );
    await sleep(PVP_ROUND_DELAY_MS);
  }

  await edit(buildResultText(result, aName, aNum, dName, dNum));
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
      return ctx.fail(err.message);
    }

    const confirmMsg = await ctx.reply(
      `⚔️ *Konfirmasi PvP*\n\n@${ctx.sender.split('@')[0]} menantang @${targetJid.split('@')[0]} untuk duel!\n\nBalas pesan ini dengan *yes* untuk menerima, *no* untuk menolak.`,
      { mentions: [ctx.sender, targetJid] }
    );

    const bound = await pvpService.bindConfirm(
      session.id,
      confirmMsg?.key?.id ?? ''
    );
    if (!bound) {
      await pvpService.cancel(session.id);
      return ctx.fail('❌ Gagal menyiapkan konfirmasi PvP, coba lagi.');
    }

    return confirmMsg;
  },
};
