import { divergentUniverseService as du } from '#features/rpg/divergent-universe.js';
import { sendDuPlay } from '#features/rpg/divergent-universe-view.js';

export default {
  name: 'du',
  aliases: ['divergent', 'divergentuniverse'],
  category: 'rpg',
  description: 'Jelajahi Divergent Universe interaktif',
  cooldown: 120_000,
  isProblem: true,
  privateOnly: true,

  async execute(ctx) {
    const sub = ctx.args[0]?.toLowerCase() || 'help';

    try {
      if (sub === 'help') {
        return ctx.fail(
          [
            '⌁ *DIVERGENT UNIVERSE*',
            '',
            '`.du play [easy/medium/hard]` - mainkan DU interaktif',
            '`.du finish <token>` - klaim hasil setelah game selesai',
            '`.du abandon` - hentikan run saat ini',
            '',
            'Cara main:',
            '1. Ketik `.du play` untuk mulai game interaktif',
            '2. Pilih Path, lalu tap EXPLORE untuk maju',
            '3. Pilih Blessing, Curio, atau opsi Event',
            '4. Saat game selesai, tap tombol Salin di panel',
            '5. Kirim `.du finish <token>` ke chat untuk klaim reward',
            '',
            'Blessing & Curio bisa dilihat dengan menekan kolomnya di panel game.',
            '',
            '*Difficulty:*',
            '- Easy: 8 node - Reward ×0.6',
            '- Medium: 16 node - Reward ×1',
            '- Hard: 22 node - Reward ×1.5',
            '',
            `Batas: *${du.runLimit.daily}x/hari* *${du.runLimit.weekly}x/minggu*`,
          ].join('\n')
        );
      }

      if (sub === 'play') {
        const difficulty = ctx.args[1]?.toLowerCase() || 'easy';
        if (!['easy', 'medium', 'hard'].includes(difficulty)) {
          return ctx.fail(
            'Difficulty tidak valid. Pilih easy, medium, atau hard.'
          );
        }
        const run = await du.startPlay(
          ctx.sender,
          ctx.jid,
          { pushName: ctx.pushName },
          difficulty
        );
        const msgId = await sendDuPlay(ctx, run);
        run.state.playMsgId = msgId || '';
        await du.saveRun(run);
        return;
      }

      if (sub === 'finish') {
        const token = ctx.args[1];
        if (!token) {
          return ctx.fail('Kirim token hasil dengan `.du finish <token>`.');
        }
        const run = await du.finishPlay(ctx.sender, ctx.jid, token);
        const playId = run.state?.playMsgId;
        if (playId) {
          try {
            await ctx.sock.sendMessage(ctx.jid, {
              delete: { remoteJid: ctx.jid, fromMe: true, id: playId },
            });
          } catch {}
        }

        const msg = await ctx.reply(run.state.lastResult);
        run.state.lastMessageKey = msg.key;
        await du.saveRun(run);
        return;
      }

      if (sub === 'abandon') {
        const abandoned = await du.abandon(ctx.sender, ctx.jid);
        const run = await du.getRun(ctx.sender, ctx.jid);
        const playId = run?.state?.playMsgId;
        if (playId) {
          try {
            await ctx.sock.sendMessage(ctx.jid, {
              delete: { remoteJid: ctx.jid, fromMe: true, id: playId },
            });
          } catch {}
        }
        return ctx.fail(
          abandoned
            ? 'Run Divergent Universe dihentikan. Reward akhir hangus.'
            : 'Tidak ada run aktif untuk dihentikan.'
        );
      }

      return ctx.fail('Subcommand tidak dikenal. Ketik `.du` untuk bantuan.');
    } catch (error) {
      return ctx.fail(error.message);
    }
  },
};
