/**
 * Economy 2.0 — `.bounty` command (migrated from legacy, same UI/flow).
 * Thin layer over bountyService: menu, daily gate handled by the service
 * (atomic), 3s tracking delay, edit-message result.
 */
import { Button } from '#messages/builder.js';
import { bountyService as bounty } from '#features/economy/services/bounty-service.js';
import {
  rewardRange,
  targetStatLine,
} from '#features/economy/config/bounty-config.js';
import { F } from '#helpers/index.js';

function bountyMenu(ctx) {
  const builder = new Button(ctx.sock)
    .setTitle('🎯 BOUNTY')
    .setSubtitle('Basmi buronan, kumpulkan Coin')
    .setBody('Pilih buronan yang ingin kamu kejar')
    .setFooter('Kalah = tanpa reward, HP tetap berkurang')
    .addSelection('🎯 Pilih Buronan');

  for (const [key, config] of Object.entries(bounty.difficulty)) {
    builder.makeSection(config.label);

    for (const target of config.targets) {
      builder.makeRow(
        '',
        `${target.emoji} ${target.name}`,
        `${targetStatLine(target)} • ${rewardRange(config)}`,
        `.bounty ${key} ${target.id}`
      );
    }
  }

  return builder.send(ctx.jid);
}

function formatVictory(target, reward, rounds) {
  return [
    '🎯 BOUNTY CLEAR',
    '',
    `${target.emoji} ${target.name} tertangkap!`,
    `⚔️ ${rounds} round${rounds > 1 ? 's' : ''}`,
    '',
    '🎁 Reward',
    `🪙 +${F.formatNumber(reward.coin)} Coin`,
    `⭐ +${reward.exp} EXP`,
  ].join('\n');
}

function formatDefeat(target, rounds) {
  return [
    '🎯 BOUNTY FAILED',
    '',
    `💀 Kamu kalah dari ${target.name}.`,
    `⚔️ Survived ${rounds} round${rounds > 1 ? 's' : ''}`,
    '',
    'Tidak ada reward.',
  ].join('\n');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default {
  name: 'bounty',
  aliases: ['buronan'],
  category: 'economy',
  description: 'Kejar buronan untuk hadiah Coin',
  cooldown: 0,

  async execute(ctx) {
    const sub = ctx.args[0]?.toLowerCase();
    const targetId = ctx.args[1]?.toLowerCase();

    if (!sub) {
      try {
        return await bountyMenu(ctx);
      } catch (error) {
        return ctx.fail(error.message);
      }
    }

    const config = bounty.getBountyDifficulty(sub);
    if (!config)
      return ctx.fail(
        'Difficulty tidak valid. Pilih: easy, medium, atau hard.'
      );

    if (!targetId)
      return ctx.fail(
        [
          `${config.label} — pilih buronannya:`,
          ...config.targets.map(
            (t) => `- \`.bounty ${sub} ${t.id}\` — ${t.name}`
          ),
          '',
          'Atau ketik `.bounty` untuk daftar lengkap.',
        ].join('\n')
      );

    const target = bounty.getBountyTarget(sub, targetId);
    if (!target)
      return ctx.fail(
        [
          `Buronan tidak ditemukan untuk difficulty ${config.name}.`,
          '',
          'Pilihan yang tersedia:',
          ...config.targets.map((t) => `- \`${t.id}\` — ${t.name}`),
        ].join('\n')
      );

    let result;
    try {
      const statusMsg = await ctx.reply(
        [
          `🎯 BOUNTY • ${config.name.toUpperCase()}`,
          '',
          `${target.emoji} ${target.name}`,
          `⚔️ Melacak buronan...`,
        ].join('\n')
      );

      await sleep(3000);

      result = await bounty.attempt(ctx.sender, sub, target.id);
      await ctx.applyCooldown();

      const finalText = result.won
        ? formatVictory(target, result.reward, result.rounds)
        : formatDefeat(target, result.rounds);

      await ctx.sock.sendMessage(ctx.jid, {
        text: finalText,
        edit: statusMsg.key,
      });
    } catch (error) {
      if (error.code === 'DAILY_USED')
        return ctx.reply(
          '❌ Kamu sudah berburu hari ini. Reset berikutnya jam *00:00 WIB*.'
        );
      if (error.code === 'HP0') return ctx.fail(error.message);
      return ctx.fail(error.message);
    }
  },
};
