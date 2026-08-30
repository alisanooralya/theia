import { battleService } from '#features/combat/battle.js';
import {
  registerPendingBattle,
  BATTLE_CONFIRM_TTL,
} from '#features/combat/battle-pending.js';
import {
  createBattle,
  startBattle,
  finishBattle,
  cancelBattle,
  isInBattle,
} from '#features/combat/battle-state.js';
import { userModel, statsModel } from '#storage/models/index.js';
import { F } from '#helpers/index.js';
import { sleep } from '#helpers/formatter.js';
import { phoneToJid } from '#helpers/identifier.js';
import { logger } from '#helpers/logger.js';

const HP_BAR_LEN = 10;

function displayName(jid) {
  const u = userModel.findById(jid);
  return u?.push_name || jid.split('@')[0];
}

function hpBar(hp, max) {
  const ratio = max > 0 ? clamp(hp / max, 0, 1) : 0;
  const filled = Math.round(ratio * HP_BAR_LEN);
  return '█'.repeat(filled) + '░'.repeat(HP_BAR_LEN - filled);
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
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

function buildSnapshotText(aName, aHp, aMax, dName, dHp, dMax, snap) {
  const lines = [
    `╭────── ⚔️ DUEL ──────╮`,
    `│`,
    `│ 👤 ${padName(aName, 10)} ❤️ ${F.formatNumber(aHp)}`,
    `│ 👤 ${padName(dName, 10)} ❤️ ${F.formatNumber(dHp)}`,
    `│`,
  ];
  if (snap.eventLine) lines.push(`│ ${snap.eventLine}`);
  if (snap.momentumLine) lines.push(`│ ${snap.momentumLine}`);
  lines.push(`╰─────────────────────╯`);
  return lines.join('\n');
}

function buildResultText(result, aName, dName, aHp, aMax, dHp, dMax, mentionMap) {
  const resolveName = (jid) => mentionMap[jid] ?? displayName(jid);

  if (result.draw) {
    return [
      `╭────── 🏆 DUEL RESULT ──────╮`,
      `│`,
      `│ 👤 ${padName(aName, 10)} ❤️ ${F.formatNumber(aHp)}`,
      `│ 👤 ${padName(dName, 10)} ❤️ ${F.formatNumber(dHp)}`,
      `│`,
      `│ ⚖️ Battle berakhir seri!`,
      `│`,
      `╰─────────────────────────────╯`,
    ].join('\n');
  }

  const winJid = result.winner;
  const loseJid = result.loser;
  const winName = winJid === result.attackerJid ? aName : dName;
  const loseName = loseJid === result.attackerJid ? aName : dName;
  const winnerHp =
    winJid === result.attackerJid ? result.attackerFinalHp : result.defenderFinalHp;

  const lines = [
    `╭────── 🏆 DUEL RESULT ──────╮`,
    `│`,
    `│ 👤 ${padName(winName, 10)} ❤️ ${F.formatNumber(winnerHp)}`,
    `│ 👤 ${padName(loseName, 10)} 💀 0`,
    `│`,
  ];

  if (result.highlights.length) {
    for (const h of result.highlights.slice(0, 5)) {
      lines.push(`│ ${h.replace(/@\d+/g, (m) => resolveName(`${m.slice(1)}@s.whatsapp.net`))}`);
    }
    lines.push(`│`);
  }

  lines.push(`│ 🏆 ${winName} wins!`, `│`, `│ 🪙 +${F.formatNumber(result.reward.cash)} Coin`, `│`, `│ ${loseName} lost 🪙 ${F.formatNumber(result.reward.loserLoss)} Coin`, `╰─────────────────────────────╯`);

  return lines.join('\n');
}

export async function runBattle(ctx, challenger, target, battleId) {
  const aStats = statsModel.ensure(challenger);
  const dStats = statsModel.ensure(target);
  if (aStats.hp <= 0) return ctx.reply('❤️ HP kamu 0! Pakai `!heal` dulu.');
  if (dStats.hp <= 0)
    return ctx.reply('❤️ HP lawan sedang 0, tunggu dia heal dulu.');

  if (!startBattle(battleId)) {
    cancelBattle(battleId);
    return ctx.reply('❌ Battle tidak bisa dimulai (salah satu player sedang dalam battle lain).');
  }

  const aName = displayName(challenger);
  const dName = displayName(target);
  const aMax = aStats.max_hp;
  const dMax = dStats.max_hp;

  const mentionMap = {
    [challenger]: `@${challenger.split('@')[0]}`,
    [target]: `@${target.split('@')[0]}`,
  };
  const mentions = [challenger, target];

  let battleMsg;
  try {
    await ctx.react('⚔️');
    const startText = buildStartText(aName, aStats.hp, aMax, dName, dStats.hp, dMax);
    battleMsg = await ctx.send(startText, { mentions });
  } catch (err) {
    cancelBattle(battleId);
    logger.error({ err }, '[Battle] failed to send initial message');
    return ctx.reply(`❌ Gagal memulai battle: ${err.message}`);
  }

  const msgKey = battleMsg?.key;

  const edit = async (text) => {
    if (!msgKey) return;
    try {
      await ctx.sock.enqueueSend(
        ctx.jid,
        { text, edit: msgKey, mentions },
        {},
        { bypass: true }
      );
    } catch (err) {
      logger.warn({ err }, '[Battle] message edit failed');
    }
  };

  let result;
  try {
    result = battleService.fight(challenger, target);
    result.attackerJid = challenger;
  } catch (err) {
    cancelBattle(battleId);
    await edit(`╭────── ⚔️ DUEL ──────╮\n│\n│ ❌ Battle dibatalkan\n│ ${err.message}\n╰─────────────────────╯`);
    return;
  }

  const snaps = result.snapshots.filter((s) => s.label !== 'Final');
  for (const snap of snaps) {
    const aHp = snap.aHp;
    const dHp = snap.dHp;
    const snapText = buildSnapshotText(aName, aHp, aMax, dName, dHp, dMax, snap);
    await edit(snapText);
    await sleep(2700);
  }

  const finalText = buildResultText(
    result,
    aName,
    dName,
    result.attackerFinalHp,
    aMax,
    result.defenderFinalHp,
    dMax,
    mentionMap
  );
  await edit(finalText);

  finishBattle(battleId);
}

export default {
  name: 'battle',
  aliases: ['fight', 'lawan', 'duel'],
  category: 'rpg',
  description: 'Tantang user lain untuk battle',
  cooldown: 120_000,
  isProblem: true,

  async execute(ctx) {
    const targetJid =
      ctx.mentions[0] ??
      (ctx.quoted?.sender && !ctx.quoted.sender.endsWith('@g.us')
        ? ctx.quoted.sender
        : null) ??
      (ctx.args[0] ? phoneToJid(ctx.args[0]) : null);
    if (!targetJid)
      ctx.fail(
        'Usage: `.battle @tag`, reply pesan target, atau `.battle <nomor>`'
      );
    if (targetJid === ctx.sender)
      ctx.fail('❌ Tidak bisa battle sama diri sendiri.');

    if (isInBattle(ctx.sender))
      ctx.fail('❌ Kamu sedang berada dalam battle lain.');
    if (isInBattle(targetJid))
      ctx.fail('❌ Lawan sedang berada dalam battle lain.');

    userModel.ensure(ctx.sender, { pushName: ctx.pushName });
    const target = userModel.findById(targetJid);
    if (!target) ctx.fail('❌ User tersebut belum terdaftar.');

    const aStats = statsModel.ensure(ctx.sender);
    const dStats = statsModel.ensure(targetJid);
    if (aStats.hp <= 0) return ctx.fail('❤️ HP kamu 0! Pakai `!heal` dulu.');
    if (dStats.hp <= 0)
      return ctx.fail('❤️ HP lawan sedang 0, tunggu dia heal dulu.');

    await ctx.react('⚔️');

    let battleId;
    try {
      battleId = createBattle(ctx.sender, targetJid);
    } catch (err) {
      return ctx.fail(`❌ ${err.message}`);
    }

    const confirmMsg = await ctx.reply(
      `⚔️ *Konfirmasi Battle*\n\n@${ctx.sender.split('@')[0]} menantang @${targetJid.split('@')[0]} untuk duel!\n\nBalas pesan ini dengan *yes* untuk menerima tantangan.`,
      { mentions: [ctx.sender, targetJid] }
    );

    registerPendingBattle(confirmMsg.key.id, {
      challenger: ctx.sender,
      target: targetJid,
      jid: ctx.jid,
      battleId,
      expires: Date.now() + BATTLE_CONFIRM_TTL,
    });

    return confirmMsg;
  },
};
