import { F } from '#helpers/index.js';
import { imperiumService } from '#features/rpg/services/imperium-service.js';
import { Button } from '#messages/builder.js';

export const IMPERIUM_USAGE =
  'Pakai: `.imperium`, `.imperium <1-5>`, `.imperium pick <A/B/C>`';

// Delay antara reveal fate dan result battle (alur: edit reveal -> delay -> edit result).
export const IMPERIUM_REVEAL_DELAY_MS = 3_000;

// Key pesan fate menu per user (ephemeral UI state, bukan progress mingguan).
// Dipakai agar pick bisa meng-edit chat fate yang sama. Hilang saat restart
// -> fallback kirim pesan baru. Tidak menyentuh state mingguan di database.
const fateMsgKeys = new Map();

export function rememberFateKey(sender, key) {
  if (key?.id) fateMsgKeys.set(sender, key);
}

export function takeFateKey(sender) {
  const key = fateMsgKeys.get(sender) ?? null;
  fateMsgKeys.delete(sender);
  return key;
}

export function clearFateKeys() {
  fateMsgKeys.clear();
}

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

// Edit #1 saat pick: chat fate menu berubah menjadi pilihan yang didapat.
export function fateRevealView(r) {
  const title = r.fate.kind === 'blessing' ? '✨ *BLESSING*' : '☠️ *CURSE*';
  return [title, `${r.fate.icon} *${r.fate.name}*`, r.fate.reveal].join('\n');
}

// Edit #2 (atau single reply bila tidak ada key): reveal + result win/lose.
export function revealView(r) {
  return [fateRevealView(r), '', ...revealResultLines(r)].join('\n');
}

function revealResultLines(r) {
  if (!r.won) {
    return [
      `💀 Kalah di Diff *${r.diff}* vs *${r.bossName}*.`,
      '❤️ HP Profile tidak berkurang.',
      '',
      'Retry: mulai lagi `.imperium ' + r.diff + '`',
    ];
  }
  return [
    `🏆 *DIFF ${r.diff} CLEAR!* ${r.bossName} tumbang.`,
    '',
    '🎁 Reward',
    `🪙 +${F.formatNumber(r.rewards.coin)} Coin`,
    `⭐ +${F.formatNumber(r.rewards.exp)} EXP`,
    `🧪 +${F.formatNumber(r.rewards.cerelia)} Cerelia`,
    ...(r.leveledUp ? ['', '⭐ *Level Up!*'] : []),
  ];
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

// Pilihan fate dikirim sebagai teks biasa (bukan Button) karena pesan
// interaktif tidak mendukung edit; user memilih dengan ketik pick A/B/C.
// Key pesan disimpan agar pick nanti meng-edit chat ini (bukan kirim baru).
export async function sendFateMenu(ctx, start) {
  const msg = await ctx.reply(
    `${fateBody(start)}\n\nPilih: \`.imperium pick <A/B/C>\``
  );
  rememberFateKey(ctx.sender, msg?.key);
  return msg;
}

async function editOrReply(ctx, key, text) {
  if (key?.id) {
    try {
      await ctx.sock.sendMessage(ctx.jid, { text, edit: key });
      return { edited: true };
    } catch {
      // fallback ke reply di bawah
    }
  }
  await ctx.reply(text);
  return { edited: false };
}

// Alur pick: edit chat fate menu -> reveal pilihan, delay beberapa detik,
// edit chat yang sama -> result win/lose. Tanpa key (mis. restart / ketik
// manual tanpa menu) kirim sekali sebagai pesan baru.
export async function sendPickResult(ctx, result, { sleepFn = F.sleep } = {}) {
  const key = takeFateKey(ctx.sender) ?? ctx.quoted?.key ?? null;
  if (!key?.id) {
    await ctx.reply(revealView(result));
    return { edited: false };
  }
  await editOrReply(ctx, key, fateRevealView(result));
  await sleepFn(IMPERIUM_REVEAL_DELAY_MS);
  return editOrReply(ctx, key, revealView(result));
}

export async function executeImperium(
  ctx,
  { service = imperiumService, sleepFn = F.sleep } = {}
) {
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
      return sendPickResult(ctx, result, { sleepFn });
    }
    if (/^[1-5]$/.test(sub) && rest.length === 0) {
      const start = await service.start(ctx.sender, Number(sub));
      return sendFateMenu(ctx, start);
    }
    if (/^[abc]$/.test(sub) && rest.length === 0) {
      const result = await service.pick(ctx.sender, sub);
      return sendPickResult(ctx, result, { sleepFn });
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
