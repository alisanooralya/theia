/**
 * Economy 2.0 — `.crime` command (migrated from legacy, same UI/flow).
 * Thin layer over crimeService: menu, jail gate, cooldown handling, texts.
 */
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

    const crime = getCrime(sub);
    if (!crime)
      return ctx.fail(
        [
          'Kriminal tidak ditemukan.',
          '',
          'Pilihan yang tersedia:',
          ...CRIMES.map((c) => `- \`.crime ${c.id}\` — ${c.name}`),
          '',
          'Atau ketik `.crime` untuk daftar lengkap.',
        ].join('\n')
      );

    // Cooldown dipasang saat aksi benar-benar dijalankan, lalu dilepas lagi
    // kalau aksinya gagal jalan sebelum hasil ditentukan.
    await ctx.applyCooldown();

    let rolled = false;
    try {
      const firstMsg = await ctx.reply('Kamu sedang mencoba kriminal !!');
      await F.sleep(2500);

      const result = await crimeService.commitCrime(ctx.sender, crime.id);
      rolled = true;
      const title = `${crime.emoji} *${crime.name.toUpperCase()}*`;

      if (result.outcome === 'success' || result.outcome === 'jackpot') {
        const label = result.outcome === 'jackpot' ? 'JACKPOT!' : 'Berhasil!';
        let text = `${title}\n\n${label} Kamu mendapatkan\n🪙 +${F.formatNumber(result.reward)} Coin`;
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
      if (!rolled) await ctx.clearCooldown();
      throw err;
    }
  },
};
