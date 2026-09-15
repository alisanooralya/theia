import { F } from '#helpers/index.js';
import { Button } from '#messages/builder.js';
import { crimeService } from '#features/economy/services/crime-service.js';
import {
  CRIMES,
  CRIME_COOLDOWN_MS,
  crimeStatLine,
  formatRemaining,
  getCrime,
} from '#features/economy/config/crime-config.js';
import { formatBountyRemaining } from '#features/economy/config/bounty-config.js';

function crimeMenu(ctx) {
  const builder = new Button(ctx.sock)
    .setTitle('🕵️ CRIME')
    .setSubtitle('Resiko tinggi, hasil besar')
    .setBody('Pilih aksi kriminal yang mau kamu kerjakan')
    .setFooter('Tertangkap = denda + penjara')
    .addSelection('🕵️ Pilih Kriminal')
    .makeSection('Daftar Kriminal');

  for (const crime of CRIMES) {
    builder.makeRow(
      crime.label,
      `${crime.emoji} ${crime.name.toUpperCase()}`,
      crimeStatLine(crime),
      `.crime ${crime.id}`
    );
  }

  return builder.send(ctx.jid);
}

async function sendResult(ctx, key, text) {
  try {
    await ctx.sock.sendMessage(ctx.jid, { text, edit: key });
  } catch {
    await ctx.reply(text);
  }
}

export default {
  name: 'crime',
  aliases: ['kejahatan', 'jahat'],
  category: 'economy',
  description: 'Lakukan kejahatan (resiko tinggi)',
  cooldown: CRIME_COOLDOWN_MS,
  manualCooldown: true,

  async execute(ctx) {
    const remaining = await crimeService.jailRemaining(ctx.sender, {
      pushName: ctx.pushName,
    });
    if (remaining > 0) {
      return ctx.reply(
        `🔒 Kamu masih berada di penjara!\n\n⏱️ Sisa hukuman: ${formatRemaining(remaining)}`
      );
    }

    const sub = ctx.args[0]?.toLowerCase();
    if (!sub) return crimeMenu(ctx);

    const lock = await crimeService.bountyLock(ctx.sender, {
      pushName: ctx.pushName,
    });
    if (lock) {
      const remainingMs = Math.max(0, lock.expires_at - Date.now());
      return ctx.reply(
        [
          '🚨 *KAMU MASIH BURONAN!*',
          '',
          `Bounty 🪙 ${F.formatNumber(lock.bounty_coin)} Coin masih aktif.`,
          `⏳ Sisa: ${formatBountyRemaining(remainingMs)}`,
          '',
          'Kamu tidak bisa melakukan Crime sampai bounty selesai (ditangkap) atau expired.',
        ].join('\n')
      );
    }

    const crime = getCrime(sub);
    if (!crime) return ctx.fail('Kriminal tidak ditemukan.');

    await ctx.applyCooldown();

    let rolled = false;
    try {
      const firstMsg = await ctx.reply('Kamu sedang mencoba kriminal !!');
      await F.sleep(2500);

      const result = await crimeService.commitCrime(ctx.sender, crime.id);
      rolled = true;
      const title = `${crime.emoji} *${crime.name.toUpperCase()}*`;

      if (result.outcome === 'success' || result.outcome === 'jackpot') {
        await ctx.clearCooldown();
        const label = result.outcome === 'jackpot' ? 'JACKPOT!' : 'Berhasil!';
        const pct = Math.round(result.bountyPercent * 100);
        const remainingMs = Math.max(0, result.expiresAt - Date.now());
        let text =
          `${title}\n\n${label} Total hasil\n` +
          `🪙 +${F.formatNumber(result.reward)} Coin\n\n` +
          `💰 Masuk wallet: +${F.formatNumber(result.walletCoin)} Coin\n` +
          `🎯 Bounty (${pct}%): ${F.formatNumber(result.bountyCoin)} Coin (reserved)\n` +
          `🚨 Kamu menjadi BURONAN selama ${formatBountyRemaining(remainingMs)}!\n`;
        if (result.outcome === 'jackpot')
          text += `\n🎰 *JACKPOT!* Keberuntungan besar!`;
        await sendResult(ctx, firstMsg.key, text);
        return;
      }

      if (result.outcome === 'lose') {
        let text = `${title}\n\nKalah dalam judi online!\n🪙 -${F.formatNumber(result.lose)} Coin`;
        if (result.lose === 0)
          text += `\nUntungnya kamu tidak punya uang untuk dibawa kalah. 😅`;
        await sendResult(ctx, firstMsg.key, text);
        return;
      }

      if (result.outcome === 'caught') {
        const lines = [
          '🚔 *CAUGHT!*',
          '',
          'Kamu tertangkap polisi!',
          '',
          `🪙 Denda: ${F.formatNumber(result.penalty)}`,
          `🔒 Penjara: ${Math.floor(crime.prisonMs / 60000)} menit`,
        ];
        await sendResult(ctx, firstMsg.key, lines.join('\n'));
        return;
      }

      const text = `${title}\n\nGagal melakukan aksi.\nUntungnya kamu berhasil kabur. 💨`;
      await sendResult(ctx, firstMsg.key, text);
    } catch (err) {
      if (err.code === 'BOUNTY_ACTIVE') {
        if (!rolled) await ctx.clearCooldown();
        const remainingMs = Math.max(0, (err.expiresAt ?? 0) - Date.now());
        return ctx.reply(
          [
            '🚨 *KAMU MASIH BURONAN!*',
            '',
            err.bounty
              ? `Bounty 🪙 ${F.formatNumber(err.bounty.bounty_coin)} Coin masih aktif.`
              : 'Bounty masih aktif.',
            `⏳ Sisa: ${formatBountyRemaining(remainingMs)}`,
          ].join('\n')
        );
      }
      if (!rolled) await ctx.clearCooldown();
      await ctx.fail(err.message);
    }
  },
};
