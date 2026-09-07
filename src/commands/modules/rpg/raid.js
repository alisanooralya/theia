import { raidService } from '#features/rpg/raid.js';
import { userModel } from '#storage/models/index.js';
import { ButtonV2 } from '#messages/builder.js';
import { F } from '#helpers/index.js';
import SETTINGS from '#environment/settings.js';

const TZ = SETTINGS.timezone || 'Asia/Jakarta';

const dayFormatter = new Intl.DateTimeFormat('id-ID', {
  timeZone: TZ,
  weekday: 'long',
  day: '2-digit',
  month: 'short',
});

const clockFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: TZ,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

function bar(value, max, size = 10) {
  const filled = Math.max(0, Math.min(size, Math.round((value / max) * size)));
  return '█'.repeat(filled) + '░'.repeat(size - filled);
}

function formatTime(ms) {
  const hours = Math.floor(ms / (60 * 60 * 1000));
  const minutes = Math.floor((ms % (60 * 60 * 1000)) / (60 * 1000));
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}h ${hours % 24}j`;
  }
  return `${hours}j ${minutes}m`;
}

function helpText() {
  return [
    '⚔️ *RAID 2.0*',
    '',
    'Raid Boss kooperatif! Kalahkan 4 boss berurutan bareng semua player!',
    '',
    '`.raid` - Status raid & boss aktif',
    '`.raid attack` - Pakai 1 Raid Entry, battle 120 detik',
    '`.raid me` - Kontribusi & entry kamu',
    '`.raid top` - Leaderboard kontribusi',
    '`.raid bosses` - Progression boss',
    '`.raid claim` - Klaim reward boss yang kalah',
    '',
    '*Info:*',
    '- 3 Raid Entry per hari (reset tiap tanggal)',
    '- Battle auto 120 detik, HP awal = Max HP Profile',
    '- Damage kamu = kontribusi raid',
    '- Reward di-claim setelah boss kalah',
    '- Raid Coin bisa dipakai di Raid Shop',
  ].join('\n');
}

function statusText(overview) {
  if (overview.phase === 'upcoming') {
    const start = new Date(overview.upcoming.startAt);
    const dw = overview.upcoming.dailyWindow;
    return [
      '⚔️ *RAID*',
      '',
      'Raid sedang tutup.',
      `Raid berikutnya: *${overview.upcoming.name}*`,
      `Buka: *${dayFormatter.format(start)} ${clockFormatter.format(start)}*`,
      dw ? `Window harian: *${dw.start}–${dw.end}* (${dw.timeZone})` : null,
    ]
      .filter((line) => line !== null)
      .join('\n');
  }

  if (overview.phase === 'none') {
    return '⚔️ *RAID*\n\nTidak ada Raid Period aktif.';
  }

  const lines = ['⚔️ *RAID STATUS*', ''];

  if (overview.phase === 'completed') {
    lines.push('🏆 Semua boss sudah dikalahkan — Period selesai!');
  } else if (overview.activeBoss) {
    const { config, state } = overview.activeBoss;
    const remaining = Math.max(0, state?.remaining_hp ?? config.maxHp);
    const dw = overview.periodConfig.dailyWindow;
    lines.push(
      `Boss: ${config.emoji} *${config.name}* (Lv.${config.level})`,
      `HP: ${bar(remaining, config.maxHp, 12)} *${F.formatNumber(remaining)} / ${F.formatNumber(config.maxHp)}*`,
      dw ? `Window: *${dw.start}–${dw.end}* (${dw.timeZone})` : null,
      `Tutup: *${clockFormatter.format(new Date(overview.periodConfig.endAt))}* (sisa ${formatTime(overview.remainingMs)})`
    );
  }

  const defeatedCount = overview.bosses.filter(
    (b) => (b.state?.defeated_at ?? 0) > 0
  ).length;
  lines.push(
    '',
    `Progress: *${defeatedCount}/${overview.bosses.length} boss*`,
    `Entry hari ini: *${overview.entriesLeft}/${overview.periodConfig.entriesPerDay}*`,
    `Damage kamu: *${F.formatNumber(overview.myTotalDamage)}*`
  );

  return lines.filter((line) => line !== null).join('\n');
}

async function sendStatusPanel(ctx, overview) {
  const text = statusText(overview);
  const builder = new ButtonV2(ctx.sock).setBody(text);

  let hasButton = false;
  if (overview.phase === 'active' && overview.entriesLeft > 0) {
    builder.addButton('⚔️ SERANG', '.raid attack');
    hasButton = true;
  }
  if (overview.phase !== 'none') {
    builder.addButton('👤 KONTRIBUSI', '.raid me');
    builder.addButton('🏆 TOP', '.raid top');
    hasButton = true;
  }

  if (!hasButton) return ctx.reply(text);
  return builder.send(ctx.jid);
}

function battleResultText(result) {
  const { battle, boss } = result;
  const lines = [
    '⚔️ *RAID BATTLE*',
    '',
    `Boss: ${boss.emoji} *${boss.name}*`,
    `💥 Damage: *${F.formatNumber(battle.totalDamage)}*`,
    `🔥 Crit: *${battle.crits}x* | Max hit: *${F.formatNumber(battle.maxHit)}*`,
    `⏱️ Durasi: *${battle.durationSeconds}s* (${battle.rounds} ronde)`,
    '',
    `❤️ HP kamu: *${F.formatNumber(battle.playerHp)}*`,
    `👹 HP boss: *${F.formatNumber(result.bossHpAfter)} / ${F.formatNumber(boss.maxHp)}*`,
    `🎟️ Entry tersisa: *${result.entriesLeft}/${result.entriesMax}*`,
  ];

  if (battle.playerDefeated) {
    lines.push('', `💀 Kamu tumbang di ronde *${battle.rounds}*!`);
  } else if (battle.bossDefeated) {
    lines.push('', '☠️ Kamu memberikan *finishing blow*!');
  }

  return lines.join('\n');
}

function contributionText(stats) {
  const lines = [
    '👤 *RAID KONTRIBUSI*',
    '',
    `Total damage: *${F.formatNumber(stats.totalDamage)}*`,
    `Entry hari ini: *${stats.entriesLeft}/${stats.periodConfig.entriesPerDay}*`,
  ];

  if (stats.bosses.length > 0) {
    lines.push('', '*Damage per boss:*');
    for (const entry of stats.bosses) {
      const flag = entry.claimed
        ? '✅ diklaim'
        : entry.claimable
          ? '🎁 bisa claim'
          : entry.defeated
            ? '—'
            : '⚔️';
      lines.push(
        `${entry.boss.emoji} ${entry.boss.name}: *${F.formatNumber(entry.damage)}* (${flag})`
      );
    }
  } else {
    lines.push('', 'Belum ada damage di period ini. Ketik `.raid attack`!');
  }

  return lines.join('\n');
}

async function topText(limit = 10) {
  const leaderboard = await raidService.getLeaderboard(limit);
  if (leaderboard.length === 0) {
    return '🏆 *RAID TOP*\n\nBelum ada kontribusi di period ini.';
  }
  const lines = ['🏆 *RAID TOP KONTRIBUSI*', ''];
  leaderboard.forEach((row, i) => {
    lines.push(
      `${i + 1}. @${row.jid.split('@')[0]} — *${F.formatNumber(row.totalDamage)}*`
    );
  });
  return {
    text: lines.join('\n'),
    mentions: leaderboard.map((row) => row.jid),
  };
}

function bossesText(overview) {
  const activeIndex = overview.period?.current_boss ?? -1;
  const lines = [
    '⚔️ *RAID PROGRESSION*',
    '',
    `Period: *${overview.periodConfig.name}*`,
  ];

  overview.bosses.forEach((bossEntry, index) => {
    const { config, state } = bossEntry;
    const defeated = (state?.defeated_at ?? 0) > 0;
    const remaining = state ? Math.max(0, state.remaining_hp) : config.maxHp;
    const icon = defeated ? '✅' : index === activeIndex ? '⚔️' : '🔒';
    const hpText = defeated
      ? 'MATI'
      : `${F.formatNumber(remaining)}/${F.formatNumber(config.maxHp)}`;
    lines.push(`${icon} ${config.emoji} ${config.name} — ${hpText}`);
  });

  return lines.join('\n');
}

export default {
  name: 'raid',
  aliases: ['raids'],
  category: 'rpg',
  description: 'Raid Boss kooperatif',
  cooldown: 5_000,
  groupOnly: true,

  async execute(ctx) {
    const sub = ctx.args[0]?.toLowerCase() || 'status';

    try {
      await userModel.ensure(ctx.sender, { pushName: ctx.pushName });

      if (sub === 'help' || sub === 'bantuan') {
        return ctx.reply(helpText());
      }

      if (sub === 'attack' || sub === 'serang' || sub === 'fight') {
        const result = await raidService.attack(ctx.sender);
        let text = battleResultText(result);
        let mentions = [];

        if (result.defeated) {
          const defeat = await raidService.buildBossDefeatText(result);
          text = `${text}\n\n${defeat.text}`;
          mentions = defeat.mentions;
          await raidService.broadcast(ctx.sock, defeat.text, {
            exclude: [ctx.jid],
            mentions: defeat.mentions,
          });
        }

        return ctx.reply(text, { mentions });
      }

      if (sub === 'me' || sub === 'kontribusi' || sub === 'mine') {
        const stats = await raidService.getMyStats(ctx.sender);
        return ctx.reply(contributionText(stats));
      }

      if (sub === 'top' || sub === 'leaderboard') {
        const top = await topText(10);
        if (typeof top === 'string') return ctx.reply(top);
        return ctx.reply(top.text, { mentions: top.mentions });
      }

      if (sub === 'bosses' || sub === 'progression' || sub === 'progress') {
        const overview = await raidService.getOverview(ctx.sender);
        if (!overview.periodConfig) return ctx.reply(helpText());
        return ctx.reply(bossesText(overview));
      }

      if (sub === 'claim') {
        const result = await raidService.claim(ctx.sender);
        if (result.claimed.length === 0) {
          const note =
            result.pending > 0
              ? `\n\n${result.pending} boss masih hidup — reward bisa di-claim setelah boss kalah.`
              : '';
          return ctx.fail(`Tidak ada reward yang bisa diklaim.${note}`);
        }

        const lines = ['🎁 *RAID REWARD*', ''];
        for (const reward of result.claimed) {
          lines.push(
            `${reward.boss.emoji} *${reward.boss.name}* (share ${(reward.share * 100).toFixed(1)}%)`,
            `🪙 +${F.formatNumber(reward.cash)} Coin | ⭐ +${F.formatNumber(reward.exp)} EXP | 💠 +${reward.raidCoin} Raid Coin`
          );
        }
        return ctx.reply(lines.join('\n'));
      }

      const overview = await raidService.getOverview(ctx.sender);
      return sendStatusPanel(ctx, overview);
    } catch (error) {
      return ctx.fail(error.message);
    }
  },
};
