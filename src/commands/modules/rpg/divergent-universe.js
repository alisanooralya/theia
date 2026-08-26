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
  const effects = [...state.blessings, ...state.curios]
    .map(effectById)
    .filter(Boolean);
  const maxHpBonus = effects.reduce((sum, item) => sum + (item.maxHp || 0), 0);
  const maxHp = Math.max(50, state.baseMaxHp + maxHpBonus);
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

  return [
    '⌁ *DIVERGENT UNIVERSE*',
    `Status: *${status}* | Path: *${path}*`,
    `Node: *${Math.min(state.nodeIndex + 1, 16)}/16*${node ? ` - ${TYPE[node.type]}: ${node.name}` : ''}`,
    `HP: ${bar(state.hp, maxHp)} *${state.hp}/${maxHp}*`,
    `Fragment: *${F.formatNumber(state.fragments)}*`,
    `Blessing: *${state.blessings.length}* | Curio: *${state.curios.length}*`,
    '',
    map,
    '`✓ clear` `◆ saat ini` `E elite` `B boss`',
    '',
    state.lastResult,
    reward,
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

export default {
  name: 'du',
  aliases: ['divergent', 'divergentuniverse'],
  category: 'rpg',
  description: 'Jelajahi Divergent Universe dalam 16 node',
  cooldown: 2_000,

  async execute(ctx) {
    const sub = ctx.args[0]?.toLowerCase() || 'status';

    try {
      if (sub === 'help' || sub === 'bantuan') {
        return ctx.reply([
          '⌁ *DIVERGENT UNIVERSE - BANTUAN*',
          '',
          '`.du start` - buat run baru',
          '`.du paths` - lihat semua Path',
          '`.du path <nama>` - pilih Path',
          '`.du explore` - selesaikan node saat ini',
          '`.du choose <nomor>` - ambil pilihan',
          '`.du status` - lihat progres dan peta',
          '`.du blessings` - lihat Blessing milikmu',
          '`.du curios` - lihat Curio milikmu',
          '`.du abandon` - hentikan run',
          '',
          'Run memiliki 16 node: 6 battle, 3 event, 3 treasure, 2 elite, dan 2 boss.',
        ].join('\n'));
      }

      if (sub === 'paths' || sub === 'pathlist') return ctx.reply(pathsText());

      if (sub === 'start' || sub === 'mulai') {
        const run = du.start(ctx.sender, { pushName: ctx.pushName });
        return ctx.reply(runText(run));
      }

      if (sub === 'path') {
        if (!ctx.args[1]) return ctx.reply(pathsText());
        const run = du.choosePath(ctx.sender, ctx.args[1]);
        return ctx.reply(runText(run));
      }

      if (sub === 'explore' || sub === 'jelajah' || sub === 'next') {
        const run = du.explore(ctx.sender);
        return ctx.reply(runText(run));
      }

      if (sub === 'choose' || sub === 'pilih') {
        const run = du.choose(ctx.sender, ctx.args[1]);
        return ctx.reply(runText(run));
      }

      if (sub === 'abandon' || sub === 'keluar') {
        const abandoned = du.abandon(ctx.sender);
        return ctx.reply(abandoned
          ? 'Run Divergent Universe dihentikan. Reward akhir hangus.'
          : 'Tidak ada run aktif untuk dihentikan.');
      }

      const run = du.getRun(ctx.sender);
      if (!run) {
        return ctx.reply('Belum ada run Divergent Universe. Ketik `.du start` untuk memulai.');
      }
      if (sub === 'blessings' || sub === 'blessing') {
        return ctx.reply(collectionText('Blessing', run.state.blessings));
      }
      if (sub === 'curios' || sub === 'curio') {
        return ctx.reply(collectionText('Curio', run.state.curios));
      }
      if (sub !== 'status') {
        return ctx.reply('Subcommand tidak dikenal. Ketik `.du help` untuk bantuan.');
      }
      return ctx.reply(runText(run));
    } catch (error) {
      return ctx.fail(error.message);
    }
  },
};
