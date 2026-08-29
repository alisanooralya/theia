import { divergentUniverseService as du } from '#features/rpg/divergent-universe.js';
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

  const title = pending.type === 'blessing'
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

function runText(run) {
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
  const map = state.nodes.map((item) => {
    if (item.cleared) return '✓';
    if (item.position === state.nodeIndex + 1) return '◆';
    if (item.type === 'boss') return 'B';
    if (item.type === 'elite') return 'E';
    return '·';
  }).join(' ');
  const status = run.status === 'active'
    ? 'AKTIF'
    : run.status === 'completed'
      ? 'SELESAI'
      : run.status === 'failed'
        ? 'GAGAL'
        : 'DITINGGALKAN';
  const reward = state.finalReward
    ? `\nReward: *${F.formatNumber(state.finalReward.cash)} cash* + *${state.finalReward.exp} EXP*`
    : '';
  const usage = du.getUsage(run.jid);

  const tips = [];
  if (run.status === 'failed') {
    tips.push(
      '',
      '*Tips:*',
      '- Ketik `.du start [difficulty]` untuk memulai run baru.',
      '- Pilih Path yang sesuai strategimu.',
      '- Relic bisa meningkatkan stat di DU.',
    );
  } else if (run.status === 'abandoned') {
    tips.push(
      '',
      '*Tips:*',
      '- Ketik `.du start [difficulty]` untuk memulai run baru.',
    );
  }

  return [
    '⌁ *DIVERGENT UNIVERSE*',
    `Status: *${status}* | Difficulty: *${difficultyName}* | Path: *${path}*`,
    `Node: *${Math.min(state.nodeIndex + 1, totalNodes)}/${totalNodes}*${node ? ` - ${TYPE[node.type]}: ${node.name}` : ''}`,
    `HP: ${bar(state.hp, maxHp)} *${state.hp}/${maxHp}*`,
    'Stat: *murni sistem DU* (profil kamu tidak mempengaruhi)',
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
    run.status === 'active' ? pendingText(run) : 'Mulai run baru dengan `.du start`.',
  ].filter((line) => line !== undefined).join('\n');
}

function pathsText() {
  const lines = Object.entries(du.paths).map(
    ([id, path]) => `• *${path.name}* (\`${id}\`)\n  ${path.description}`
  );
  return `⌁ *PATH DIVERGENT UNIVERSE*\n\n${lines.join('\n\n')}\n\nPilih dengan \`.du path <nama>\`.`;
}

function collectionText(title, ids) {
  if (!ids.length) return `Belum memiliki ${title.toLowerCase()} pada run ini.`;
  const lines = ids.map((id, index) => {
    const item = effectById(id);
    const error = item.error ? ' [ERROR]' : '';
    return `${index + 1}. *${item.name}*${error}\n   ${item.text}`;
  });
  return `⌁ *${title.toUpperCase()}*\n\n${lines.join('\n')}`;
}

function rewardText() {
  const reward = du.finalReward;
  const difficulties = du.difficulty;
  const difficultyLines = Object.entries(difficulties).map(
    ([key, config]) => `- *${config.name}*: ${config.nodeCount} node - Reward ×${config.rewardMultiplier}`
  );
  return [
    '⌁ *HADIAH CLEAR DU*',
    '',
    '*Formula dasar:*',
    `Cash/koin: *${F.formatNumber(reward.baseCash)} + (Fragment × ${reward.cashPerFragment})*`,
    `EXP: *${reward.baseExp} + (jumlah Blessing × ${reward.expPerBlessing})*`,
    'Silver Coin menambah total cash akhir sebesar 30%.',
    '',
    '*Multiplier berdasarkan Difficulty:*',
    ...difficultyLines,
    '',
    '*Syarat:* seluruh node harus clear dan boss terakhir harus dikalahkan.',
    'Kalah hingga HP habis sebelum node terakhir tidak memberikan cash/koin maupun EXP.',
    'Stat profil kamu (`.profile`: ATK/DEF/HP/SPD) tidak mempengaruhi hasil di sini — hanya stat dasar dari sistem Divergent Universe yang dipakai.',
    'Fragment adalah currency run dan tidak masuk ke wallet secara langsung.',
    '',
    `Batas bermain: *${du.runLimit.daily}x per hari* dan *${du.runLimit.weekly}x per minggu*.`
  ].join('\n');
}

async function sendOrEdit(ctx, run, text) {
  const state = run.state;
  const clearedCount = state.nodes.filter((n) => n.cleared).length;

  if (clearedCount > 0 && clearedCount % 3 === 0) {
    const msg = await ctx.reply(text);
    state.lastMessageKey = msg.key;
    du.saveRun(run);
    return;
  }

  const lastKey = state.lastMessageKey;
  if (lastKey) {
    try {
      await ctx.sock.sendMessage(ctx.jid, { text, edit: lastKey });
      return;
    } catch {}
  }
  const msg = await ctx.reply(text);
  state.lastMessageKey = msg.key;
  du.saveRun(run);
}

