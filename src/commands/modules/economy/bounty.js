import { Button } from '#messages/builder.js';
import { F } from '#helpers/index.js';
import { phoneToJid } from '#helpers/identifier.js';
import { bountyService } from '#features/economy/services/bounty-service.js';
import {
  BOUNTY_CONFIG,
  formatBountyRemaining,
  snapshotStatsLine,
} from '#features/economy/config/bounty-config.js';

function resolveTarget(ctx) {
  const mentioned = ctx.mentions?.[0];
  if (mentioned) return mentioned;
  const quoted = ctx.quoted?.sender;
  if (quoted && !quoted.endsWith('@g.us')) return quoted;
  const raw = ctx.args[1] ?? ctx.args[0];
  if (raw && raw.includes('@')) return phoneToJid(raw);
  if (raw && /^\d+$/.test(raw)) return phoneToJid(raw);
  return null;
}

async function showBoard(ctx) {
  const board = await bountyService.listBoard();
  if (!board.length) {
    return ctx.reply(
      [
        '🎯 *BOUNTY BOARD*',
        '',
        'Belum ada buronan.',
        'Buronan muncul otomatis setelah ada Crime yang berhasil.',
      ].join('\n')
    );
  }

  const builder = new Button(ctx.sock)
    .setTitle('🎯 BOUNTY BOARD')
    .setSubtitle('Buru buronan untuk hadiah Coin')
    .setBody('Pilih buronan yang ingin kamu kejar')
    .setFooter('Tap buronan untuk langsung mengejar')
    .addSelection('🎯 Pilih Buronan')
    .makeSection('Buronan Aktif');

  const nowMs = Date.now();
  for (const b of board) {
    const remaining = Math.max(0, b.expires_at - nowMs);
    const num = b.owner_id.split('@')[0];
    builder.makeRow(
      `${b.crime_name || b.crime_id || 'crime'}`,
      `👤 @${num} — ${F.formatNumber(b.bounty_coin)} Coin`,
      `${snapshotStatsLine(b.snapshot)} • ⏳ ${formatBountyRemaining(remaining)}`,
      `.bounty hunt @${num}`
    );
  }

  return builder.send(ctx.jid);
}

export default {
  name: 'bounty',
  aliases: ['buronan'],
  category: 'economy',
  description: 'Buru buronan hasil Crime untuk hadiah Coin',
  cooldown: BOUNTY_CONFIG.hunterCooldownMs,
  manualCooldown: true,

  async execute(ctx) {
    const sub = ctx.args[0]?.toLowerCase();

    if (!sub || sub === 'list') {
      return showBoard(ctx);
    }

    if (sub !== 'hunt') {
      return ctx.fail(
        [
          'Usage:',
          '- `.bounty` — lihat Bounty Board',
          '- `.bounty hunt @tag` — buru buronan',
        ].join('\n')
      );
    }

    const targetJid = resolveTarget(ctx);
    if (!targetJid) {
      return ctx.fail(
        'Usage: `.bounty hunt @tag`, reply pesan target, atau `.bounty hunt <nomor>`'
      );
    }
    if (targetJid === ctx.sender) {
      return ctx.fail('❌ Tidak bisa memburu diri sendiri.');
    }

    await ctx.applyCooldown();
    let battled = false;
    try {
      const statusMsg = await ctx.reply(
        ['🎯 *BOUNTY HUNT*', '', '🔍 Mencari buronan...'].join('\n')
      );

      const result = await bountyService.hunt(ctx.sender, targetJid, {
        pushName: ctx.pushName,
      });
      battled = true;

      const edit = async (text) =>
        ctx.sock.sendMessage(ctx.jid, { text, edit: statusMsg.key });

      if (result.expired) {
        await ctx.clearCooldown();
        await edit('❌ Bounty sudah expired dan dikembalikan ke pemilik.');
        return;
      }

      if (result.won) {
        await edit(
          [
            '🎯 *BOUNTY CLEAR*',
            '',
            `Buronan @${targetJid.split('@')[0]} tertangkap!`,
            `⚔️ ${result.rounds} round${result.rounds > 1 ? 's' : ''}`,
            '',
            '🎁 Reward',
            `🪙 +${F.formatNumber(result.reward)} Coin`,
          ].join('\n')
        );
        return;
      }

      await edit(
        [
          '🎯 *BOUNTY FAILED*',
          '',
          result.draw
            ? '⚖️ Battle berakhir seri. Bounty tetap aktif.'
            : '💀 Kamu kalah. Bounty tetap aktif.',
          `⚔️ ${result.rounds} round${result.rounds > 1 ? 's' : ''}`,
          '',
          'Tidak ada reward.',
        ].join('\n')
      );
    } catch (error) {
      if (
        error.code === 'NO_BOUNTY' ||
        error.code === 'EXPIRED' ||
        error.code === 'HP0'
      ) {
        if (!battled) await ctx.clearCooldown();
        return ctx.fail(error.message);
      }
      if (error.code === 'ALREADY_CLAIMED') {
        return ctx.fail(error.message);
      }
      if (error.code === 'SELF_HUNT') {
        await ctx.clearCooldown();
        return ctx.fail(error.message);
      }
      if (!battled) await ctx.clearCooldown();
      return ctx.fail(error.message);
    }
  },
};
