import { divergentUniverseService as du } from '#features/rpg/divergent-universe.js';
import { sendDuPlay } from '#features/rpg/divergent-universe-view.js';
import { F } from '#helpers/index.js';

const TYPE = {
  battle: 'Battle',
  event: 'Event',
  treasure: 'Treasure',
  elite: 'Elite',
  boss: 'Boss',
};

function bar(value, max, size = 10) {
  const filled = Math.max(0, Math.min(size, Math.round((value / max) * size)));
  return '█'.repeat(filled) + '░'.repeat(size - filled);
}

function effectById(id) {
  return [...du.blessings, ...du.curios].find((item) => item.id === id);
}

function pendingText(run) {
  const pending = run.state.pending;
  if (!pending) return 'Ketik `.du explore` untuk memasuki node berikutnya.';
  if (pending.type === 'path') return 'Pilih Path dengan `.du path <nama>`.';
  const title =
    pending.type === 'blessing'
      ? 'Pilih Blessing'
      : pending.type === 'curio'
        ? 'Pilih Curio'
        : `Event: ${pending.eventName}`;
  const lines = pending.options.map((option, index) => {
    const item = typeof option === 'string' ? effectById(option) : option;
    const path = item.path ? ` [${du.paths[item.path].name}]` : '';
    const error = item.error ? ' [ERROR]' : '';
    return `${index + 1}. *${item.name}*${path}${error}\n   ${item.text}`;
  });
  return `*${title}*\n${lines.join('\n')}\n\nKetik \`.du choose <nomor>\`.`;
}

async function runText(run) {
  const state = run.state;
  const node = state.nodes[state.nodeIndex];
  const path = state.path ? du.paths[state.path].name : 'Belum dipilih';
  const difficulty = state.difficulty || 'medium';
  const difficultyName = du.difficulty[difficulty]?.name || 'Medium';
  const effects = [...state.blessings, ...state.curios]
    .map(effectById)
    .filter(Boolean);
  const maxHpBonus = effects.reduce((sum, item) => sum + (item.maxHp || 0), 0);
  const maxHp = Math.max(50, state.baseMaxHp + maxHpBonus);
  const totalNodes = state.nodes.length;
  const map = state.nodes
    .map((item) => {
      if (item.cleared) return '✓';
      if (item.position === state.nodeIndex + 1) return '◆';
      if (item.type === 'boss') return 'B';
      if (item.type === 'elite') return 'E';
      return '·';
    })
    .join(' ');
  const status =
    run.status === 'active'
      ? 'AKTIF'
      : run.status === 'completed'
        ? 'SELESAI'
        : run.status === 'failed'
          ? 'GAGAL'
          : 'DITINGGALKAN';
  const reward = state.finalReward
    ? `\nReward: *${F.formatNumber(state.finalReward.cash)} cash* + *${state.finalReward.exp} EXP*`
    : '';
  const usage = await du.getUsage(run.jid);
  const tips = [];
  if (run.status === 'failed') {
    tips.push('', '*Tips:*', '- Ketik `.du play` untuk memulai run baru.');
  } else if (run.status === 'abandoned') {
    tips.push('', '*Tips:*', '- Ketik `.du play` untuk memulai run baru.');
  }
  return [
    '⌁ *DIVERGENT UNIVERSE*',
    `Status: *${status}* | Difficulty: *${difficultyName}* | Path: *${path}*`,
    `Node: *${Math.min(state.nodeIndex + 1, totalNodes)}/${totalNodes}*${node ? ` - ${TYPE[node.type]}: ${node.name}` : ''}`,
    `HP: ${bar(state.hp, maxHp)} *${state.hp}/${maxHp}*`,
    `Fragment: *${F.formatNumber(state.fragments)}*`,
    `Blessing: *${state.blessings.length}* | Curio: *${state.curios.length}*`,
    `Kesempatan: harian *${usage.dailyCount}/${du.runLimit.daily}* | mingguan *${usage.weeklyCount}/${du.runLimit.weekly}*`,
    '',
    map,
    '`✓ clear` `◆ saat ini` `E elite` `B boss`',
    '',
    state.lastResult,
    reward,
    ...tips,
    '',
    run.status === 'active'
      ? pendingText(run)
      : 'Mulai run baru dengan `.du play`.',
  ]
    .filter((line) => line !== undefined)
    .join('\n');
}

export default {
  name: 'du',
  aliases: ['divergent', 'divergentuniverse'],
  category: 'rpg',
  description: 'Jelajahi Divergent Universe interaktif',
  cooldown: 2_000,
  isProblem: true,

  async execute(ctx) {
    const sub = ctx.args[0]?.toLowerCase() || 'help';

    try {
      if (sub === 'help' || sub === 'bantuan') {
        return ctx.reply(
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
            'DU hanya tersedia di private chat.',
          ].join('\n')
        );
      }

      if (sub === 'play' || sub === 'main') {
        const difficulty = ctx.args[1]?.toLowerCase() || 'easy';
        if (!['easy', 'medium', 'hard'].includes(difficulty)) {
          return ctx.fail('Difficulty tidak valid. Pilih easy, medium, atau hard.');
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

      if (sub === 'finish' || sub === 'klaim') {
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
        const text = await runText(run);
        const msg = await ctx.reply(text);
        run.state.lastMessageKey = msg.key;
        await du.saveRun(run);
        return;
      }

      if (sub === 'abandon' || sub === 'keluar') {
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
        return ctx.reply(
          abandoned
            ? 'Run Divergent Universe dihentikan. Reward akhir hangus.'
            : 'Tidak ada run aktif untuk dihentikan.'
        );
      }

      return ctx.reply('Subcommand tidak dikenal. Ketik `.du` untuk bantuan.');
    } catch (error) {
      return ctx.fail(error.message);
    }
  },
};