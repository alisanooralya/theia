import { bountyService as bounty } from '#features/rpg/bounty.js';
import { userModel, statsModel } from '#storage/models/index.js';
import { Button } from '#messages/builder.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const WIB_OFFSET = 7;

function wibDayKey(tsSec) {
  const d = new Date(tsSec * 1000);
  const utc = d.getTime() + d.getTimezoneOffset() * 60_000;
  const wib = new Date(utc + WIB_OFFSET * 3_600_000);
  return wib.toISOString().slice(0, 10);
}

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
        `${bounty.targetStatLine(target)} • ${bounty.rewardRange(config)}`,
        `.bounty ${key} ${target.id}`
      );
    }
  }

  return builder.send(ctx.jid);
}

export default {
  name: 'bounty',
  aliases: ['buronan'],
  category: 'rpg',
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

    const config = bounty.getDifficultyConfig(sub);
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

    const target = bounty.getTarget(sub, targetId);
    if (!target)
      return ctx.fail(
        [
          `Buronan tidak ditemukan untuk difficulty ${config.name}.`,
          '',
          'Pilihan yang tersedia:',
          ...config.targets.map((t) => `- \`${t.id}\` — ${t.name}`),
        ].join('\n')
      );

    const user = await userModel.ensure(ctx.sender, { pushName: ctx.pushName });
    await statsModel.ensure(ctx.sender);

    const todayKey = wibDayKey(Math.floor(Date.now() / 1000));
    const lastKey = user.last_bounty ? wibDayKey(user.last_bounty) : null;
    if (lastKey === todayKey) {
      return ctx.reply(
        '❌ Kamu sudah berburu hari ini. Reset berikutnya jam *00:00 WIB*.'
      );
    }

    try {
      await bounty.ensureAlive(ctx.sender);
    } catch (error) {
      return ctx.fail(error.message);
    }

    let battleDone = false;
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

      const result = await bounty.simulateBattle(ctx.sender, sub, target.id);
      battleDone = true;

      await userModel.recordBounty(ctx.sender);

      let finalText;
      if (result.won) {
        const reward = await bounty.grantReward(ctx.sender, sub, target);
        finalText = bounty.formatVictory(
          config,
          target,
          reward,
          result.rounds.length
        );
      } else {
        finalText = bounty.formatDefeat(config, target, result.rounds.length);
      }

      await ctx.sock.sendMessage(ctx.jid, {
        text: finalText,
        edit: statusMsg.key,
      });
    } catch (error) {
      return ctx.fail(error.message);
    }
  },
};
