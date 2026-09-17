import { F } from '#helpers/index.js';
import { imperiumService } from '#features/rpg/services/imperium-service.js';
import { Button } from '#messages/builder.js';

export const IMPERIUM_USAGE =
  'Pakai: `.imperium`, `.imperium <1-5>`, `.imperium pick <A/B/C>`';

function diffLine(d) {
  const mark = d.cleared ? '✅' : d.unlocked ? '🔓' : '🔒';
  const state = d.cleared ? 'Clear' : d.unlocked ? 'Open' : 'Locked';
  return `${mark} Diff ${d.diff} — *${d.bossName}* (${state})`;
}

export function statusBody(s) {
  return [
    '👑 *IMPERIUM*',
    `📅 Week: *${s.weekId}* • 🃏 Weekly: *${s.weeklyCard.name}* (${s.weeklyCard.role})`,
    `⭐ Level: *${s.level}* (min. ${s.minLevel})${s.canEnter ? '' : ' ⛔'}`,
    '',
    ...s.diffs.map(diffLine),
  ].join('\n');
}

export function statusView(s) {
  return [statusBody(s), '', 'Mulai: `.imperium <1-5>`'].join('\n');
}

// Baris list untuk Diff yang bisa dimainkan (unlocked & belum clear).
// id baris = command yang di-routing balik oleh parser (lihat expedition).
export function diffMenuRows(s) {
  return s.diffs
    .filter((d) => d.unlocked && !d.cleared)
    .map((d) => ({
      title: `Diff ${d.diff} — ${d.bossName}`,
      description:
        `🪙${F.formatNumber(d.reward.coin)} • ` +
        `⭐${F.formatNumber(d.reward.exp)} • 🧪${d.reward.cerelia}`,
      id: `.imperium ${d.diff}`,
    }));
}

export function fateBody(start) {
  return [
    `👑 *IMPERIUM — DIFF ${start.diff}*`,
    `👹 Boss: *${start.bossName}*`,
    '',
    '🎭 *CHOOSE YOUR FATE*',
    '',
    'A. ❓ Unknown',
    'B. ❓ Unknown',
    'C. ❓ Unknown',
  ].join('\n');
}

export function revealView(r) {
  const title = r.fate.kind === 'blessing' ? '✨ *BLESSING*' : '☠️ *CURSE*';
  const head = [title, `${r.fate.icon} *${r.fate.name}*`, r.fate.reveal, ''];
  if (!r.won) {
    return [
      ...head,
      `💀 Kalah di Diff *${r.diff}* vs *${r.bossName}*.`,
      '❤️ HP Profile tidak berkurang.',
      '',
      'Retry: mulai lagi `.imperium ' + r.diff + '`',
    ].join('\n');
  }
  return [
    ...head,
    `🏆 *DIFF ${r.diff} CLEAR!* ${r.bossName} tumbang.`,
    '',
    '🎁 Reward',
    `🪙 +${F.formatNumber(r.rewards.coin)} Coin`,
    `⭐ +${F.formatNumber(r.rewards.exp)} EXP`,
    `🧪 +${F.formatNumber(r.rewards.cerelia)} Cerelia`,
    ...(r.leveledUp ? ['', '⭐ *Level Up!*'] : []),
  ].join('\n');
}

export async function sendDiffMenu(ctx, s) {
  const rows = diffMenuRows(s);
  if (!rows.length) return ctx.reply(statusView(s));
  try {
    const builder = new Button(ctx.sock)
      .setTitle('👑 IMPERIUM')
      .setBody(statusBody(s))
      .setFooter('Pilih Diff untuk mulai')
      .addSelection('⚔️ Pilih Diff');
    builder.makeSection(`Week ${s.weekId} • ${s.weeklyCard.name}`);
    for (const row of rows) {
      builder.makeRow('', row.title, row.description, row.id);
    }
    return await builder.send(ctx.jid);
  } catch {
    return ctx.reply(statusView(s));
  }
}

export async function sendFateMenu(ctx, start) {
  try {
    const builder = new Button(ctx.sock)
      .setTitle(`👑 IMPERIUM — DIFF ${start.diff}`)
      .setBody(fateBody(start))
      .setFooter('Buta: efek baru terlihat setelah dipilih')
      .addReply('A ❓', '.imperium pick A')
      .addReply('B ❓', '.imperium pick B')
      .addReply('C ❓', '.imperium pick C');
    return await builder.send(ctx.jid);
  } catch {
    return ctx.reply(`${fateBody(start)}\n\nPilih: \`.imperium pick <A/B/C>\``);
  }
}

// Hasil pick: edit pesan fate bila ada quoted key (tap tombol),
// fallback reply pesan baru bila diketik manual / edit gagal.
export async function sendPickResult(ctx, result) {
  const text = revealView(result);
  const editKey = ctx.quoted?.key;
  if (editKey?.id) {
    try {
      await ctx.sock.sendMessage(ctx.jid, { text, edit: editKey });
      return { edited: true };
    } catch {
      // fallback ke reply di bawah
    }
  }
  await ctx.reply(text);
  return { edited: false };
}

export async function executeImperium(ctx, { service = imperiumService } = {}) {
  const [subRaw, ...rest] = ctx.args ?? [];
  const sub = (subRaw ?? '').toLowerCase();
  try {
    if (!sub || sub === 'status') {
      if (rest.length) return ctx.fail(IMPERIUM_USAGE);
      const s = await service.status(ctx.sender);
      return sendDiffMenu(ctx, s);
    }
    if (sub === 'pick') {
      const [slot] = rest;
      if (!slot || rest.length > 1) {
        return ctx.fail('Pakai: `.imperium pick <A/B/C>`');
      }
      const result = await service.pick(ctx.sender, slot);
      return sendPickResult(ctx, result);
    }
    if (/^[1-5]$/.test(sub) && rest.length === 0) {
      const start = await service.start(ctx.sender, Number(sub));
      return sendFateMenu(ctx, start);
    }
    if (/^[abc]$/.test(sub) && rest.length === 0) {
      const result = await service.pick(ctx.sender, sub);
      return sendPickResult(ctx, result);
    }
    return ctx.fail(IMPERIUM_USAGE);
  } catch (err) {
    await ctx.fail(err.message);
  }
}

export default {
  name: 'imperium',
  aliases: ['imp'],
  category: 'rpg',
  description: 'Weekly endgame challenge (5 Diff)',
  cooldown: 5_000,

  async execute(ctx) {
    await executeImperium(ctx);
  },
};