export default {
  name: 'du',
  aliases: ['divergent', 'divergentuniverse'],
  category: 'rpg',
  description: 'Jelajahi Divergent Universe',
  cooldown: 2_000,

  async execute(ctx) {
    if (!ctx.isPrivate) {
      return ctx.fail(
        'Divergent Universe hanya bisa dimainkan di private chat.'
      );
    }
    const sub = ctx.args[0]?.toLowerCase() || 'help';

    try {
      if (sub === 'help' || sub === 'bantuan') {
        return ctx.reply([
          '⌁ *DIVERGENT UNIVERSE - BANTUAN*',
          '',
          '`.du start [difficulty]` - buat run baru (easy/medium/hard)',
          '`.du paths` - lihat semua Path',
          '`.du path <nama>` - pilih Path',
          '`.du explore` - selesaikan node saat ini',
          '`.du choose <nomor>` - ambil pilihan',
          '`.du status` - lihat progres dan peta',
          '`.du blessings` - lihat Blessing milikmu',
          '`.du curios` - lihat Curio milikmu',
          '`.du reward` - lihat formula hadiah clear',
          '`.du limit` - lihat sisa kesempatan bermain',
          '`.du abandon` - hentikan run',
          '',
          '*Difficulty:*',
          '- Easy: 8 node (3 battle, 2 event, 2 treasure, 1 elite, 0 boss) - Reward ×0.6',
          '- Medium: 16 node (6 battle, 3 event, 3 treasure, 2 elite, 2 boss) - Reward ×1',
          '- Hard: 22 node (8 battle, 4 event, 4 treasure, 3 elite, 3 boss) - Reward ×1.5',
          '',
          'Cash/koin dan EXP hanya diberikan setelah semua node clear.',
          'Stat profil kamu (`.profile`: ATK/DEF/HP/SPD) TIDAK mempengaruhi DU — fitur ini hanya menggunakan stat dasar yang diberikan sistem Divergent Universe.',
          `Setiap pemain hanya dapat memulai ${du.runLimit.daily} run per hari dan ${du.runLimit.weekly} run per minggu.`,
          'DU hanya tersedia di private chat.',
        ].join('\n'));
      }

      if (sub === 'paths' || sub === 'pathlist') return ctx.reply(pathsText());
      if (sub === 'reward' || sub === 'hadiah') return ctx.reply(rewardText());
      if (sub === 'limit' || sub === 'kuota') {
        const usage = du.getUsage(ctx.sender);
        return ctx.reply([
          '⌁ *LIMIT DIVERGENT UNIVERSE*',
          '',
          `Harian: *${usage.dailyCount}/${du.runLimit.daily}* digunakan, *${usage.dailyRemaining}* tersisa.`,
          `Mingguan: *${usage.weeklyCount}/${du.runLimit.weekly}* digunakan, *${usage.weeklyRemaining}* tersisa.`,
          '',
          'Limit harian reset pukul 00.00.',
          'Limit mingguan reset Senin pukul 00.00.',
          'Run yang kalah atau ditinggalkan tetap dihitung.',
        ].join('\n'));
      }

      if (sub === 'start' || sub === 'mulai') {
        const difficulty = ctx.args[1]?.toLowerCase() || 'easy';
        if (!['easy', 'medium', 'hard'].includes(difficulty)) {
          return ctx.fail('Difficulty tidak valid. Pilih easy, medium, atau hard.');
        }
        const run = du.start(ctx.sender, ctx.jid, { pushName: ctx.pushName }, difficulty);
        const text = runText(run);
        const msg = await ctx.reply(text);
        run.state.lastMessageKey = msg.key;
        du.saveRun(run);
        return;
      }

      if (sub === 'path') {
        if (!ctx.args[1]) return ctx.reply(pathsText());
        const run = du.choosePath(ctx.sender, ctx.jid, ctx.args[1]);
        await sendOrEdit(ctx, run, runText(run));
        return;
      }

      if (sub === 'explore' || sub === 'jelajah' || sub === 'next') {
        const run = du.explore(ctx.sender, ctx.jid);
        await sendOrEdit(ctx, run, runText(run));
        return;
      }

      if (sub === 'choose' || sub === 'pilih') {
        const run = du.choose(ctx.sender, ctx.jid, ctx.args[1]);
        await sendOrEdit(ctx, run, runText(run));
        return;
      }

      if (sub === 'abandon' || sub === 'keluar') {
        const abandoned = du.abandon(ctx.sender, ctx.jid);
        return ctx.reply(abandoned
          ? 'Run Divergent Universe dihentikan. Reward akhir hangus.'
          : 'Tidak ada run aktif untuk dihentikan.');
      }

      const run = du.getRun(ctx.sender, ctx.jid);
      if (!run) {
        return ctx.fail('Tidak ada run aktif. Ketik `.du start` untuk memulai.');
      }
      if (run.status !== 'active') {
        return ctx.fail('Run sudah selesai atau gagal. Ketik `.du start` untuk memulai run baru.');
      }
      if (sub === 'blessings' || sub === 'blessing') {
        return ctx.reply(collectionText('Blessing', run.state.blessings));
      }
      if (sub === 'curios' || sub === 'curio') {
        return ctx.reply(collectionText('Curio', run.state.curios));
      }
      if (sub === 'status' || sub === 'progres') {
        return ctx.reply(runText(run));
      }
      return ctx.reply('Subcommand tidak dikenal. Ketik `.du` untuk bantuan.');
    } catch (error) {
      return ctx.fail(error.message);
    }
  },
};
